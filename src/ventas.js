'use strict';
/*
 * Reglas de negocio de las ventas.
 * - Stock: solo se descuenta de los ítems entregados el día del evento.
 * - Saldo: se reserva al registrar la venta y se libera al anularla. Lo usado con saldo es Cuenta por Cobrar.
 * - Pago con saldo requiere autorización del comprador: PIN en el equipo del vendedor
 *   o aprobación desde su propia sesión (plazo configurable, luego se anula sola).
 * - Ventas con saldo y entrega posterior: plazo máximo de entrega (72 h); vencido, se anulan
 *   y se notifica a vendedor, comprador y administradores.
 */
const DB = require('./db');
const mailer = require('./mailer');
const { cents, money, fail, verify, hash, randomCodigo, codigoClave, addHours, addMinutes, esc, fmt } = require('./util');

const FORMAS = ['saldo', 'efectivo', 'transferencia'];

async function getConfig(q = DB.get()) {
  const cfg = { ...require('./config').defaults };
  for (const r of await q.query('SELECT clave, valor FROM config')) cfg[r.clave] = r.valor;
  return cfg;
}

// ---------- Autorización del comprador: PIN (4 dígitos) o código de pago (6 dígitos) ----------
// El código lo genera el comprador en su celular, sirve una sola vez y vence en minutos:
// aunque alguien lo vea o lo escuche, después ya no sirve. El PIN se puede desactivar en Ajustes.
// Ambos comparten el bloqueo: 5 intentos fallidos bloquean 10 minutos.
const pinFails = new Map();
// propio: el comprador escribe su PIN en SU celular (para generar código o confirmar). Siempre se
// permite, aunque en Ajustes se haya desactivado el PIN en el equipo del vendedor.
async function checkPin(comprador, pin, { propio = false } = {}) {
  const st = pinFails.get(comprador.id);
  if (st && st.until > Date.now()) fail('Bloqueado por intentos fallidos. Espere 10 minutos o pida al comprador que apruebe la compra en su app.', 429);
  const val = String(pin ?? '').trim();
  let ok = null;
  if (/^\d{6}$/.test(val)) {
    const rows = await DB.get().query(`SELECT id, codigo_hash FROM codigos_pago WHERE usuario_id = @u AND usado_en IS NULL AND expira > @now`,
      { u: comprador.id, now: new Date() });
    const c = rows.find(r => verify(val, r.codigo_hash));
    if (c) ok = { medio: 'codigo', codigoId: c.id };
  } else if (/^\d{4}$/.test(val)) {
    const cfg = await getConfig();
    if (!propio && cfg.pago_con_pin === '0') fail('El pago con PIN está desactivado. Pide al comprador el código de pago de su celular o que apruebe la compra en su app.');
    if (!comprador.pin_hash) fail('El comprador no tiene PIN asignado. Use el código de pago o la aprobación desde su app.');
    if (verify(val, comprador.pin_hash)) ok = { medio: 'pin' };
  } else {
    fail('Ingrese el PIN de 4 dígitos o el código de pago de 6 dígitos');
  }
  if (!ok) {
    // Si hubo un bloqueo y ya venció, el contador vuelve a empezar; si no, se acumula
    const n = (st && st.until && st.until <= Date.now() ? 0 : (st?.n || 0)) + 1;
    pinFails.set(comprador.id, { n, until: n >= 5 ? Date.now() + 10 * 60e3 : 0 });
    if (n === 5) await avisarPinBloqueado(comprador.id);
    const que = val.length === 6 ? 'Código incorrecto, vencido o ya usado' : 'PIN incorrecto';
    fail(n >= 5 ? `${que}. Se bloqueó por 10 minutos.` : `${que} (intento ${n} de 5)`);
  }
  pinFails.delete(comprador.id);
  return ok;
}

// El comprador confirma con su PIN que es él (cuando entró solo con la cédula)
async function verificarPinPropio(usuarioId, pin) {
  const u = await DB.get().get('SELECT id, pin_hash FROM usuarios WHERE id = @id', { id: usuarioId });
  if (!u || !u.pin_hash) fail('Aún no tienes PIN. Pídelo en la mesa de ayuda.');
  if (!/^\d{4}$/.test(String(pin ?? '').trim())) fail('Escribe tu PIN de 4 números');
  await checkPin(u, pin, { propio: true });
}

