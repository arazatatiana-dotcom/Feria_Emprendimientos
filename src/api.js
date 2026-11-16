'use strict';
const DB = require('./db');
const V = require('./ventas');
const mailer = require('./mailer');
const { router } = require('./http');
const { readSheet, pick } = require('./xlsx');
const U = require('./util');
const { fail, cents, money } = U;

const nom = (a) => DB.get().dialect === 'sqlite' ? `(${a}.nombres || ' ' || ${a}.apellidos)` : `(${a}.nombres + ' ' + ${a}.apellidos)`;
const like = (s) => `%${String(s || '').trim().replace(/[%_[\]]/g, '')}%`;

// ================= Autenticación =================
async function auth(req) {
  const h = req.headers.authorization || '';
  const p = U.readToken(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!p) fail('Sesión expirada. Ingrese nuevamente.', 401);
  const u = await DB.get().get(`SELECT u.id, u.cedula, u.nombres, u.apellidos, u.email, u.rol, u.activo, u.es_comprador, u.debe_cambiar,
      u.pass_hash, e.id AS emprendimiento_id, e.nombre_comercial
    FROM usuarios u LEFT JOIN emprendimientos e ON e.usuario_id = u.id WHERE u.id = @id`, { id: p.uid });
  if (!u || !u.activo) fail('Usuario inactivo', 401);
  // La sesión deja de valer si la contraseña se cambió o se reseteó después de emitir el token
  if (p.pv !== U.passVersion(u.pass_hash)) fail('Sesión expirada. Ingrese nuevamente.', 401);
  delete u.pass_hash;
  req.user = u;
}
const role = (...roles) => async (req) => { if (!roles.includes(req.user.rol)) fail('No autorizado', 403); };
const emprendedor = async (req) => { if (!req.user.emprendimiento_id) fail('Solo para emprendedores', 403); };
const ADMIN = role('admin', 'superadmin');
const SUPER = role('superadmin');

const loginFails = new Map();
router.post('/api/login', async (req) => {
  const cedula = U.normCedula(req.body.cedula);
  const f = loginFails.get(cedula);
  if (f && f.until > Date.now()) fail('Demasiados intentos. Espere 5 minutos.', 429);
  const u = await DB.get().get('SELECT id, pass_hash, activo FROM usuarios WHERE cedula = @c', { c: cedula });
  if (!u || !u.activo || !U.verify(req.body.clave, u.pass_hash)) {
    // Si hubo un bloqueo y ya venció, el contador vuelve a empezar; si no, se acumula
    const n = (f && f.until && f.until <= Date.now() ? 0 : (f?.n || 0)) + 1;
    loginFails.set(cedula, { n, until: n >= 8 ? Date.now() + 5 * 60e3 : 0 });
    fail('Cédula o contraseña incorrecta', 401);
  }
  loginFails.delete(cedula);
  return { token: U.signToken({ uid: u.id, pv: U.passVersion(u.pass_hash) }) };
});

router.get('/api/me', auth, async (req) => {
  const db = DB.get();
  const u = req.user;
  const s = await db.get('SELECT saldo_asignado, saldo_usado, fecha_ingreso, pin_hash, pin_temporal FROM usuarios WHERE id = @id', { id: u.id });
  const cfg = await V.getConfig();
  const pendientes = await db.get(`SELECT COUNT(*) AS n FROM ventas WHERE comprador_id = @id AND estado = 'por_confirmar'`, { id: u.id });
  return {
    id: u.id, cedula: u.cedula, nombres: u.nombres, apellidos: u.apellidos, email: u.email, rol: u.rol,
    es_comprador: !!u.es_comprador, debe_cambiar: !!u.debe_cambiar, tiene_pin: !!s.pin_hash, pin_temporal: !!s.pin_temporal,
    emprendimiento: u.emprendimiento_id ? { id: u.emprendimiento_id, nombre_comercial: u.nombre_comercial } : null,
    saldo: { asignado: Number(s.saldo_asignado), usado: Number(s.saldo_usado), disponible: money(cents(s.saldo_asignado) - cents(s.saldo_usado)) },
    por_confirmar: pendientes.n,
    evento: { nombre: cfg.nombre_evento, fecha: cfg.fecha_evento, hora: cfg.hora_evento, minutos_confirmacion: Number(cfg.minutos_confirmacion) },
    correo_activo: mailer.enabled(),
  };
});

const validClave = (c) => typeof c === 'string' && c.length >= 6;
router.post('/api/me/clave', auth, async (req) => {
  const db = DB.get();
  const u = await db.get('SELECT pass_hash FROM usuarios WHERE id = @id', { id: req.user.id });
  if (!U.verify(req.body.actual, u.pass_hash)) fail('La contraseña actual no es correcta');
  if (!validClave(req.body.nueva)) fail('La nueva contraseña debe tener al menos 6 caracteres');
  if (req.body.nueva === req.body.actual) fail('La nueva contraseña debe ser distinta');
  const h = U.hash(req.body.nueva);
  await db.run('UPDATE usuarios SET pass_hash=@h, clave_temporal=NULL, debe_cambiar=0 WHERE id=@id', { id: req.user.id, h });
  // Las demás sesiones quedan cerradas; esta recibe un token nuevo
  return { token: U.signToken({ uid: req.user.id, pv: U.passVersion(h) }) };
});

