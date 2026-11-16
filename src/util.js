'use strict';
const crypto = require('crypto');
const config = require('./config');

// ---------- Contraseñas y PIN (scrypt, nativo de Node) ----------
function hash(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(plain), salt, 32).toString('hex');
  return `s1$${salt}$${h}`;
}
function verify(plain, stored) {
  if (!stored || plain === undefined || plain === null) return false;
  const [, salt, h] = String(stored).split('$');
  if (!salt || !h) return false;
  const calc = crypto.scryptSync(String(plain), salt, 32);
  const ref = Buffer.from(h, 'hex');
  return ref.length === calc.length && crypto.timingSafeEqual(ref, calc);
}
function randomPin() { return String(crypto.randomInt(0, 10000)).padStart(4, '0'); }
function randomClave() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += abc[crypto.randomInt(0, abc.length)];
  return s;
}

// ---------- Tokens de sesión firmados (HMAC) ----------
const b64 = (s) => Buffer.from(s).toString('base64url');
function signToken(payload, horas = 14) {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + horas * 3600e3 }));
  const sig = crypto.createHmac('sha256', config.secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const exp = crypto.createHmac('sha256', config.secret).update(body).digest('base64url');
  if (sig.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

// ---------- Dinero: siempre en centavos para evitar errores de redondeo ----------
const cents = (n) => Math.round(Number(n) * 100);
const money = (c) => Math.round(c) / 100;
const fmt = (n) => '$' + Number(n || 0).toFixed(2);

// ---------- Errores de negocio ----------
class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (msg, status = 400) => { throw new AppError(status, msg); };

// ---------- Cédulas ecuatorianas: Excel suele borrar el 0 inicial ----------
function normCedula(v) {
  let s = String(v ?? '').trim().replace(/\.0+$/, '').replace(/[\s-]/g, '');
  if (/^\d{9}$/.test(s)) s = '0' + s;
  return s;
}

// ---------- Fechas ----------
const addHours = (d, h) => new Date(d.getTime() + h * 3600e3);
const addMinutes = (d, m) => new Date(d.getTime() + m * 60e3);
function daysBetween(fromYmd, toYmd) {
  const a = Date.parse(fromYmd + 'T00:00:00Z');
  const b = Date.parse(toYmd + 'T00:00:00Z');
  return Math.floor((b - a) / 86400e3);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = { hash, verify, randomPin, randomClave, signToken, readToken, cents, money, fmt, AppError, fail, normCedula, addHours, addMinutes, daysBetween, esc };