// Marca el código como usado dentro de la transacción de la venta: si la venta falla, el código sigue vigente
async function consumirCodigo(q, autz) {
  if (!autz || !autz.codigoId) return;
  const r = await q.run('UPDATE codigos_pago SET usado_en = @now WHERE id = @id AND usado_en IS NULL', { id: autz.codigoId, now: new Date() });
  if (!r.changes) fail('Ese código de pago ya se usó. Pide al comprador que genere uno nuevo.');
}

const ultimoCodigo = new Map();
async function generarCodigoPago(usuarioId) {
  const t = ultimoCodigo.get(usuarioId);
  if (t && Date.now() - t < 5000) fail('Espera unos segundos antes de generar otro código', 429);
  ultimoCodigo.set(usuarioId, Date.now());
  const cfg = await getConfig();
  const now = new Date();
  const expira = addMinutes(now, Math.min(30, Math.max(1, Number(cfg.minutos_codigo_pago) || 5)));
  // El código también identifica al comprador: no puede haber dos códigos vigentes iguales
  let codigo, clave;
  for (let i = 0; i < 10; i++) {
    codigo = randomCodigo(); clave = codigoClave(codigo);
    const dup = await DB.get().get('SELECT id FROM codigos_pago WHERE codigo_clave = @k AND usado_en IS NULL AND expira > @now AND usuario_id <> @u',
      { k: clave, now, u: usuarioId });
    if (!dup) break;
  }
  await DB.get().tx(async (q) => {
    // Solo un código vigente por comprador: los anteriores dejan de servir
    await q.run('UPDATE codigos_pago SET usado_en = @now WHERE usuario_id = @u AND usado_en IS NULL', { u: usuarioId, now });
    await q.insert('codigos_pago', { usuario_id: usuarioId, codigo_hash: hash(codigo), codigo_clave: clave, expira, creado: now });
  });
  return { codigo, expira: expira.toISOString() };
}

// El vendedor escribe el código y la app encuentra al comprador (sin buscar por nombre).
// Protección contra quien intente adivinar códigos: 5 fallos seguidos bloquean 10 minutos a ese
// vendedor y se avisa a los administradores. El código no se gasta aquí: se gasta al registrar la venta.
const busquedaFails = new Map();
async function compradorPorCodigo(vendedor, codigo) {
  const st = busquedaFails.get(vendedor.id);
  if (st && st.until > Date.now()) fail('Demasiados códigos incorrectos. Espera 10 minutos o busca al comprador por su nombre.', 429);
  const val = String(codigo ?? '').trim();
  if (!/^\d{6}$/.test(val)) fail('El código tiene 6 números');
  const db = DB.get();
  const row = await db.get(`SELECT c.usuario_id, c.codigo_hash FROM codigos_pago c
    WHERE c.codigo_clave = @k AND c.usado_en IS NULL AND c.expira > @now`, { k: codigoClave(val), now: new Date() });
  if (!row || !verify(val, row.codigo_hash) || row.usuario_id === vendedor.id) {
    const n = (st && st.until && st.until <= Date.now() ? 0 : (st?.n || 0)) + 1;
    busquedaFails.set(vendedor.id, { n, until: n >= 5 ? Date.now() + 10 * 60e3 : 0 });
    if (n === 5) {
      const html = `<p>El emprendedor <strong>${esc(vendedor.nombres + ' ' + vendedor.apellidos)}</strong> escribió 5 códigos de pago incorrectos seguidos. Quedó bloqueado 10 minutos para buscar por código.</p><p>Puede ser un error al escribir, pero conviene revisarlo.</p>`;
      for (const a of await adminEmails(db)) await mailer.queue(a, 'Aviso: varios códigos de pago incorrectos', html);
    }
    fail(n >= 5 ? 'Demasiados códigos incorrectos. Se bloqueó por 10 minutos.' : 'Ese código no es válido o ya venció. Pide al comprador que genere uno nuevo.');
  }
  busquedaFails.delete(vendedor.id);
  const u = await db.get('SELECT id, cedula, nombres, apellidos, es_comprador, saldo_asignado, saldo_usado, pin_hash FROM usuarios WHERE id = @id AND activo = 1', { id: row.usuario_id });
  if (!u) fail('Comprador no encontrado');
  return {
    id: u.id, cedula: u.cedula, nombre: `${u.nombres} ${u.apellidos}`.trim(), tiene_pin: !!u.pin_hash,
    saldo_disponible: u.es_comprador ? money(cents(u.saldo_asignado) - cents(u.saldo_usado)) : 0,
  };
}

