-- Esquema para SQL Server / Azure SQL
-- La app lo ejecuta automáticamente al arrancar si las tablas no existen.
-- También puede ejecutarlo manualmente un DBA.

IF OBJECT_ID('dbo.config') IS NULL
CREATE TABLE dbo.config (
  clave NVARCHAR(50) NOT NULL PRIMARY KEY,
  valor NVARCHAR(500) NULL
);

IF OBJECT_ID('dbo.usuarios') IS NULL
CREATE TABLE dbo.usuarios (
  id INT IDENTITY(1,1) PRIMARY KEY,
  cedula NVARCHAR(20) NOT NULL CONSTRAINT UQ_usuarios_cedula UNIQUE,
  nombres NVARCHAR(100) NOT NULL,
  apellidos NVARCHAR(100) NOT NULL CONSTRAINT DF_usuarios_apellidos DEFAULT '',
  email NVARCHAR(150) NULL,
  rol NVARCHAR(20) NOT NULL CONSTRAINT DF_usuarios_rol DEFAULT 'usuario', -- superadmin | admin | usuario
  pass_hash NVARCHAR(200) NULL,
  clave_temporal NVARCHAR(30) NULL,
  debe_cambiar INT NOT NULL CONSTRAINT DF_usuarios_debe DEFAULT 1,
  pin_hash NVARCHAR(200) NULL,
  pin_temporal NVARCHAR(10) NULL,
  fecha_ingreso NVARCHAR(10) NULL, -- YYYY-MM-DD
  es_comprador INT NOT NULL CONSTRAINT DF_usuarios_comp DEFAULT 0,
  saldo_asignado DECIMAL(10,2) NOT NULL CONSTRAINT DF_usuarios_sa DEFAULT 0,
  saldo_usado DECIMAL(10,2) NOT NULL CONSTRAINT DF_usuarios_su DEFAULT 0,
  activo INT NOT NULL CONSTRAINT DF_usuarios_activo DEFAULT 1,
  creado DATETIME2 NOT NULL CONSTRAINT DF_usuarios_creado DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_usuarios_saldo CHECK (saldo_usado >= 0 AND saldo_usado <= saldo_asignado)
);

IF OBJECT_ID('dbo.emprendimientos') IS NULL
CREATE TABLE dbo.emprendimientos (
  id INT IDENTITY(1,1) PRIMARY KEY,
  usuario_id INT NOT NULL CONSTRAINT UQ_emp_usuario UNIQUE REFERENCES dbo.usuarios(id),
  nombre_comercial NVARCHAR(150) NOT NULL,
  activo INT NOT NULL CONSTRAINT DF_emp_activo DEFAULT 1
);

IF OBJECT_ID('dbo.productos') IS NULL
CREATE TABLE dbo.productos (
  id INT IDENTITY(1,1) PRIMARY KEY,
  emprendimiento_id INT NOT NULL REFERENCES dbo.emprendimientos(id),
  nombre NVARCHAR(150) NOT NULL,
  descripcion NVARCHAR(500) NULL,
  precio DECIMAL(10,2) NOT NULL,
  stock INT NOT NULL CONSTRAINT DF_prod_stock DEFAULT 0,
  activo INT NOT NULL CONSTRAINT DF_prod_activo DEFAULT 1,
  creado DATETIME2 NOT NULL CONSTRAINT DF_prod_creado DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_prod_stock CHECK (stock >= 0),
  CONSTRAINT CK_prod_precio CHECK (precio >= 0)
);

IF OBJECT_ID('dbo.ventas') IS NULL
CREATE TABLE dbo.ventas (
  id INT IDENTITY(1,1) PRIMARY KEY,
  emprendimiento_id INT NOT NULL REFERENCES dbo.emprendimientos(id),
  comprador_id INT NOT NULL REFERENCES dbo.usuarios(id),
  vendedor_id INT NOT NULL REFERENCES dbo.usuarios(id),
  total DECIMAL(10,2) NOT NULL,
  total_saldo DECIMAL(10,2) NOT NULL CONSTRAINT DF_ventas_ts DEFAULT 0,
  estado NVARCHAR(20) NOT NULL,            -- por_confirmar | confirmada | anulada
  confirmada_por NVARCHAR(20) NULL,        -- pin | app | no_requiere
  expira_confirmacion DATETIME2 NULL,
  estado_entrega NVARCHAR(20) NOT NULL,    -- entregado | pendiente
  fecha_limite_entrega DATETIME2 NULL,
  entregado_en DATETIME2 NULL,
  motivo_anulacion NVARCHAR(300) NULL,
  anulada_por INT NULL,
  creado DATETIME2 NOT NULL,
  actualizado DATETIME2 NOT NULL
);

IF OBJECT_ID('dbo.venta_detalle') IS NULL
CREATE TABLE dbo.venta_detalle (
  id INT IDENTITY(1,1) PRIMARY KEY,
  venta_id INT NOT NULL REFERENCES dbo.ventas(id),
  producto_id INT NOT NULL REFERENCES dbo.productos(id),
  descripcion NVARCHAR(150) NOT NULL,
  cantidad INT NOT NULL,
  precio_unit DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  entrega_posterior INT NOT NULL CONSTRAINT DF_det_ep DEFAULT 0
);

IF OBJECT_ID('dbo.venta_pagos') IS NULL
CREATE TABLE dbo.venta_pagos (
  id INT IDENTITY(1,1) PRIMARY KEY,
  venta_id INT NOT NULL REFERENCES dbo.ventas(id),
  forma NVARCHAR(20) NOT NULL,             -- saldo | efectivo | transferencia
  monto DECIMAL(10,2) NOT NULL
);

IF OBJECT_ID('dbo.venta_historial') IS NULL
CREATE TABLE dbo.venta_historial (
  id INT IDENTITY(1,1) PRIMARY KEY,
  venta_id INT NOT NULL REFERENCES dbo.ventas(id),
  usuario_id INT NULL,
  accion NVARCHAR(30) NOT NULL,
  detalle NVARCHAR(MAX) NULL,
  fecha DATETIME2 NOT NULL
);

IF OBJECT_ID('dbo.email_outbox') IS NULL
CREATE TABLE dbo.email_outbox (
  id INT IDENTITY(1,1) PRIMARY KEY,
  para NVARCHAR(150) NOT NULL,
  asunto NVARCHAR(200) NOT NULL,
  html NVARCHAR(MAX) NOT NULL,
  estado NVARCHAR(20) NOT NULL,            -- pendiente | enviado | error
  intentos INT NOT NULL CONSTRAINT DF_mail_int DEFAULT 0,
  error NVARCHAR(500) NULL,
  creado DATETIME2 NOT NULL,
  enviado DATETIME2 NULL
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ventas_emp')
  CREATE INDEX IX_ventas_emp ON dbo.ventas(emprendimiento_id, id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ventas_comp')
  CREATE INDEX IX_ventas_comp ON dbo.ventas(comprador_id, id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ventas_estado')
  CREATE INDEX IX_ventas_estado ON dbo.ventas(estado, estado_entrega);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_det_venta')
  CREATE INDEX IX_det_venta ON dbo.venta_detalle(venta_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pagos_venta')
  CREATE INDEX IX_pagos_venta ON dbo.venta_pagos(venta_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_hist_venta')
  CREATE INDEX IX_hist_venta ON dbo.venta_historial(venta_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_mail_estado')
  CREATE INDEX IX_mail_estado ON dbo.email_outbox(estado);
