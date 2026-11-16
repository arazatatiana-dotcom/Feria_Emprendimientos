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
const { cents, money, fail, verify, addHours, addMinutes, esc, fmt } = require('./util');

const FORMAS = ['saldo', 'efectivo', 'transferencia'];

async function getConfig(q = DB.get()) {
  const cfg = { ...require('./config').defaults };
  for (const r of await q.query('SELECT clave, valor FROM config')) cfg[r.clave] = r.valor;
  return cfg;
}

// ---------- Control de intentos de PIN (bloqueo 10 min tras 5 fallos) ----------
const pinFails = new Map();
async function checkPin(comprador, pin) {
  const st = pinFails.get(comprador.id);
  if (st && st.until > Date.now()) fail('PIN bloqueado por intentos fallidos. Espere 10 minutos o use la aprobación desde la app del comprador.', 429);
  if (!comprador.pin_hash) fail('El comprador no tiene PIN asignado. Use la aprobación desde su app.');
  if (!verify(String(pin).trim(), comprador.pin_hash)) {
    // Si hubo un bloqueo y ya venció, el contador vuelve a empezar; si no, se acumula
    const n = (st && st.until && st.until <= Date.now() ? 0 : (st?.n || 0)) + 1;
    pinFails.set(comprador.id, { n, until: n >= 5 ? Date.now() + 10 * 60e3 : 0 });
    if (n === 5) await avisarPinBloqueado(comprador.id);
    fail(n >= 5 ? 'PIN incorrecto. Se bloqueó por 10 minutos.' : `PIN incorrecto (intento ${n} de 5)`);
  }
  pinFails.delete(comprador.id);
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
      fail(`Stock insuficiente de "${l.descripcion}" (disponible: ${p ? p.stock : 0}). Puede marcarlo como entrega posterior.`);
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
  const comprador = await db.get('SELECT id, pin_hash, activo FROM usuarios WHERE id = @id', { id: Number(input.comprador_id) });
  if (!comprador || !comprador.activo) fail('Comprador no encontrado');
  if (comprador.id === user.id) fail('No puede registrarse una venta a sí mismo');
  const usaSaldo = (input.pagos || []).some(p => p.forma === 'saldo' && cents(p.monto) > 0);
  let porPin = false;
  if (usaSaldo && input.pin) { await checkPin(comprador, input.pin); porPin = true; }

  const id = await db.tx(async (q) => {
    const { lines, pagos, totalC, saldoC } = await buildVenta(q, emp.id, input);
    await applyEffects(q, comprador.id, lines, saldoC);
    const now = new Date();
    const estado = saldoC > 0 && !porPin ? 'por_confirmar' : 'confirmada';
    const ventaId = await q.insert('ventas', {
      emprendimiento_id: emp.id, comprador_id: comprador.id, vendedor_id: user.id,
      total: money(totalC), total_saldo: money(saldoC), estado,
      confirmada_por: saldoC > 0 ? (porPin ? 'pin' : null) : 'no_requiere',
      expira_confirmacion: estado === 'por_confirmar' ? addMinutes(now, Number(cfg.minutos_confirmacion)) : null,
      ...limiteEntrega(cfg, now, lines, saldoC),
      creado: now, actualizado: now,
    });
    await writeLines(q, ventaId, lines, pagos);
    await historial(q, ventaId, user.id, 'creada', { estado, ...resumenLineas(lines, pagos) });
    return ventaId;
  });
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
  let porPin = false;
  if (nuevoSaldo > 0 && input.pin) { await checkPin(comprador, input.pin); porPin = true; }

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
    else if (porPin) { estado = 'confirmada'; confirmada_por = 'pin'; expira = null; }
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
async function anular(actor, id, motivo, { sistema = false, condicion = null } = {}) {
  const db = DB.get();
  if (!sistema) {
    if (!motivo || String(motivo).trim().length < 3) fail('Indique el motivo de la anulación');
  }
  const permitido = (v) => sistema || actor.rol === 'superadmin' || v.emprendedor_usuario_id === actor.id
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
async function confirmar(actor, id, { pin } = {}) {
  const db = DB.get();
  const v0 = await loadVenta(db, id);
  if (!v0) fail('Venta no encontrada', 404);
  const esComprador = v0.comprador_id === actor.id;
  const esVendedor = v0.emprendedor_usuario_id === actor.id;
  if (!esComprador && !esVendedor) fail('No autorizado', 403);
  if (v0.estado !== 'por_confirmar') fail(v0.estado === 'anulada' ? 'Esta venta fue anulada' : 'Esta venta ya está confirmada');
  if (esVendedor && !esComprador) {
    const comprador = await db.get('SELECT id, pin_hash FROM usuarios WHERE id = @id', { id: v0.comprador_id });
    await checkPin(comprador, pin);
  }
  const ok = await db.tx(async (q) => {
    const r = await q.run(`UPDATE ventas SET estado='confirmada', confirmada_por=@cp, expira_confirmacion=NULL, actualizado=@now
      WHERE id=@id AND estado='por_confirmar'`, { id, cp: esComprador ? 'app' : 'pin', now: new Date() });
    if (r.changes) await historial(q, id, actor.id, 'confirmada', { medio: esComprador ? 'app' : 'pin' });
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

async function notificarConfirmada(v) {
  await mailer.queue(v.comprador_email, `Comprobante de compra N.º ${v.id} - ${v.nombre_comercial}`, mailer.ventaHtml(v, '¡Gracias por tu compra!'));
}

// ---------- Tareas automáticas (cada minuto) ----------
async function tareasProgramadas() {
  const db = DB.get();
  const now = new Date();
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

module.exports = { crear, editar, anular, confirmar, marcarEntregado, loadVenta, getConfig, tareasProgramadas, FORMAS };