router.post('/api/me/pin', auth, async (req) => {
  const db = DB.get();
  const u = await db.get('SELECT pass_hash FROM usuarios WHERE id = @id', { id: req.user.id });
  if (!U.verify(req.body.clave, u.pass_hash)) fail('Contraseña incorrecta');
  const pin = String(req.body.pin || '');
  if (!/^\d{4}$/.test(pin)) fail('El PIN debe tener 4 dígitos');
  if (/^(\d)\1{3}$/.test(pin) || ['1234', '4321', '0123'].includes(pin)) fail('Elija un PIN menos obvio');
  await db.run('UPDATE usuarios SET pin_hash=@h, pin_temporal=NULL WHERE id=@id', { id: req.user.id, h: U.hash(pin) });
});

// ================= Comprador =================
router.get('/api/catalogo', auth, async () => {
  return DB.get().query(`SELECT p.id, p.nombre, p.descripcion, p.precio, p.stock, e.id AS emprendimiento_id, e.nombre_comercial
    FROM productos p JOIN emprendimientos e ON e.id = p.emprendimiento_id
    WHERE p.activo = 1 AND e.activo = 1 ORDER BY e.nombre_comercial, p.nombre`);
});

async function listaVentas(where, params, limit = 500) {
  const db = DB.get();
  const rows = await db.query(`SELECT v.id, v.total, v.total_saldo, v.estado, v.estado_entrega, v.fecha_limite_entrega, v.expira_confirmacion,
      v.confirmada_por, v.motivo_anulacion, v.creado, v.actualizado, v.comprador_id, v.emprendimiento_id, e.nombre_comercial,
      c.cedula AS comprador_cedula, ${nom('c')} AS comprador_nombre
    FROM ventas v JOIN emprendimientos e ON e.id = v.emprendimiento_id JOIN usuarios c ON c.id = v.comprador_id
    WHERE ${where} ORDER BY v.id DESC`, params);
  const out = rows.slice(0, limit);
  if (!out.length) return out;
  const ids = out.map(r => r.id);
  const inList = ids.join(','); // enteros de la base de datos, seguros
  const det = await db.query(`SELECT venta_id, descripcion, cantidad, subtotal, entrega_posterior FROM venta_detalle WHERE venta_id IN (${inList}) ORDER BY id`);
  const pag = await db.query(`SELECT venta_id, forma, monto FROM venta_pagos WHERE venta_id IN (${inList}) ORDER BY id`);
  const by = new Map(out.map(r => [r.id, Object.assign(r, { detalle: [], pagos: [] })]));
  det.forEach(d => by.get(d.venta_id).detalle.push(d));
  pag.forEach(p => by.get(p.venta_id).pagos.push(p));
  return out;
}

router.get('/api/mis-compras', auth, async (req) => listaVentas('v.comprador_id = @id', { id: req.user.id }));

router.post('/api/ventas/:id/confirmar', auth, async (req) => V.confirmar(req.user, Number(req.params.id), { pin: req.body.pin }));
router.post('/api/ventas/:id/rechazar', auth, async (req) => {
  const v = await V.loadVenta(DB.get(), Number(req.params.id));
  if (!v || v.comprador_id !== req.user.id) fail('Venta no encontrada', 404);
  return V.anular(req.user, v.id, 'Rechazada por el comprador');
});

router.get('/api/ventas/:id', auth, async (req) => {
  const db = DB.get();
  const v = await V.loadVenta(db, Number(req.params.id));
  const u = req.user;
  if (!v || !(['admin', 'superadmin'].includes(u.rol) || v.comprador_id === u.id || v.emprendedor_usuario_id === u.id)) fail('Venta no encontrada', 404);
  v.historial = await db.query(`SELECT h.accion, h.detalle, h.fecha, ${nom('u')} AS usuario FROM venta_historial h
    LEFT JOIN usuarios u ON u.id = h.usuario_id WHERE h.venta_id = @id ORDER BY h.id`, { id: v.id });
  v.historial.forEach(h => { try { h.detalle = h.detalle ? JSON.parse(h.detalle) : null; } catch { /* texto */ } });
  delete v.comprador_email; delete v.vendedor_email;
  return v;
});

// ================= Emprendedor =================
router.get('/api/productos', auth, emprendedor, async (req) =>
  DB.get().query('SELECT id, nombre, descripcion, precio, stock, activo FROM productos WHERE emprendimiento_id = @e ORDER BY activo DESC, nombre', { e: req.user.emprendimiento_id }));