// Avisa al comprador: si no fue él quien intentó, alguien está probando su PIN
async function avisarPinBloqueado(compradorId) {
  try {
    const u = await DB.get().get('SELECT nombres, email FROM usuarios WHERE id = @id', { id: compradorId });
    if (!u || !u.email) return;
    await mailer.queue(u.email, 'Tu PIN fue bloqueado por intentos fallidos', `<h2 style="margin:0 0 10px;font-size:18px">Hola ${esc(u.nombres)},</h2>
<p>Se escribió mal tu PIN 5 veces seguidas al intentar pagar con tu saldo, así que quedó bloqueado por 10 minutos.</p>
<p>Si no fuiste tú, cambia tu PIN desde la app (<em>Mi cuenta</em>) y avisa a la mesa de ayuda de la feria.</p>`);
  } catch (e) { console.error('aviso PIN', e); }
}

async function loadVenta(q, id) {
  const v = await q.get(`SELECT v.*, e.nombre_comercial, e.usuario_id AS emprendedor_usuario_id,
      c.cedula AS comprador_cedula, c.nombres + ' ' + c.apellidos AS comprador_nombre, c.email AS comprador_email,
      u.email AS vendedor_email, u.nombres + ' ' + u.apellidos AS vendedor_nombre
    FROM ventas v JOIN emprendimientos e ON e.id = v.emprendimiento_id
    JOIN usuarios c ON c.id = v.comprador_id JOIN usuarios u ON u.id = e.usuario_id WHERE v.id = @id`.replace(/ \+ ' ' \+ /g, q.dialect === 'sqlite' ? " || ' ' || " : " + ' ' + "), { id });
  if (!v) return null;
  v.detalle = await q.query('SELECT id, producto_id, descripcion, cantidad, precio_unit, subtotal, entrega_posterior FROM venta_detalle WHERE venta_id = @id ORDER BY id', { id });
  v.pagos = await q.query('SELECT forma, monto FROM venta_pagos WHERE venta_id = @id ORDER BY id', { id });
  return v;
}

// Valida ítems y pagos; devuelve líneas con precios reales de la base de datos
async function buildVenta(q, emprendimientoId, input) {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) fail('Agregue al menos un producto');
  const merged = new Map();
  for (const it of items) {
    const pid = Number(it.producto_id), cant = Number(it.cantidad);
    if (!Number.isInteger(pid) || !Number.isInteger(cant) || cant <= 0) fail('Cantidad inválida');
    const key = `${pid}|${it.entrega_posterior ? 1 : 0}`;
    merged.set(key, { producto_id: pid, entrega_posterior: it.entrega_posterior ? 1 : 0, cantidad: (merged.get(key)?.cantidad || 0) + cant });
  }
  const lines = [];
  let totalC = 0;
  for (const it of merged.values()) {
    const p = await q.get('SELECT id, nombre, precio, activo FROM productos WHERE id = @id AND emprendimiento_id = @e', { id: it.producto_id, e: emprendimientoId });
    if (!p) fail('Producto no válido para este emprendimiento');
    const sub = cents(p.precio) * it.cantidad;
    totalC += sub;
    lines.push({ ...it, descripcion: p.nombre, precio_unit: Number(p.precio), subtotal: money(sub), activo: p.activo });
  }
  const pagos = [];
  let pagadoC = 0;
  for (const pg of (Array.isArray(input.pagos) ? input.pagos : [])) {
    if (!FORMAS.includes(pg.forma)) fail('Forma de pago inválida');
    const c = cents(pg.monto);
    if (!Number.isFinite(c) || c < 0) fail('Monto de pago inválido');
    if (c === 0) continue;
    const prev = pagos.find(x => x.forma === pg.forma);
    if (prev) prev.c += c; else pagos.push({ forma: pg.forma, c });
    pagadoC += c;
  }
  if (pagadoC !== totalC) fail(`Los pagos (${fmt(money(pagadoC))}) no cuadran con el total (${fmt(money(totalC))})`);
  const saldoC = pagos.find(p => p.forma === 'saldo')?.c || 0;
  return { lines, pagos: pagos.map(p => ({ forma: p.forma, monto: money(p.c) })), totalC, saldoC };
}

