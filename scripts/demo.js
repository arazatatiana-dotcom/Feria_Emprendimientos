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
  // [cédula, nombres, apellidos, nombre comercial, categoría, productos [nombre, precio, stock]]
  const emps = [
    ['0102030405', 'María', 'Pérez', 'Dulces María', 'Postres y dulces', [['Brownie', 1.5, 30], ['Torta de chocolate (entera)', 18, 2], ['Alfajores x6', 3, 15]]],
    ['1712345678', 'Juan', 'Torres', 'Artesanías del Valle', 'Artesanías', [['Pulsera tejida', 4, 20], ['Llavero de tagua', 2.5, 25], ['Bolso de cabuya', 15, 3]]],
    ['0923456789', 'Lucía', 'Andrade', 'Café de la Finca', 'Bebidas', [['Café molido 250 g', 6, 12], ['Café en grano 500 g', 10, 8], ['Taza de café', 1, 50]]],
  ];
  // 29 emprendimientos más, para ver el catálogo con el volumen real del evento (32 en total)
  const extra = [
    ['Empanadas Doña Rosa', 'Comida', [['Empanada de viento', 1, 40], ['Empanada de morocho', 1.25, 30], ['Combo 3 empanadas + jugo', 4, 15]]],
    ['Bolones del Puerto', 'Comida', [['Bolón de queso', 2.5, 25], ['Bolón mixto', 3, 20], ['Tigrillo', 3.5, 10]]],
    ['Sabor Serrano', 'Comida', [['Humita', 1.5, 30], ['Quimbolito', 1.25, 30], ['Tamal lojano', 2, 20], ['Muchines de yuca x4', 2, 15]]],
    ['Ceviches Manabitas', 'Comida', [['Ceviche de camarón', 5, 15], ['Ceviche mixto', 6, 10], ['Chifles', 1, 40]]],
    ['La Parrilla de Pepe', 'Comida', [['Pincho de carne', 2.5, 30], ['Pincho de pollo', 2, 30], ['Choclo asado', 1.5, 20], ['Salchipapa', 2.5, 25]]],
    ['Delicias de Mamá Lola', 'Postres y dulces', [['Pristiños con miel x3', 2, 20], ['Buñuelos x4', 2, 20], ['Higos con queso', 2.5, 12]]],
    ['Cupcakes Felices', 'Postres y dulces', [['Cupcake de vainilla', 1.5, 24], ['Cupcake red velvet', 2, 24], ['Caja de 6 cupcakes', 10, 5]]],
    ['Chocolates Arriba', 'Postres y dulces', [['Barra 70% cacao', 3.5, 30], ['Bombones x12', 8, 10], ['Nibs de cacao 100 g', 4, 15]]],
    ['Helados Artesanales Nieve', 'Postres y dulces', [['Helado de paila (vaso)', 2, 40], ['Paleta de frutas', 1, 50], ['Litro de helado', 7, 6]]],
    ['Jugos Naturales Vitamina', 'Bebidas', [['Jugo de naranja', 1.5, 40], ['Batido de frutilla', 2.5, 30], ['Limonada de coco', 2, 30]]],
    ['Kombucha Viva', 'Bebidas', [['Kombucha jengibre 350 ml', 3, 20], ['Kombucha maracuyá 350 ml', 3, 20], ['Pack x4', 11, 6]]],
    ['Chocolate Caliente La Abuela', 'Bebidas', [['Chocolate con queso', 2, 30], ['Colada morada (temporada)', 2, 25]]],
    ['Tejidos Otavalo', 'Artesanías', [['Bufanda de alpaca', 18, 8], ['Gorro tejido', 10, 12], ['Tapiz pequeño', 25, 3]]],
    ['Cerámica Barro Vivo', 'Artesanías', [['Taza pintada a mano', 8, 15], ['Maceta pequeña', 6, 20], ['Juego de platos x4', 30, 2]]],
    ['Tagua Nativa', 'Artesanías', [['Aretes de tagua', 5, 25], ['Collar de tagua', 9, 15], ['Figura decorativa', 7, 10]]],
    ['Moda Andina', 'Ropa y accesorios', [['Blusa bordada', 22, 6], ['Poncho infantil', 15, 5], ['Chal', 18, 8]]],
    ['Bisutería Luna', 'Ropa y accesorios', [['Aretes de plata', 12, 15], ['Anillo ajustable', 8, 20], ['Pulsera de hilo', 3, 40]]],
    ['Bolsos Eco', 'Ropa y accesorios', [['Tote bag estampada', 8, 20], ['Cartera de cuero', 35, 4], ['Monedero', 6, 15]]],
    ['Calcetines Divertidos', 'Ropa y accesorios', [['Par de calcetines', 3, 50], ['Pack x3', 8, 20]]],
    ['Jabones del Bosque', 'Belleza y cuidado personal', [['Jabón de avena', 3, 30], ['Jabón de carbón activado', 3.5, 25], ['Kit de 3 jabones', 9, 10]]],
    ['Aromas y Velas', 'Belleza y cuidado personal', [['Vela de soya 200 g', 8, 15], ['Aceite esencial lavanda', 6, 20], ['Difusor de varillas', 12, 8]]],
    ['Cosmética Natural Flor', 'Belleza y cuidado personal', [['Bálsamo labial', 3, 40], ['Crema de manos', 5, 25], ['Shampoo sólido', 7, 15]]],
    ['Casa Bonita Deco', 'Hogar y decoración', [['Cojín bordado', 15, 10], ['Portarretrato de madera', 9, 12], ['Cuadro decorativo', 20, 5]]],
    ['Macramé Nudos', 'Hogar y decoración', [['Colgante para plantas', 12, 10], ['Tapiz de macramé', 25, 4], ['Posavasos x4', 6, 15]]],
    ['Madera Fina', 'Hogar y decoración', [['Tabla de picar', 14, 8], ['Organizador de escritorio', 18, 6], ['Cucharas de madera x3', 7, 15]]],
    ['Suculentas Mini', 'Plantas', [['Suculenta en maceta', 3, 40], ['Terrario pequeño', 12, 8], ['Cactus', 2.5, 30]]],
    ['Huerto en Casa', 'Plantas', [['Kit de semillas', 4, 25], ['Hierbas aromáticas', 3, 20], ['Abono orgánico 1 kg', 5, 15]]],
    ['Orquídeas del Valle', 'Plantas', [['Orquídea en maceta', 15, 6], ['Bromelia', 8, 10]]],
    ['Libros Usados Don Quijote', null, [['Novela de bolsillo', 3, 30], ['Libro infantil', 4, 20], ['Pack 3 libros', 8, 10]]],
  ];
  extra.forEach(([comercial, cat, prods], i) => {
    const nombres = ['Carlos', 'Gabriela', 'Fernando', 'Paola', 'Ricardo', 'Verónica', 'Andrés', 'Daniela', 'Jorge', 'Mónica'][i % 10];
    const apellidos = ['Mendoza', 'Guerrero', 'Vásquez', 'Ortiz', 'Castro', 'Zambrano', 'Jaramillo', 'Benítez', 'Rivera', 'Aguirre'][(i * 3) % 10];
    emps.push([`05000000${String(i).padStart(2, '0')}`, nombres, apellidos, comercial, cat, prods, false]);
  });
  for (const [cedula, n, a, comercial, categoria, prods, compra = true] of emps) {
    const id = await user({ cedula, nombres: n, apellidos: a, pass_hash: U.hash('demo123'), es_comprador: compra ? 1 : 0, fecha_ingreso: '2021-05-10',
      saldo_asignado: compra ? calcSaldo(cfg, '2021-05-10') : 0, pin_hash: compra ? U.hash('2580') : null });
    const e = await db.insert('emprendimientos', { usuario_id: id, nombre_comercial: comercial, categoria, activo: 1 });
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