function validarProducto(b) {
  const nombre = String(b.nombre || '').trim();
  if (nombre.length < 2) fail('Ingrese el nombre del producto');
  const precio = Number(b.precio);
  if (!Number.isFinite(precio) || precio < 0 || precio > 10000) fail('Precio inválido');
  const stock = Number(b.stock);
  if (!Number.isInteger(stock) || stock < 0) fail('Stock inválido (número entero, 0 o más)');
  return { nombre: nombre.slice(0, 150), descripcion: String(b.descripcion || '').trim().slice(0, 500) || null, precio: money(cents(precio)), stock, activo: b.activo === false || b.activo === 0 ? 0 : 1 };
}
router.post('/api/productos', auth, emprendedor, async (req) => {
  const p = validarProducto(req.body);
  const id = await DB.get().insert('productos', { ...p, emprendimiento_id: req.user.emprendimiento_id, creado: new Date() });
  return { id };
});
router.put('/api/productos/:id', auth, emprendedor, async (req) => {
  const p = validarProducto(req.body);
  const r = await DB.get().run(`UPDATE productos SET nombre=@nombre, descripcion=@descripcion, precio=@precio, stock=@stock, activo=@activo
    WHERE id=@id AND emprendimiento_id=@e`, { ...p, id: Number(req.params.id), e: req.user.emprendimiento_id });
  if (!r.changes) fail('Producto no encontrado', 404);
});

router.get('/api/compradores', auth, emprendedor, async (req) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) return [];
  const rows = await DB.get().query(`SELECT id, cedula, nombres, apellidos, es_comprador, saldo_asignado, saldo_usado, pin_hash
    FROM usuarios WHERE activo = 1 AND id <> @me AND (cedula LIKE @q OR ${nom('usuarios')} LIKE @q OR (apellidos + ' ' + nombres) LIKE @q)
    ORDER BY apellidos, nombres`.replace("(apellidos + ' ' + nombres)", DB.get().dialect === 'sqlite' ? "(apellidos || ' ' || nombres)" : "(apellidos + ' ' + nombres)"),
  { q: like(q), me: req.user.id });
  return rows.slice(0, 15).map(r => ({
    id: r.id, cedula: r.cedula, nombre: `${r.nombres} ${r.apellidos}`.trim(), tiene_pin: !!r.pin_hash,
    saldo_disponible: r.es_comprador ? money(cents(r.saldo_asignado) - cents(r.saldo_usado)) : 0,
  }));
});

router.post('/api/ventas', auth, emprendedor, async (req) => V.crear(req.user, req.body));
router.put('/api/ventas/:id', auth, emprendedor, async (req) => V.editar(req.user, Number(req.params.id), req.body));
router.post('/api/ventas/:id/anular', auth, async (req) => {
  const v = await V.loadVenta(DB.get(), Number(req.params.id));
  if (!v) fail('Venta no encontrada', 404);
  if (v.emprendedor_usuario_id !== req.user.id && req.user.rol !== 'superadmin') fail('Solo el emprendedor puede anular sus ventas', 403);
  return V.anular(req.user, v.id, req.body.motivo);
});
router.post('/api/ventas/:id/entregar', auth, async (req) => V.marcarEntregado(req.user, Number(req.params.id)));
router.post('/api/ventas/:id/reenviar', auth, async (req) => {
  const v = await V.loadVenta(DB.get(), Number(req.params.id));
  const u = req.user;
  if (!v || !(v.emprendedor_usuario_id === u.id || v.comprador_id === u.id || ['admin', 'superadmin'].includes(u.rol))) fail('Venta no encontrada', 404);
  if (!v.comprador_email) fail('El comprador no tiene correo registrado');
  await mailer.queue(v.comprador_email, `Comprobante de compra N.º ${v.id} - ${v.nombre_comercial}`, mailer.ventaHtml(v, v.estado === 'anulada' ? 'Venta anulada' : 'Comprobante de compra'));
  return { ok: true, para: v.comprador_email.replace(/^(.{2}).*(@.*)$/, '$1***$2') };
});

router.get('/api/mis-ventas', auth, emprendedor, async (req) => {
  const ventas = await listaVentas('v.emprendimiento_id = @e', { e: req.user.emprendimiento_id }, 2000);
  const ok = ventas.filter(v => v.estado === 'confirmada');
  const sum = (arr, f) => money(arr.reduce((a, v) => a + cents(f(v)), 0));
  const porForma = (f) => sum(ok, v => v.pagos.filter(p => p.forma === f).reduce((a, p) => a + Number(p.monto), 0));
  return {
    resumen: { ventas: ok.length, total: sum(ok, v => v.total), saldo: porForma('saldo'), efectivo: porForma('efectivo'), transferencia: porForma('transferencia'),
      pendientes_entrega: ok.filter(v => v.estado_entrega === 'pendiente').length, por_confirmar: ventas.filter(v => v.estado === 'por_confirmar').length },
    ventas,
  };
});

// ================= Administración =================
const sumForma = (f) => `SUM(CASE WHEN p.forma='${f}' THEN p.monto ELSE 0 END)`;