// Aplica descuentos de stock y reserva de saldo (dentro de la transacción)
async function applyEffects(q, compradorId, lines, saldoC) {
  for (const l of lines.filter(l => !l.entrega_posterior)) {
    if (!l.activo) fail(`"${l.descripcion}" no está disponible`);
    const r = await q.run('UPDATE productos SET stock = stock - @c WHERE id = @id AND stock >= @c', { c: l.cantidad, id: l.producto_id });
    if (!r.changes) {
      const p = await q.get('SELECT stock FROM productos WHERE id = @id', { id: l.producto_id });
      fail(`No te quedan suficientes "${l.descripcion}" (quedan ${p ? p.stock : 0}). Puedes marcarlo como "Lo entrego otro día".`);
    }
  }
  if (saldoC > 0) {
    const r = await q.run(`UPDATE usuarios SET saldo_usado = saldo_usado + @m
      WHERE id = @id AND es_comprador = 1 AND activo = 1 AND saldo_asignado - saldo_usado >= @m`, { m: money(saldoC), id: compradorId });
    if (!r.changes) {
      const u = await q.get('SELECT saldo_asignado - saldo_usado AS disp FROM usuarios WHERE id = @id', { id: compradorId });
      fail(`Saldo insuficiente. Disponible: ${fmt(u ? u.disp : 0)}`);
    }
  }
}

async function reverseEffects(q, v) {
  if (v.estado === 'anulada') return;
  for (const d of v.detalle.filter(d => !d.entrega_posterior)) {
    await q.run('UPDATE productos SET stock = stock + @c WHERE id = @id', { c: d.cantidad, id: d.producto_id });
  }
  if (cents(v.total_saldo) > 0) {
    await q.run('UPDATE usuarios SET saldo_usado = saldo_usado - @m WHERE id = @id', { m: Number(v.total_saldo), id: v.comprador_id });
  }
}

async function writeLines(q, ventaId, lines, pagos) {
  for (const l of lines) {
    await q.insert('venta_detalle', { venta_id: ventaId, producto_id: l.producto_id, descripcion: l.descripcion, cantidad: l.cantidad, precio_unit: l.precio_unit, subtotal: l.subtotal, entrega_posterior: l.entrega_posterior });
  }
  for (const p of pagos) await q.insert('venta_pagos', { venta_id: ventaId, forma: p.forma, monto: p.monto });
}

// Bloquea la fila de la venta hasta el fin de la transacción. Un UPDATE toma un candado
// exclusivo tanto en SQL Server como en SQLite: otra transacción que intente bloquear o
// modificar la misma venta espera, y al continuar lee el estado ya confirmado.
const lockVenta = (q, id) => q.run('UPDATE ventas SET actualizado = actualizado WHERE id = @id', { id });

const historial = (q, venta_id, usuario_id, accion, detalle) =>
  q.insert('venta_historial', { venta_id, usuario_id, accion, detalle: detalle ? JSON.stringify(detalle) : null, fecha: new Date() });

const resumenLineas = (lines, pagos) => ({
  items: lines.map(l => `${l.cantidad}× ${l.descripcion}${l.entrega_posterior ? ' (posterior)' : ''} = ${l.subtotal.toFixed(2)}`),
  pagos: pagos.map(p => `${p.forma}: ${Number(p.monto).toFixed(2)}`),
});

function limiteEntrega(cfg, creado, lines, saldoC) {
  const pendiente = lines.some(l => l.entrega_posterior);
  return {
    estado_entrega: pendiente ? 'pendiente' : 'entregado',
    fecha_limite_entrega: pendiente && saldoC > 0 ? addHours(new Date(creado), Number(cfg.horas_entrega_cxc)) : null,
  };
}

async function getEmprendimiento(q, userId) {
  const e = await q.get('SELECT id, nombre_comercial, activo FROM emprendimientos WHERE usuario_id = @u', { u: userId });
  if (!e) fail('Su usuario no tiene un emprendimiento asignado', 403);
  if (!e.activo) fail('Su emprendimiento está desactivado', 403);
  return e;
}

