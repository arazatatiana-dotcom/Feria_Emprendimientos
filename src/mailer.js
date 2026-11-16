'use strict';
/*
 * Correos: se encolan en la tabla email_outbox y un proceso los envía en segundo plano.
 * Así una caída del SMTP nunca bloquea una venta. Sin SMTP configurado, quedan
 * en la bandeja como "pendiente" y se pueden revisar desde el panel.
 */
const config = require('./config');
const DB = require('./db');
const { esc, fmt } = require('./util');

let transport = null;
function getTransport() {
  if (!config.smtp.host) return null;
  if (transport) return transport;
  let nodemailer;
  try { nodemailer = require('nodemailer'); } catch { console.warn('nodemailer no instalado: correos quedarán en cola'); return null; }
  transport = nodemailer.createTransport({
    host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
  });
  return transport;
}

async function queue(para, asunto, html, q = DB.get()) {
  if (!para || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) return false;
  await q.insert('email_outbox', { para, asunto, html: layout(asunto, html), estado: 'pendiente', intentos: 0, creado: new Date() });
  return true;
}

let running = false;
async function processQueue() {
  const t = getTransport();
  if (!t || running) return;
  running = true;
  try {
    const db = DB.get();
    const rows = await db.query(`SELECT id, para, asunto, html, intentos FROM email_outbox WHERE estado = 'pendiente' OR (estado = 'error' AND intentos < 5) ORDER BY id`);
    for (const m of rows.slice(0, 40)) {
      try {
        await t.sendMail({ from: config.smtp.from, to: m.para, subject: m.asunto, html: m.html });
        await db.run(`UPDATE email_outbox SET estado='enviado', enviado=@now, intentos=intentos+1, error=NULL WHERE id=@id`, { id: m.id, now: new Date() });
      } catch (err) {
        await db.run(`UPDATE email_outbox SET estado='error', intentos=intentos+1, error=@e WHERE id=@id`, { id: m.id, e: String(err.message).slice(0, 480) });
      }
    }
  } finally { running = false; }
}

function layout(titulo, body) {
  return `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:Segoe UI,Arial,sans-serif;color:#1f2a24">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#1f5f3f;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0;font-size:18px;font-weight:600">${esc(config.defaults.nombre_evento)}</div>
<div style="background:#fff;padding:20px;border-radius:0 0 10px 10px;line-height:1.5">${body}</div>
<p style="font-size:12px;color:#6b7280;text-align:center">Mensaje automático. No responda a este correo.</p></div></body></html>`;
}

function ventaHtml(v, titulo, nota = '') {
  const filas = v.detalle.map(d => `<tr><td style="padding:6px 0">${d.cantidad} × ${esc(d.descripcion)}${d.entrega_posterior ? ' <em style="color:#b45309">(entrega posterior)</em>' : ''}</td><td style="text-align:right">${fmt(d.subtotal)}</td></tr>`).join('');
  const pagos = v.pagos.map(p => `<tr><td style="padding:2px 0;color:#4b5563">${{ saldo: 'Saldo asignado', efectivo: 'Efectivo', transferencia: 'Transferencia' }[p.forma]}</td><td style="text-align:right;color:#4b5563">${fmt(p.monto)}</td></tr>`).join('');
  return `<h2 style="margin:0 0 4px;font-size:18px">${esc(titulo)}</h2>
<p style="margin:0 0 12px;color:#4b5563">Venta N.º ${v.id} · ${esc(v.nombre_comercial)}<br>${new Date(v.creado).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}</p>
${nota ? `<p style="background:#fef3c7;padding:10px;border-radius:6px">${nota}</p>` : ''}
<table style="width:100%;border-collapse:collapse;font-size:14px">${filas}
<tr><td style="border-top:1px solid #e5e7eb;padding-top:8px;font-weight:600">Total</td><td style="border-top:1px solid #e5e7eb;padding-top:8px;text-align:right;font-weight:600">${fmt(v.total)}</td></tr>${pagos}</table>
<p style="margin-top:14px">Comprador: ${esc(v.comprador_nombre)} (${esc(v.comprador_cedula)})</p>
${v.estado_entrega === 'pendiente' ? `<p>Estado de entrega: <strong>pendiente</strong>${v.fecha_limite_entrega ? `, a más tardar el ${new Date(v.fecha_limite_entrega).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}` : ''}.</p>` : ''}
<p><a href="${config.appUrl}" style="color:#1f5f3f">Abrir la aplicación</a></p>`;
}

module.exports = { queue, processQueue, ventaHtml, enabled: () => !!config.smtp.host };