router.get('/api/admin/resumen', auth, ADMIN, async () => {
  const db = DB.get();
  const tot = await db.get(`SELECT COUNT(*) AS ventas, COALESCE(SUM(total),0) AS total, COUNT(DISTINCT comprador_id) AS compradores,
      SUM(CASE WHEN estado_entrega='pendiente' THEN 1 ELSE 0 END) AS pendientes_entrega FROM ventas WHERE estado='confirmada'`);
  const formas = await db.get(`SELECT COALESCE(${sumForma('saldo')},0) AS saldo, COALESCE(${sumForma('efectivo')},0) AS efectivo, COALESCE(${sumForma('transferencia')},0) AS transferencia
    FROM venta_pagos p JOIN ventas v ON v.id = p.venta_id WHERE v.estado='confirmada'`);
  const estados = await db.query(`SELECT estado, COUNT(*) AS n FROM ventas GROUP BY estado`);
  const saldos = await db.get(`SELECT COUNT(*) AS compradores, COALESCE(SUM(saldo_asignado),0) AS asignado, COALESCE(SUM(saldo_usado),0) AS usado FROM usuarios WHERE es_comprador=1 AND activo=1`);
  const porEmp = await db.query(`SELECT e.id, e.nombre_comercial, ${nom('u')} AS emprendedor,
      COUNT(DISTINCT v.id) AS ventas, COALESCE(${sumForma('saldo')},0) AS saldo, COALESCE(${sumForma('efectivo')},0) AS efectivo,
      COALESCE(${sumForma('transferencia')},0) AS transferencia
    FROM emprendimientos e JOIN usuarios u ON u.id = e.usuario_id
    LEFT JOIN ventas v ON v.emprendimiento_id = e.id AND v.estado='confirmada'
    LEFT JOIN venta_pagos p ON p.venta_id = v.id
    GROUP BY e.id, e.nombre_comercial, u.nombres, u.apellidos ORDER BY e.nombre_comercial`);
  porEmp.forEach(r => { r.total = money(cents(r.saldo) + cents(r.efectivo) + cents(r.transferencia)); });
  porEmp.sort((a, b) => b.total - a.total);
  const ultimas = await listaVentas('1=1', {}, 25);
  return { totales: { ...tot, ...formas, estados: Object.fromEntries(estados.map(e => [e.estado, e.n])) }, saldos, por_emprendimiento: porEmp, ultimas, generado: new Date().toISOString() };
});

router.get('/api/admin/ventas', auth, ADMIN, async (req) => {
  const w = ['1=1'], p = {};
  if (req.query.estado) { w.push('v.estado = @estado'); p.estado = req.query.estado; }
  if (req.query.entrega) { w.push('v.estado_entrega = @ent'); p.ent = req.query.entrega; }
  if (req.query.emprendimiento_id) { w.push('v.emprendimiento_id = @emp'); p.emp = Number(req.query.emprendimiento_id); }
  if (req.query.q) { w.push(`(c.cedula LIKE @q OR ${nom('c')} LIKE @q OR CAST(v.id AS VARCHAR(20)) = @qid)`); p.q = like(req.query.q); p.qid = String(req.query.q).trim(); }
  return listaVentas(w.join(' AND '), p, 400);
});

router.get('/api/admin/emprendimientos', auth, ADMIN, async () =>
  DB.get().query('SELECT id, nombre_comercial FROM emprendimientos ORDER BY nombre_comercial'));

async function cxcRows() {
  return DB.get().query(`SELECT c.cedula, c.nombres, c.apellidos, c.fecha_ingreso, c.saldo_asignado, COUNT(DISTINCT v.id) AS compras, SUM(v.total_saldo) AS por_cobrar
    FROM ventas v JOIN usuarios c ON c.id = v.comprador_id
    WHERE v.estado='confirmada' AND v.total_saldo > 0
    GROUP BY c.cedula, c.nombres, c.apellidos, c.fecha_ingreso, c.saldo_asignado ORDER BY c.apellidos, c.nombres`);
}
router.get('/api/admin/cxc', auth, ADMIN, async () => cxcRows());

async function liquidacionRows() {
  const r = await DB.get().query(`SELECT e.nombre_comercial, u.cedula, ${nom('u')} AS emprendedor, COUNT(DISTINCT v.id) AS ventas,
      COALESCE(${sumForma('saldo')},0) AS saldo, COALESCE(${sumForma('efectivo')},0) AS efectivo, COALESCE(${sumForma('transferencia')},0) AS transferencia
    FROM emprendimientos e JOIN usuarios u ON u.id = e.usuario_id
    LEFT JOIN ventas v ON v.emprendimiento_id = e.id AND v.estado='confirmada'
    LEFT JOIN venta_pagos p ON p.venta_id = v.id
    GROUP BY e.nombre_comercial, u.cedula, u.nombres, u.apellidos ORDER BY e.nombre_comercial`);
  r.forEach(x => { x.total = money(cents(x.saldo) + cents(x.efectivo) + cents(x.transferencia)); });
  return r;
}
router.get('/api/admin/liquidacion', auth, ADMIN, async () => liquidacionRows());