// ---------- Crear ----------
async function crear(user, input) {
  const db = DB.get();
  const cfg = await getConfig();
  const emp = await getEmprendimiento(db, user.id);
  // Clave de idempotencia: si el Wi-Fi se corta y el vendedor reintenta, se devuelve la misma venta
  // en lugar de registrarla (y cobrarla) dos veces.
  const idem = typeof input.idem === 'string' && /^[\w-]{8,64}$/.test(input.idem) ? input.idem : null;
  const yaRegistrada = async () => {
    if (!idem) return null;
    const ex = await db.get('SELECT id FROM ventas WHERE vendedor_id = @u AND idem = @k', { u: user.id, k: idem });
    return ex ? loadVenta(db, ex.id) : null;
  };
  const previa = await yaRegistrada();
  if (previa) return previa;

  const comprador = await db.get('SELECT id, pin_hash, activo FROM usuarios WHERE id = @id', { id: Number(input.comprador_id) });
  if (!comprador || !comprador.activo) fail('Comprador no encontrado');
  if (comprador.id === user.id) fail('No puede registrarse una venta a sí mismo');
  const usaSaldo = (input.pagos || []).some(p => p.forma === 'saldo' && cents(p.monto) > 0);
  const autz = usaSaldo && input.pin ? await checkPin(comprador, input.pin) : null;

  let id;
  try {
    id = await db.tx(async (q) => {
      const { lines, pagos, totalC, saldoC } = await buildVenta(q, emp.id, input);
      await applyEffects(q, comprador.id, lines, saldoC);
      if (saldoC > 0) await consumirCodigo(q, autz);
      const now = new Date();
      const estado = saldoC > 0 && !autz ? 'por_confirmar' : 'confirmada';
      const ventaId = await q.insert('ventas', {
        emprendimiento_id: emp.id, comprador_id: comprador.id, vendedor_id: user.id,
        total: money(totalC), total_saldo: money(saldoC), estado,
        confirmada_por: saldoC > 0 ? (autz ? autz.medio : null) : 'no_requiere',
        expira_confirmacion: estado === 'por_confirmar' ? addMinutes(now, Number(cfg.minutos_confirmacion)) : null,
        ...limiteEntrega(cfg, now, lines, saldoC),
        creado: now, actualizado: now, idem,
      });
      await writeLines(q, ventaId, lines, pagos);
      await historial(q, ventaId, user.id, 'creada', { estado, medio: autz ? autz.medio : null, ...resumenLineas(lines, pagos) });
      return ventaId;
    });
  } catch (e) {
    // Dos reintentos simultáneos: el índice único deja pasar solo uno; el otro devuelve esa venta
    const otra = await yaRegistrada();
    if (otra) return otra;
    throw e;
  }
  const v = await loadVenta(db, id);
  if (v.estado === 'confirmada') await notificarConfirmada(v);
  return v;
}

