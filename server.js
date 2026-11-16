'use strict';
const http = require('http');
const path = require('path');
const config = require('./src/config');
const DB = require('./src/db');
const { handle } = require('./src/http');
const U = require('./src/util');
require('./src/api');
const { tareasProgramadas } = require('./src/ventas');
const mailer = require('./src/mailer');

async function main() {
  const db = await DB.init();
  // Super administrador inicial
  const cedula = U.normCedula(config.superadmin.cedula);
  if (!(await db.get('SELECT id FROM usuarios WHERE cedula = @c', { c: cedula }))) {
    await db.insert('usuarios', { cedula, nombres: 'Super', apellidos: 'Administrador', rol: 'superadmin', pass_hash: U.hash(config.superadmin.password),
      debe_cambiar: 1, es_comprador: 0, saldo_asignado: 0, saldo_usado: 0, activo: 1, creado: new Date() });
    console.log(`Super administrador creado: cédula ${cedula}`);
  }

  const publicDir = path.join(__dirname, 'public');
  const server = http.createServer((req, res) => handle(req, res, publicDir));
  server.keepAliveTimeout = 65000;
  server.listen(config.port, () => console.log(`Feria lista en http://localhost:${config.port} (base de datos: ${db.dialect})`));

  // Tareas automáticas: vencimientos de confirmación/entrega y envío de correos
  const tick = async () => {
    try { await tareasProgramadas(); } catch (e) { console.error('tareas', e); }
    try { await mailer.processQueue(); } catch (e) { console.error('correo', e); }
  };
  setInterval(tick, 60e3);
  setTimeout(tick, 5e3);

  const stop = () => { server.close(); Promise.resolve(db.close()).finally(() => process.exit(0)); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}

main().catch((e) => { console.error('No se pudo iniciar:', e); process.exit(1); });
