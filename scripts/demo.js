'use strict';
// Crea datos de demostración en SQLite (no usar en producción).
process.env.DB_DRIVER = 'sqlite';
const fs = require('fs');
const config = require('../src/config');
config.db.driver = 'sqlite';
for (const ext of ['', '-wal', '-shm']) { try { fs.unlinkSync(config.db.sqliteFile + ext); } catch (_) { /* no existe */ } }
const DB = require('../src/db');
const U = require('../src/util');
const { calcSaldo } = require('../src/api');

(async () => {
  const db = await DB.init();
  const cfg = { ...config.defaults };
  const now = new Date();
  const user = (o) => db.insert('usuarios', { apellidos: '', email: null, rol: 'usuario', debe_cambiar: 0, es_comprador: 0, saldo_asignado: 0, saldo_usado: 0, activo: 1, creado: now, ...o });
  await user({ cedula: '0000000000', nombres: 'Super', apellidos: 'Administrador', rol: 'superadmin', pass_hash: U.hash('demo123') });
  await user({ cedula: '1111111111', nombres: 'Andrea', apellidos: 'Salazar', rol: 'admin', pass_hash: U.hash('demo123'), email: 'andrea@demo.com' });
  const emps = [
    ['0102030405', 'María', 'Pérez', 'Dulces María', [['Brownie', 1.5, 30], ['Torta de chocolate (entera)', 18, 2], ['Alfajores x6', 3, 15]]],
    ['1712345678', 'Juan', 'Torres', 'Artesanías del Valle', [['Pulsera tejida', 4, 20], ['Llavero de tagua', 2.5, 25], ['Bolso de cabuya', 15, 3]]],
    ['0923456789', 'Lucía', 'Andrade', 'Café de la Finca', [['Café molido 250 g', 6, 12], ['Café en grano 500 g', 10, 8], ['Taza de café', 1, 50]]],
  ];
  for (const [cedula, n, a, comercial, prods] of emps) {
    const id = await user({ cedula, nombres: n, apellidos: a, pass_hash: U.hash('demo123'), es_comprador: 1, fecha_ingreso: '2021-05-10', saldo_asignado: calcSaldo(cfg, '2021-05-10'), pin_hash: U.hash('2580') });
    const e = await db.insert('emprendimientos', { usuario_id: id, nombre_comercial: comercial, activo: 1 });
    for (const [pn, pr, st] of prods) await db.insert('productos', { emprendimiento_id: e, nombre: pn, precio: pr, stock: st, activo: 1, creado: now });
  }
  const nombres = ['Ana Ruiz', 'Luis Mora', 'Carla Vega', 'Pedro Lema', 'Sofía Cando', 'Diego Paz', 'Elena Ríos', 'Marco Silva', 'Rosa Chávez', 'Iván Cruz'];
  for (let i = 0; i < nombres.length; i++) {
    const [n, a] = nombres[i].split(' ');
    const fi = i % 3 === 0 ? '2026-10-15' : '2019-02-01';
    await user({ cedula: '17000000' + String(i).padStart(2, '0'), nombres: n, apellidos: a, pass_hash: U.hash('demo123'), pin_hash: U.hash('2580'), es_comprador: 1, fecha_ingreso: fi, saldo_asignado: calcSaldo(cfg, fi), email: `${n.toLowerCase()}@demo.com` });
  }
  console.log('Datos demo creados. Usuarios (contraseña demo123, PIN 2580):');
  console.log('  Super admin 0000000000 · Admin 1111111111 · Emprendedora 0102030405 · Comprador 1700000000');
  db.close();
})();