// ---------- Editar ----------
async function editar(user, id, input) {
  const db = DB.get();
  const cfg = await getConfig();
  const emp = await getEmprendimiento(db, user.id);
  const actual = await loadVenta(db, id);
  if (!actual || actual.emprendimiento_id !== emp.id) fail('Venta no encontrada', 404);
  if (actual.estado === 'anulada') fail('Una venta anulada no se puede modificar');
  const comprador = await db.get('SELECT id, pin_hash FROM usuarios WHERE id = @id', { id: actual.comprador_id });
  const nuevoSaldo = cents((input.pagos || []).filter(p => p.forma === 'saldo').reduce((a, p) => a + Number(p.monto || 0), 0));
  const autz = nuevoSaldo > 0 && input.pin ? await checkPin(comprador, input.pin) : null;

  await db.tx(async (q) => {
    await lockVenta(q, id);
    const v = await loadVenta(q, id); // releer dentro de la transacción, ya bloqueada
    if (!v) fail('Venta no encontrada', 404);
    if (v.estado === 'anulada') fail('La venta fue anulada mientras la editaba');
    await reverseEffects(q, v);
    const { lines, pagos, totalC, saldoC } = await buildVenta(q, emp.id, input);
    await applyEffects(q, v.comprador_id, lines, saldoC);
    const now = new Date();
    let estado = v.estado, confirmada_por = v.confirmada_por, expira = v.expira_confirmacion ? new Date(v.expira_confirmacion) : null;
    if (saldoC === 0) { estado = 'confirmada'; confirmada_por = 'no_requiere'; expira = null; }
    else if (autz) { await consumirCodigo(q, autz); estado = 'confirmada'; confirmada_por = autz.medio; expira = null; }
    else if (saldoC > cents(v.total_saldo) || v.estado === 'por_confirmar') {
      estado = 'por_confirmar'; confirmada_por = null; expira = addMinutes(now, Number(cfg.minutos_confirmacion));
    }
    const ent = limiteEntrega(cfg, v.creado, lines, saldoC);
    const habiaPend = v.detalle.some(d => d.entrega_posterior);
    if (ent.estado_entrega === 'pendiente' && habiaPend && v.estado_entrega === 'entregado') ent.estado_entrega = 'entregado';
    await q.run('DELETE FROM venta_detalle WHERE venta_id = @id', { id });
    await q.run('DELETE FROM venta_pagos WHERE venta_id = @id', { id });
    await writeLines(q, id, lines, pagos);
    await q.run(`UPDATE ventas SET total=@total, total_saldo=@ts, estado=@estado, confirmada_por=@cp, expira_confirmacion=@exp,
      estado_entrega=@ee, fecha_limite_entrega=@fl, actualizado=@now WHERE id=@id`, {
      id, total: money(totalC), ts: money(saldoC), estado, cp: confirmada_por, exp: expira,
      ee: ent.estado_entrega, fl: ent.fecha_limite_entrega, now,
    });
    await historial(q, id, user.id, 'modificada', {
      motivo: input.motivo || null,
      antes: resumenLineas(v.detalle.map(d => ({ ...d, subtotal: Number(d.subtotal) })), v.pagos),
      despues: resumenLineas(lines, pagos), estado,
    });
  });
  const v = await loadVenta(db, id);
  if (v.estado === 'confirmada') {
    await mailer.queue(v.comprador_email, `Compra modificada N.º ${v.id} - ${v.nombre_comercial}`, mailer.ventaHtml(v, 'Tu compra fue modificada', input.motivo ? `Motivo: ${esc(input.motivo)}` : ''));
  }
  return v;
}

// ---------- Anular ----------
// `condicion(v)`: solo para anulaciones automáticas; se evalúa con la venta ya bloqueada,
// para no anular una venta que cambió (se confirmó, se entregó o se editó) desde que se consultó.
// `forzar`: lo usa un administrador al resolver el reporte de un comprador.
async function anular(actor, id, motivo, { sistema = false, condicion = null, forzar = false } = {}) {
  const db = DB.get();
  if (!sistema) {
    if (!motivo || String(motivo).trim().length < 3) fail('Indique el motivo de la anulación');
  }
  const permitido = (v) => sistema || forzar || actor.rol === 'superadmin' || v.emprendedor_usuario_id === actor.id
    || (v.comprador_id === actor.id && v.estado === 'por_confirmar');
  const v0 = await loadVenta(db, id);
  if (!v0) fail('Venta no encontrada', 404);
  if (!permitido(v0)) fail('No tiene permiso para anular esta venta', 403);
  const done = await db.tx(async (q) => {
    await lockVenta(q, id);
    const v = await loadVenta(q, id);
    if (!v || v.estado === 'anulada') return 'anulada';
    if (condicion && !condicion(v)) return 'cambio';
    if (!permitido(v)) fail('La venta cambió de estado y ya no puede anularla', 403);
    await reverseEffects(q, v);
    await q.run(`UPDATE ventas SET estado='anulada', motivo_anulacion=@m, anulada_por=@a, actualizado=@now WHERE id=@id AND estado <> 'anulada'`,
      { id, m: String(motivo).slice(0, 300), a: actor ? actor.id : null, now: new Date() });
    await historial(q, id, actor ? actor.id : null, sistema ? 'anulada_automatica' : 'anulada', { motivo });
    return 'ok';
  });
  if (done === 'anulada') fail('La venta ya estaba anulada');
  if (done === 'cambio') fail('La venta cambió de estado; no se anuló');
  const v = await loadVenta(db, id);
  const html = mailer.ventaHtml(v, 'Venta anulada', `Motivo: ${esc(motivo)}`);
  await mailer.queue(v.comprador_email, `Venta anulada N.º ${v.id} - ${v.nombre_comercial}`, html);
  if (sistema || (actor && actor.id !== v.emprendedor_usuario_id)) {
    await mailer.queue(v.vendedor_email, `Venta anulada N.º ${v.id}`, html);
  }
  return v;
}

