-- Esquema equivalente para el modo demo (SQLite integrado en Node 22)
CREATE TABLE IF NOT EXISTS config (clave TEXT PRIMARY KEY, valor TEXT);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cedula TEXT NOT NULL UNIQUE,
  nombres TEXT NOT NULL,
  apellidos TEXT NOT NULL DEFAULT '',
  email TEXT,
  rol TEXT NOT NULL DEFAULT 'usuario',
  pass_hash TEXT,
  clave_temporal TEXT,
  debe_cambiar INTEGER NOT NULL DEFAULT 1,
  pin_hash TEXT,
  pin_temporal TEXT,
  fecha_ingreso TEXT,
  es_comprador INTEGER NOT NULL DEFAULT 0,
  saldo_asignado REAL NOT NULL DEFAULT 0,
  saldo_usado REAL NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (saldo_usado >= 0 AND saldo_usado <= saldo_asignado + 0.0001)
);

CREATE TABLE IF NOT EXISTS emprendimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id),
  nombre_comercial TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emprendimiento_id INTEGER NOT NULL REFERENCES emprendimientos(id),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio REAL NOT NULL CHECK (precio >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emprendimiento_id INTEGER NOT NULL REFERENCES emprendimientos(id),
  comprador_id INTEGER NOT NULL REFERENCES usuarios(id),
  vendedor_id INTEGER NOT NULL REFERENCES usuarios(id),
  total REAL NOT NULL,
  total_saldo REAL NOT NULL DEFAULT 0,
  estado TEXT NOT NULL,
  confirmada_por TEXT,
  expira_confirmacion TEXT,
  estado_entrega TEXT NOT NULL,
  fecha_limite_entrega TEXT,
  entregado_en TEXT,
  motivo_anulacion TEXT,
  anulada_por INTEGER,
  creado TEXT NOT NULL,
  actualizado TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS venta_detalle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL REFERENCES ventas(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  descripcion TEXT NOT NULL,
  cantidad INTEGER NOT NULL,
  precio_unit REAL NOT NULL,
  subtotal REAL NOT NULL,
  entrega_posterior INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS venta_pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL REFERENCES ventas(id),
  forma TEXT NOT NULL,
  monto REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS venta_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL REFERENCES ventas(id),
  usuario_id INTEGER,
  accion TEXT NOT NULL,
  detalle TEXT,
  fecha TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  para TEXT NOT NULL,
  asunto TEXT NOT NULL,
  html TEXT NOT NULL,
  estado TEXT NOT NULL,
  intentos INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  creado TEXT NOT NULL,
  enviado TEXT
);

CREATE INDEX IF NOT EXISTS IX_ventas_emp ON ventas(emprendimiento_id, id);
CREATE INDEX IF NOT EXISTS IX_ventas_comp ON ventas(comprador_id, id);
CREATE INDEX IF NOT EXISTS IX_ventas_estado ON ventas(estado, estado_entrega);
CREATE INDEX IF NOT EXISTS IX_det_venta ON venta_detalle(venta_id);
CREATE INDEX IF NOT EXISTS IX_pagos_venta ON venta_pagos(venta_id);
CREATE INDEX IF NOT EXISTS IX_hist_venta ON venta_historial(venta_id);
CREATE INDEX IF NOT EXISTS IX_mail_estado ON email_outbox(estado);