// Exportación CSV (separador ; para Excel en español)
function csv(headers, rows) {
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    let s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    // Evita que Excel interprete como fórmula un texto escrito por usuarios (=, +, -, @, tab, retorno)
    if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [headers.map(h => h[1]).join(';'), ...rows.map(r => headers.map(h => cell(r[h[0]])).join(';'))].join('\r\n');
}
const fechaLocal = (iso) => iso ? new Date(iso).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' }) : '';

router.get('/api/admin/export/:tipo', auth, ADMIN, async (req) => {
  const db = DB.get();
  let body;
  const t = req.params.tipo;
  if (t === 'cxc') {
    body = csv([['cedula', 'Cédula'], ['apellidos', 'Apellidos'], ['nombres', 'Nombres'], ['fecha_ingreso', 'Fecha ingreso'], ['saldo_asignado', 'Saldo asignado'], ['compras', 'N.º compras'], ['por_cobrar', 'Valor por cobrar']], await cxcRows());
  } else if (t === 'liquidacion') {
    body = csv([['nombre_comercial', 'Emprendimiento'], ['emprendedor', 'Emprendedor'], ['cedula', 'Cédula'], ['ventas', 'N.º ventas'], ['saldo', 'Saldo (pagará la empresa)'], ['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['total', 'Total vendido']], await liquidacionRows());
  } else if (t === 'ventas' || t === 'detalle') {
    const ventas = await listaVentas('1=1', {}, 100000);
    if (t === 'ventas') {
      body = csv([['id', 'N.º'], ['fecha', 'Fecha'], ['nombre_comercial', 'Emprendimiento'], ['comprador_cedula', 'Cédula comprador'], ['comprador_nombre', 'Comprador'], ['total', 'Total'],
        ['saldo', 'Saldo'], ['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['estado', 'Estado'], ['estado_entrega', 'Entrega'], ['motivo_anulacion', 'Motivo anulación']],
      ventas.map(v => ({ ...v, fecha: fechaLocal(v.creado), ...Object.fromEntries(V.FORMAS.map(f => [f, money(v.pagos.filter(p => p.forma === f).reduce((a, p) => a + cents(p.monto), 0))])) })));
    } else {
      const rows = [];
      ventas.forEach(v => v.detalle.forEach(d => rows.push({ id: v.id, fecha: fechaLocal(v.creado), nombre_comercial: v.nombre_comercial, comprador_cedula: v.comprador_cedula, comprador_nombre: v.comprador_nombre, estado: v.estado, ...d, entrega_posterior: d.entrega_posterior ? 'Sí' : 'No' })));
      body = csv([['id', 'N.º venta'], ['fecha', 'Fecha'], ['nombre_comercial', 'Emprendimiento'], ['comprador_cedula', 'Cédula'], ['comprador_nombre', 'Comprador'], ['descripcion', 'Producto'], ['cantidad', 'Cantidad'], ['subtotal', 'Subtotal'], ['entrega_posterior', 'Entrega posterior'], ['estado', 'Estado venta']], rows);
    }
  } else if (t === 'credenciales' && req.user.rol === 'superadmin') {
    const rows = await db.query(`SELECT cedula, nombres, apellidos, email, clave_temporal, pin_temporal FROM usuarios
      WHERE activo=1 AND (clave_temporal IS NOT NULL OR pin_temporal IS NOT NULL) ORDER BY apellidos, nombres`);
    body = csv([['cedula', 'Cédula'], ['apellidos', 'Apellidos'], ['nombres', 'Nombres'], ['email', 'Correo'], ['clave_temporal', 'Contraseña temporal'], ['pin_temporal', 'PIN']], rows);
  } else fail('Reporte no disponible', 404);
  return { __raw: true, body, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${t}.csv"` } };
});

// ================= Super administrador =================
function parseFecha(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400e3)).toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  if (/^\d+(\.\d+)?$/.test(s)) return parseFecha(Number(s));
  return undefined;
}
function splitNombre(row) {
  let nombres = String(pick(row, 'nombres', 'nombre', 'nombres_y_apellidos', 'nombre_y_apellido', 'nombre_completo', 'empleado')).trim();
  let apellidos = String(pick(row, 'apellidos', 'apellido')).trim();
  return { nombres: nombres.replace(/\s+/g, ' '), apellidos: apellidos.replace(/\s+/g, ' ') };
}
const validEmail = (e) => { const s = String(e || '').trim(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s.toLowerCase() : null; };

function calcSaldo(cfg, fechaIngreso) {
  let c = cents(cfg.saldo_base);
  if (fechaIngreso && U.daysBetween(fechaIngreso, cfg.fecha_evento) > Number(cfg.dias_antiguedad)) c += cents(cfg.saldo_antiguedad);
  return money(c);
}

router.post('/api/super/importar/:tipo', auth, SUPER, async (req) => {
  const tipo = req.params.tipo;
  if (!['emprendedores', 'compradores'].includes(tipo)) fail('Tipo inválido', 404);
  let rows;
  try { rows = readSheet(String(req.body.filename || ''), String(req.body.data || '')); } catch (e) { fail(e.message); }
  if (!rows.length) fail('El archivo no tiene filas de datos');
  const db = DB.get();
  const cfg = await V.getConfig();
  const res = { creados: 0, actualizados: 0, errores: [], total: rows.length };
  const seen = new Set();
  for (const row of rows) {
    const err = (m) => res.errores.push({ fila: row.__fila, error: m });
    const cedula = U.normCedula(pick(row, 'cedula', 'ci', 'id', 'identificacion', 'cedula_id', 'cedula_o_id', 'numero_de_cedula'));
    if (!cedula || cedula.length < 5) { err('Cédula/ID vacía o inválida'); continue; }
    if (seen.has(cedula)) { err(`Cédula ${cedula} repetida en el archivo`); continue; }
    seen.add(cedula);
    const { nombres, apellidos } = splitNombre(row);
    if (!nombres) { err('Falta el nombre'); continue; }
    const email = validEmail(pick(row, 'email', 'correo', 'correo_electronico', 'e_mail', 'mail'));
    try {
      await db.tx(async (q) => {
        const ex = await q.get('SELECT id, rol, saldo_usado, pin_hash FROM usuarios WHERE cedula = @c', { c: cedula });
        if (tipo === 'emprendedores') {
          const comercial = String(pick(row, 'nombre_comercial', 'emprendimiento', 'negocio', 'marca')).trim();
          if (!comercial) fail('Falta el nombre comercial');
          const clave = String(pick(row, 'contrasena', 'clave', 'password', 'contrasenia')).trim();
          // Sin contraseña en el Excel: se genera una temporal solo para usuarios nuevos
          const temp = clave || ex ? null : U.randomClave();
          let uid;
          if (ex) {
            uid = ex.id;
            await q.run(`UPDATE usuarios SET nombres=@n, apellidos=@a, email=COALESCE(@e, email), activo=1 ${clave ? ', pass_hash=@h, clave_temporal=NULL, debe_cambiar=1' : ''} WHERE id=@id`,
              { id: uid, n: nombres, a: apellidos, e: email, h: clave ? U.hash(clave) : null });
            res.actualizados++;
          } else {
            uid = await q.insert('usuarios', { cedula, nombres, apellidos, email, rol: 'usuario', pass_hash: U.hash(clave || temp), clave_temporal: temp, debe_cambiar: 1, es_comprador: 0, saldo_asignado: 0, saldo_usado: 0, activo: 1, creado: new Date() });
            res.creados++;
          }
          const em = await q.get('SELECT id FROM emprendimientos WHERE usuario_id = @u', { u: uid });
          if (em) await q.run('UPDATE emprendimientos SET nombre_comercial=@n, activo=1 WHERE id=@id', { id: em.id, n: comercial.slice(0, 150) });
          else await q.insert('emprendimientos', { usuario_id: uid, nombre_comercial: comercial.slice(0, 150), activo: 1 });
        } else {
          const fi = parseFecha(pick(row, 'fecha_de_ingreso', 'fecha_ingreso', 'ingreso', 'fecha'));
          if (fi === undefined) fail('Fecha de ingreso no reconocida (use dd/mm/aaaa)');
          const saldoXls = pick(row, 'saldo', 'saldo_para_compras', 'saldo_compras', 'cupo');
          let saldo = req.body.recalcular || saldoXls === '' ? calcSaldo(cfg, fi) : Number(String(saldoXls).replace(',', '.'));
          if (!Number.isFinite(saldo) || saldo < 0) fail('Saldo inválido');
          saldo = money(cents(saldo));
          if (ex) {
            if (cents(saldo) < cents(ex.saldo_usado)) fail(`El nuevo saldo (${saldo}) es menor a lo ya consumido (${ex.saldo_usado})`);
            const pin = ex.pin_hash ? null : U.randomPin();
            await q.run(`UPDATE usuarios SET nombres=@n, apellidos=@a, email=COALESCE(@e, email), fecha_ingreso=@f, saldo_asignado=@s, es_comprador=1, activo=1
              ${pin ? ', pin_hash=@ph, pin_temporal=@pt' : ''} WHERE id=@id`, { id: ex.id, n: nombres, a: apellidos, e: email, f: fi, s: saldo, ph: pin ? U.hash(pin) : null, pt: pin });
            res.actualizados++;
          } else {
            const clave = U.randomClave(), pin = U.randomPin();
            await q.insert('usuarios', { cedula, nombres, apellidos, email, rol: 'usuario', pass_hash: U.hash(clave), clave_temporal: clave, debe_cambiar: 1,
              pin_hash: U.hash(pin), pin_temporal: pin, fecha_ingreso: fi, es_comprador: 1, saldo_asignado: saldo, saldo_usado: 0, activo: 1, creado: new Date() });
            res.creados++;
          }
        }
      });
    } catch (e) {
      if (e instanceof U.AppError) err(e.message); else { console.error(e); err('Error al guardar la fila'); }
    }
  }
  return res;
});

router.post('/api/super/recalcular-saldos', auth, SUPER, async () => {
  const db = DB.get();
  const cfg = await V.getConfig();
  const us = await db.query('SELECT id, cedula, fecha_ingreso, saldo_usado FROM usuarios WHERE es_comprador = 1');
  let n = 0; const avisos = [];
  for (const u of us) {
    let s = calcSaldo(cfg, u.fecha_ingreso);
    if (cents(s) < cents(u.saldo_usado)) { avisos.push(`${u.cedula}: ya consumió ${u.saldo_usado}, se mantiene ese valor`); s = Number(u.saldo_usado); }
    await db.run('UPDATE usuarios SET saldo_asignado=@s WHERE id=@id', { s, id: u.id });
    n++;
  }
  return { actualizados: n, avisos };
});

router.get('/api/super/usuarios', auth, SUPER, async (req) => {
  const w = ['1=1'], p = {};
  if (req.query.q) { w.push(`(u.cedula LIKE @q OR ${nom('u')} LIKE @q OR e.nombre_comercial LIKE @q)`); p.q = like(req.query.q); }
  if (req.query.tipo === 'emprendedores') w.push('e.id IS NOT NULL');
  if (req.query.tipo === 'admins') w.push(`u.rol IN ('admin','superadmin')`);
  if (req.query.tipo === 'compradores') w.push('u.es_comprador = 1');
  const rows = await DB.get().query(`SELECT u.id, u.cedula, u.nombres, u.apellidos, u.email, u.rol, u.activo, u.es_comprador, u.fecha_ingreso,
      u.saldo_asignado, u.saldo_usado, u.debe_cambiar, CASE WHEN u.pin_hash IS NULL THEN 0 ELSE 1 END AS tiene_pin,
      CASE WHEN u.clave_temporal IS NULL THEN 0 ELSE 1 END AS clave_pendiente, e.nombre_comercial
    FROM usuarios u LEFT JOIN emprendimientos e ON e.usuario_id = u.id WHERE ${w.join(' AND ')} ORDER BY u.apellidos, u.nombres`, p);
  return { total: rows.length, usuarios: rows.slice(0, 200) };
});

router.post('/api/super/usuarios', auth, SUPER, async (req) => {
  const b = req.body;
  const cedula = U.normCedula(b.cedula);
  if (!cedula) fail('Ingrese la cédula');
  if (!String(b.nombres || '').trim()) fail('Ingrese el nombre');
  if (!['usuario', 'admin', 'superadmin'].includes(b.rol)) fail('Rol inválido');
  const db = DB.get();
  if (await db.get('SELECT id FROM usuarios WHERE cedula=@c', { c: cedula })) fail('Ya existe un usuario con esa cédula');
  const clave = U.randomClave();
  const id = await db.insert('usuarios', { cedula, nombres: String(b.nombres).trim(), apellidos: String(b.apellidos || '').trim(), email: validEmail(b.email), rol: b.rol,
    pass_hash: U.hash(clave), clave_temporal: clave, debe_cambiar: 1, es_comprador: 0, saldo_asignado: 0, saldo_usado: 0, activo: 1, creado: new Date() });
  return { id, clave_temporal: clave };
});

router.put('/api/super/usuarios/:id', auth, SUPER, async (req) => {
  const db = DB.get(); const b = req.body; const id = Number(req.params.id);
  const u = await db.get('SELECT id, saldo_usado, rol FROM usuarios WHERE id=@id', { id });
  if (!u) fail('Usuario no encontrado', 404);
  if (id === req.user.id && (b.rol !== 'superadmin' || !b.activo)) fail('No puede quitarse su propio rol de super administrador ni desactivarse');
  if (!['usuario', 'admin', 'superadmin'].includes(b.rol)) fail('Rol inválido');
  const saldo = money(cents(b.saldo_asignado || 0));
  if (cents(saldo) < cents(u.saldo_usado)) fail(`El saldo no puede ser menor a lo ya consumido (${u.saldo_usado})`);
  const fi = parseFecha(b.fecha_ingreso);
  await db.tx(async (q) => {
    await q.run(`UPDATE usuarios SET nombres=@n, apellidos=@a, email=@e, rol=@r, activo=@act, es_comprador=@ec, saldo_asignado=@s, fecha_ingreso=@f WHERE id=@id`,
      { id, n: String(b.nombres || '').trim(), a: String(b.apellidos || '').trim(), e: validEmail(b.email), r: b.rol, act: b.activo ? 1 : 0, ec: b.es_comprador ? 1 : 0, s: saldo, f: fi || null });
    const nc = String(b.nombre_comercial || '').trim();
    const em = await q.get('SELECT id FROM emprendimientos WHERE usuario_id=@u', { u: id });
    if (nc && em) await q.run('UPDATE emprendimientos SET nombre_comercial=@n WHERE id=@id', { id: em.id, n: nc });
    else if (nc && !em) await q.insert('emprendimientos', { usuario_id: id, nombre_comercial: nc, activo: 1 });
    if (em) await q.run('UPDATE emprendimientos SET activo=@a WHERE id=@id', { id: em.id, a: b.activo ? 1 : 0 });
  });
});

router.post('/api/super/usuarios/:id/reset', auth, SUPER, async (req) => {
  const db = DB.get(); const id = Number(req.params.id);
  const out = {};
  if (req.body.clave) { out.clave_temporal = U.randomClave(); await db.run('UPDATE usuarios SET pass_hash=@h, clave_temporal=@t, debe_cambiar=1 WHERE id=@id', { id, h: U.hash(out.clave_temporal), t: out.clave_temporal }); }
  if (req.body.pin) { out.pin = U.randomPin(); await db.run('UPDATE usuarios SET pin_hash=@h, pin_temporal=@t WHERE id=@id', { id, h: U.hash(out.pin), t: out.pin }); }
  if (req.body.enviar) {
    const u = await db.get('SELECT email, nombres FROM usuarios WHERE id=@id', { id });
    out.enviado = await mailer.queue(u.email, 'Tus datos de acceso', accesoHtml(u.nombres, null, out.clave_temporal, out.pin));
  }
  return out;
});

const config = require('./config');
function accesoHtml(nombre, cedula, clave, pin) {
  return `<h2 style="margin:0 0 10px;font-size:18px">Hola ${U.esc(nombre)},</h2>
<p>Estos son tus datos para la ${U.esc(config.defaults.nombre_evento)}:</p>
<p style="background:#f4f1ea;padding:12px;border-radius:8px;font-size:15px">
${cedula ? `Usuario: <strong>${U.esc(cedula)}</strong> (tu cédula)<br>` : ''}
${clave ? `Contraseña temporal: <strong style="font-family:monospace">${U.esc(clave)}</strong><br>` : ''}
${pin ? `PIN para pagar con tu saldo: <strong style="font-family:monospace;font-size:18px">${U.esc(pin)}</strong>` : ''}</p>
<p>Al ingresar se te pedirá cambiar la contraseña. Tu PIN es personal: dáselo solo a ti mismo al momento de pagar, escribiéndolo tú en el equipo del vendedor. También puedes aprobar tus compras desde tu propio celular.</p>
<p><a href="${config.appUrl}" style="display:inline-block;background:#1f5f3f;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ingresar</a></p>`;
}

router.post('/api/super/enviar-accesos', auth, SUPER, async () => {
  const db = DB.get();
  const rows = await db.query(`SELECT cedula, nombres, email, clave_temporal, pin_temporal FROM usuarios
    WHERE activo=1 AND email IS NOT NULL AND (clave_temporal IS NOT NULL OR pin_temporal IS NOT NULL)`);
  let n = 0;
  for (const u of rows) if (await mailer.queue(u.email, 'Tus datos de acceso a la feria', accesoHtml(u.nombres, u.cedula, u.clave_temporal, u.pin_temporal))) n++;
  const sinCorreo = await db.get(`SELECT COUNT(*) AS n FROM usuarios WHERE activo=1 AND email IS NULL AND (clave_temporal IS NOT NULL OR pin_temporal IS NOT NULL)`);
  return { encolados: n, sin_correo: sinCorreo.n, smtp: mailer.enabled() };
});

// Borra las contraseñas y PIN temporales guardados en texto plano (una vez entregados los accesos).
// Los hashes no se tocan: los usuarios siguen ingresando con lo que recibieron.
router.post('/api/super/limpiar-temporales', auth, SUPER, async () => {
  const r = await DB.get().run('UPDATE usuarios SET clave_temporal=NULL, pin_temporal=NULL WHERE clave_temporal IS NOT NULL OR pin_temporal IS NOT NULL');
  return { limpiados: r.changes };
});

router.get('/api/super/config', auth, SUPER, async () => V.getConfig());
router.put('/api/super/config', auth, SUPER, async (req) => {
  const db = DB.get();
  const allowed = Object.keys(config.defaults);
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!allowed.includes(k)) continue;
    const val = String(v).trim();
    if (k === 'fecha_evento' && !/^\d{4}-\d{2}-\d{2}$/.test(val)) fail('Fecha del evento inválida');
    if (['saldo_base', 'saldo_antiguedad', 'dias_antiguedad', 'horas_entrega_cxc', 'minutos_confirmacion'].includes(k) && !(Number(val) >= 0)) fail(`Valor inválido: ${k}`);
    await db.tx(async (q) => {
      await q.run('DELETE FROM config WHERE clave=@k', { k });
      await q.insert('config', { clave: k, valor: val });
    });
  }
  return V.getConfig();
});

router.get('/api/super/correos', auth, SUPER, async () => {
  const db = DB.get();
  const est = await db.query('SELECT estado, COUNT(*) AS n FROM email_outbox GROUP BY estado');
  const ult = await db.query('SELECT id, para, asunto, estado, intentos, error, creado, enviado FROM email_outbox ORDER BY id DESC');
  return { smtp: mailer.enabled(), estados: Object.fromEntries(est.map(e => [e.estado, e.n])), ultimos: ult.slice(0, 50) };
});
router.post('/api/super/correos/reintentar', auth, SUPER, async () => {
  await DB.get().run(`UPDATE email_outbox SET estado='pendiente', intentos=0 WHERE estado='error'`);
  mailer.processQueue().catch(() => {});
});

module.exports = { calcSaldo };