// ---------- Confirmar (PIN posterior o aprobación del comprador) ----------
async function confirmar(actor, id, { pin, exigirPin = false } = {}) {
  const db = DB.get();
  const v0 = await loadVenta(db, id);
  if (!v0) fail('Venta no encontrada', 404);
  const esComprador = v0.comprador_id === actor.id;
  const esVendedor = v0.emprendedor_usuario_id === actor.id;
  if (!esComprador && !esVendedor) fail('No autorizado', 403);
  if (v0.estado !== 'por_confirmar') fail(v0.estado === 'anulada' ? 'Esta venta fue anulada' : 'Esta venta ya está confirmada');
  let autz = null;
  if (esComprador && exigirPin) await verificarPinPropio(actor.id, pin);
  if (esVendedor && !esComprador) {
    const comprador = await db.get('SELECT id, pin_hash FROM usuarios WHERE id = @id', { id: v0.comprador_id });
    autz = await checkPin(comprador, pin);
  }
  const medio = esComprador ? 'app' : autz.medio;
  const ok = await db.tx(async (q) => {
    const r = await q.run(`UPDATE ventas SET estado='confirmada', confirmada_por=@cp, expira_confirmacion=NULL, actualizado=@now
      WHERE id=@id AND estado='por_confirmar'`, { id, cp: medio, now: new Date() });
    if (r.changes) {
      await consumirCodigo(q, autz);
      await historial(q, id, actor.id, 'confirmada', { medio });
    }
    return r.changes > 0;
  });
  if (!ok) fail('La venta ya no está pendiente');
  const v = await loadVenta(db, id);
  await notificarConfirmada(v);
  return v;
}

async function marcarEntregado(user, id) {
  const db = DB.get();
  const v = await loadVenta(db, id);
  if (!v || (v.emprendedor_usuario_id !== user.id && user.rol !== 'superadmin')) fail('Venta no encontrada', 404);
  if (v.estado !== 'confirmada') fail('Solo se pueden entregar ventas confirmadas');
  if (v.estado_entrega === 'entregado') fail('La venta ya está entregada');
  await db.tx(async (q) => {
    const r = await q.run(`UPDATE ventas SET estado_entrega='entregado', entregado_en=@now, actualizado=@now
      WHERE id=@id AND estado='confirmada' AND estado_entrega='pendiente'`, { id, now: new Date() });
    if (!r.changes) fail('La venta cambió de estado; actualice e intente de nuevo');
    await historial(q, id, user.id, 'entregada', null);
  });
  const nv = await loadVenta(db, id);
  await mailer.queue(nv.comprador_email, `Pedido entregado N.º ${nv.id} - ${nv.nombre_comercial}`, mailer.ventaHtml(nv, 'Tu pedido fue entregado'));
  return nv;
}

// ---------- Reporte del comprador: "no reconozco esta compra" ----------
// No anula sola (un comprador podría reportar algo que sí recibió): queda pendiente para que un
// administrador revise con el emprendedor y decida anularla o descartar el reporte.
const adminEmails = async (db) => (await db.query(`SELECT email FROM usuarios WHERE rol IN ('admin','superadmin') AND activo=1 AND email IS NOT NULL`)).map(a => a.email);

async function reportar(actor, id, motivo) {
  const db = DB.get();
  const v = await loadVenta(db, id);
  if (!v || v.comprador_id !== actor.id) fail('Venta no encontrada', 404);
  if (v.estado !== 'confirmada' || cents(v.total_saldo) <= 0) fail('Solo se pueden reportar compras confirmadas pagadas con saldo');
  if (v.reporte_estado) fail('Esta compra ya fue reportada');
  const m = String(motivo || '').trim();
  if (m.length < 5) fail('Cuéntanos brevemente qué pasó');
  const now = new Date();
  const hecho = await db.tx(async (q) => {
    const r = await q.run(`UPDATE ventas SET reporte=@m, reporte_estado='pendiente', reportada_en=@now, actualizado=@now
      WHERE id=@id AND reporte_estado IS NULL`, { id, m: m.slice(0, 300), now });
    if (r.changes) await historial(q, id, actor.id, 'reportada', { motivo: m });
    return r.changes > 0;
  });
  if (!hecho) fail('Esta compra ya fue reportada');
  const nv = await loadVenta(db, id);
  const html = mailer.ventaHtml(nv, 'Un comprador no reconoce esta compra', `Emprendimiento: ${esc(nv.nombre_comercial)}<br>Motivo: ${esc(m)}`);
  for (const a of await adminEmails(db)) await mailer.queue(a, `Compra reportada N.º ${id} - ${nv.nombre_comercial}`, html);
  return nv;
}

