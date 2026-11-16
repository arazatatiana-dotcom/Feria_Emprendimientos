'use strict';
const fs = require('fs');
const path = require('path');

// Carga mínima de .env (sin dependencias)
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const e = process.env;
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|si)$/i.test(v));

module.exports = {
  port: Number(e.PORT || 3000),
  secret: e.APP_SECRET || 'dev-secret-cambiar',
  appUrl: e.APP_URL || 'http://localhost:3000',
  tzOffset: e.TZ_OFFSET || '-05:00',
  db: {
    driver: e.DB_DRIVER || 'sqlite',
    server: e.DB_SERVER || 'localhost',
    port: Number(e.DB_PORT || 1433),
    database: e.DB_NAME || 'FeriaEmprendedores',
    user: e.DB_USER,
    password: e.DB_PASSWORD,
    encrypt: bool(e.DB_ENCRYPT, true),
    trustCert: bool(e.DB_TRUST_CERT, false),
    sqliteFile: e.SQLITE_FILE || path.join(__dirname, '..', 'data', 'feria.db'),
  },
  superadmin: { cedula: e.SUPERADMIN_CEDULA || '0000000000', password: e.SUPERADMIN_PASSWORD || 'Cambiar.2026' },
  smtp: {
    host: e.SMTP_HOST, port: Number(e.SMTP_PORT || 587), secure: bool(e.SMTP_SECURE, false),
    user: e.SMTP_USER, password: e.SMTP_PASSWORD,
    from: e.MAIL_FROM || 'Feria de Emprendedores <no-reply@localhost>',
  },
  // Reglas de negocio (los valores editables viven en la tabla config)
  defaults: {
    fecha_evento: '2026-11-27',
    hora_evento: '15:00',
    saldo_base: '5.00',
    saldo_antiguedad: '20.00',
    dias_antiguedad: '90',
    horas_entrega_cxc: '72',
    minutos_confirmacion: '15',
    nombre_evento: 'Feria de Emprendedores',
  },
};