async function resolverReporte(actor, id, accion, nota) {
  const db = DB.get();
  const v = await loadVenta(db, id);
  if (!v || v.reporte_estado !== 'pendiente') fail('Esta venta no tiene un reporte pendiente');
  if (!['anular', 'descartar'].includes(accion)) fail('Acción inválida');
  const n = String(nota || '').trim().slice(0, 200);
  if (accion === 'anular' && v.estado !== 'anulada') {
    await anular(actor, id, `Reporte del comprador: ${v.reporte}${n ? ' · ' + n : ''}`, { forzar: true });
  }
  await db.tx(async (q) => {
    await q.run(`UPDATE ventas SET reporte_estado='resuelto', actualizado=@now WHERE id=@id`, { id, now: new Date() });
    await historial(q, id, actor.id, 'reporte_resuelto', { motivo: (accion === 'anular' ? 'Anulada' : 'Reporte descartado') + (n ? ': ' + n : '') });
  });
  const nv = await loadVenta(db, id);
  await mailer.queue(nv.comprador_email, `Tu reporte de la compra N.º ${id}`, mailer.ventaHtml(nv,
    accion === 'anular' ? 'Revisamos tu reporte: la compra fue anulada y tu saldo devuelto' : 'Revisamos tu reporte: la compra se mantiene', n ? `Nota: ${esc(n)}` : ''));
  return nv;
}

async function notificarConfirmada(v) {
  await mailer.queue(v.comprador_email, `Comprobante de compra N.º ${v.id} - ${v.nombre_comercial}`, mailer.ventaHtml(v, '¡Gracias por tu compra!'));
}

// ---------- Tareas automáticas (cada minuto) ----------
async function tareasProgramadas() {
  const db = DB.get();
  const now = new Date();
  await db.run('DELETE FROM codigos_pago WHERE expira < @limite', { limite: addHours(now, -24) });
  const vencidasConf = await db.query(`SELECT id FROM ventas WHERE estado='por_confirmar' AND expira_confirmacion < @now`, { now });
  for (const r of vencidasConf) {
    try {
      await anular(null, r.id, 'El comprador no confirmó el pago con saldo a tiempo', { sistema: true,
        condicion: (v) => v.estado === 'por_confirmar' && v.expira_confirmacion && new Date(v.expira_confirmacion) < new Date() });
    } catch (e) { /* ya procesada o cambió de estado */ }
  }
  const vencidasEnt = await db.query(`SELECT id FROM ventas WHERE estado='confirmada' AND estado_entrega='pendiente'
    AND fecha_limite_entrega IS NOT NULL AND fecha_limite_entrega < @now`, { now });
  if (vencidasEnt.length) {
    const admins = await db.query(`SELECT email FROM usuarios WHERE rol IN ('admin','superadmin') AND activo=1 AND email IS NOT NULL`);
    for (const r of vencidasEnt) {
      try {
        const v = await anular(null, r.id, 'Pedido con saldo no entregado dentro del plazo máximo', { sistema: true,
          condicion: (x) => x.estado === 'confirmada' && x.estado_entrega === 'pendiente' && x.fecha_limite_entrega && new Date(x.fecha_limite_entrega) < new Date() });
        for (const a of admins) await mailer.queue(a.email, `Anulación automática N.º ${v.id} (entrega vencida)`, mailer.ventaHtml(v, 'Venta anulada por entrega vencida', `Emprendimiento: ${esc(v.nombre_comercial)}`));
      } catch (e) { /* ya procesada */ }
    }
  }
}

module.exports = { crear, editar, anular, confirmar, marcarEntregado, loadVenta, getConfig, tareasProgramadas, FORMAS,
  generarCodigoPago, compradorPorCodigo, verificarPinPropio, reportar, resolverReporte };
