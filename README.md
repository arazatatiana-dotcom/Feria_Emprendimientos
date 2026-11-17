# Feria de Emprendedores: aplicación de ventas

Es una aplicación web responsive para celular, tablet y PC. Hecha en Node.js con SQL Server (servidor interno o Azure SQL). Solo depende de dos paquetes: `mssql` para la base de datos y `nodemailer` para el correo.

## Perfiles

| Perfil | Qué puede hacer |
|---|---|
| **Comprador** (empleado) | Ver su saldo, confirmar o rechazar compras pagadas con saldo, ver el catálogo y su historial, y cambiar su contraseña y PIN. |
| **Emprendedor** | Gestionar productos (precio y stock), ver el saldo de los compradores, registrar, modificar y anular ventas, marcar entregas y reenviar comprobantes. Si también está en la lista de compradores, puede comprar. |
| **Administrador** | Panel en vivo (actualiza cada 15 s), todas las transacciones, cuentas por cobrar, liquidación a emprendedores y exportación a Excel (CSV). |
| **Super administrador** | Todo lo del administrador, más importar los Excel, gestionar usuarios y roles, resetear contraseñas y PIN, configurar reglas, enviar accesos y revisar la cola de correos. |

## Reglas implementadas

- **Saldo** = base ($5) + adicional ($20) si a la fecha del evento el empleado tiene **más de 90 días**. Los tres valores se editan en *Ajustes*. Si el Excel trae la columna *Saldo*, se usa ese valor; también se puede forzar el cálculo con la regla.
- **Varias formas de pago por venta**: saldo, efectivo y transferencia. La suma debe cuadrar exactamente con el total.
- **Lo pagado con saldo es cuenta por cobrar**: hay un reporte por empleado (para el descuento por rol) y una liquidación por emprendedor (lo que la empresa le debe pagar).
- **Autorización del comprador** para pagar con saldo, de una de tres formas:
  1. **Código de pago** (recomendado): el comprador lo genera en su celular (*Inicio → Generar código de pago*) y lo escribe en el equipo del vendedor. Tiene 6 dígitos, **sirve una sola vez** y vence en 5 minutos, así que aunque alguien lo vea o lo escuche, después ya no le sirve.
  2. **PIN** de 4 dígitos escrito en el equipo del vendedor. Se puede **desactivar** en *Ajustes* para que un PIN escuchado no sirva de nada.
  3. La venta queda **por confirmar** y el comprador la aprueba desde su celular. Si no lo hace en 15 min, se anula sola y se libera el saldo y el stock.

  El PIN y el código comparten el bloqueo: 5 intentos fallidos bloquean 10 minutos y se avisa al comprador por correo.
- **Aviso inmediato y reporte**: cuando se cobra algo con su saldo, al comprador le aparece un aviso en la app ("¿Fuiste tú?") además del correo. Si no reconoce la compra, la **reporta** y los administradores la ven en el *Panel* y en *Ventas → Reportadas*. No se anula sola, porque alguien podría reportar algo que sí recibió: un administrador revisa con el emprendedor y decide si la anula (y se devuelve el saldo) o descarta el reporte. En ambos casos el comprador recibe un correo.
- **Catálogo para 500 compradores y 32 emprendimientos**: se organiza por **categoría → emprendimiento → productos**, con buscador (ignora tildes) y filtro por categoría. Cada emprendimiento aparece plegado y se abre con un toque. El **orden de los emprendimientos es aleatorio para cada comprador** y se mantiene fijo durante el día: así ninguno queda siempre arriba ni siempre al final. Dentro de cada emprendimiento, primero lo disponible hoy y al final lo que es bajo pedido.
- **El comprador entra solo con su cédula**: ve su saldo, el catálogo y sus compras. Como la cédula la conoce mucha gente, para **pagar** (generar el código) o **confirmar** una compra la app le pide su **PIN** en su propio celular. Emprendedores y administradores siguen entrando con contraseña. En *Ajustes* se puede volver a pedir contraseña también a los compradores.
- **El código identifica al comprador**: si paga con saldo, el comprador escribe su código en el celular del vendedor y la app sabe quién es, sin buscar por nombre. Quien escriba 5 códigos incorrectos seguidos queda bloqueado 10 minutos y se avisa a los administradores.
- **Pensada para personas poco acostumbradas a la tecnología**: recorrido guiado corto al entrar, botones "i" con explicaciones de una frase, opción de **letra grande**, resumen grande antes de registrar cada venta, vibración y sonido al confirmar, palabras simples ("Lo entrego otro día", "Cancelar venta") y resumen del día con el efectivo que debería haber en caja.
- **WhatsApp de la mesa de ayuda**: si se configura el número en *Ajustes*, aparece un botón para escribir por WhatsApp, también en la pantalla de ingreso.
- **Instalar en el celular**: en Android (Chrome) se instala con un toque desde *Mi cuenta* o el botón ❓. En iPhone, la app muestra los pasos (Safari → Compartir → "Agregar a inicio"). Sin internet, la app instalada muestra un aviso claro en lugar del error del navegador.
- **Ventas sin duplicados**: cada venta lleva una clave única. Si el Wi-Fi se corta y el vendedor vuelve a tocar "Registrar", el servidor devuelve la misma venta en lugar de cobrarla dos veces.
- **Stock**: solo se descuenta de lo que se entrega el día del evento. Los ítems marcados como *entrega posterior* no lo descuentan y la venta queda con *entrega pendiente*.
- **Entrega posterior pagada con saldo**: el plazo máximo es de 72 h. Si vence sin entregarse, la venta se **anula automáticamente** y se envía un correo al vendedor, al comprador y a los administradores.
- **Modificar o anular** lo hace el emprendedor dueño de la venta. La anulación exige un motivo. Todo queda en el **historial** de la venta (antes y después de cada cambio). Si una modificación aumenta el monto pagado con saldo, el comprador debe autorizarla de nuevo.
- **Correos**: comprobante de compra, modificación, anulación, entrega y envío de accesos. Se encolan en la base de datos y se envían en segundo plano, así que una caída del correo nunca bloquea una venta.
- **Concurrencia**: el stock y el saldo se descuentan con operaciones atómicas dentro de transacciones, para que nunca queden negativos aunque varios vendedores registren al mismo tiempo.

## Excel de entrada

Las plantillas están en `public/plantillas/` y también se descargan desde *Ajustes*. Los encabezados se reconocen sin importar mayúsculas ni tildes.

- **Emprendedores**: `Cédula, Nombres, Apellidos, Nombre comercial, Contraseña, Email` y, opcional, `Categoría` (debe ser una de las configuradas en *Ajustes*; si no viene, el emprendedor la elige en *Productos* o queda en "Otros")
- **Compradores**: `Cédula, Nombres, Apellidos, Fecha de ingreso, Saldo, Email`

Notas:
- Si Excel quitó el **0 inicial** de una cédula de 9 dígitos, la app lo repone.
- Puede importar varias veces: si la cédula ya existe, se actualiza.
- Una persona puede estar en los dos archivos (emprendedor que también compra).
- A cada comprador nuevo se le genera una contraseña temporal y un PIN. Desde *Ajustes → Accesos* se envían por correo, o se descargan en CSV para imprimir y entregar a quien no tenga correo.

## Prueba rápida (sin SQL Server)

Se necesita Node.js 22.5 o superior.

```bash
cp .env.example .env        # en .env deje DB_DRIVER=sqlite
node scripts/demo.js        # crea datos de prueba
node server.js              # abrir http://localhost:3000
```

Usuarios demo (contraseña `demo123`, PIN `2580`): super admin `0000000000`, admin `1111111111`, emprendedora `0102030405`, comprador `1700000000`.

## Instalación en producción

### Opción A: servidor interno (Node.js + SQL Server)

1. Cree la base de datos vacía `FeriaEmprendedores` y un usuario SQL con permisos `db_ddladmin`, `db_datareader` y `db_datawriter`. Las tablas se crean solas al primer arranque (`db/schema.mssql.sql`).
2. Copie la carpeta al servidor, ejecute `npm install --omit=dev` y luego `cp .env.example .env`.
3. En `.env` configure:
   - `DB_DRIVER=mssql` y los datos de conexión. Con un certificado interno, use `DB_TRUST_CERT=true`.
   - `APP_SECRET` (una cadena aleatoria de 32 caracteres o más) y `APP_URL`.
   - `SUPERADMIN_CEDULA` y `SUPERADMIN_PASSWORD`.
   - Con `DB_DRIVER=mssql`, el servidor **no arranca** si `APP_SECRET` o `SUPERADMIN_PASSWORD` faltan o tienen los valores de ejemplo.
   - `SMTP_*` para el correo (con Microsoft 365: `smtp.office365.com`, puerto 587, con una cuenta que tenga SMTP AUTH habilitado).
4. Inicie con `node server.js`. Para que se reinicie solo, use PM2 (`pm2 start server.js --name feria`) o NSSM como servicio de Windows.
5. Publíquelo detrás de IIS o nginx con **HTTPS**. Recomendado: un nombre interno tipo `feria.suempresa.com` accesible desde el Wi-Fi del evento.

### Opción B: Microsoft Azure

1. **Azure SQL Database**: el plan Basic o S0 alcanza para 700 usuarios. Permita el acceso desde servicios de Azure.
2. **Azure App Service** (Linux, Node 22, plan B1 o superior): despliegue la carpeta (por ZIP deploy o GitHub) y cargue las variables del `.env` en *Configuración → Variables de entorno*. El comando de inicio es `node server.js`. Use `DB_ENCRYPT=true`.
3. HTTPS viene incluido con App Service. Active *Always On* para que corran las tareas automáticas (vencimientos y correos).

### Capacidad

32 emprendedores y alrededor de 700 compradores es una carga baja. Una instancia B1 o un servidor interno modesto lo maneja bien. El pool de conexiones a SQL está en 20.

## Antes del evento (lista de verificación)

1. Ajustes: confirmar la fecha del evento (27/11/2026) y las reglas de saldo, y luego *Recalcular saldos* si cambiaron. Revisar la lista de **categorías**, decidir si se permite el **PIN** o solo el código de pago y poner el **WhatsApp de la mesa de ayuda**.
2. Importar el Excel de emprendedores y luego el de compradores. Revisar las filas con error.
3. Crear las cuentas de administrador desde *Usuarios*.
4. Enviar los accesos por correo y, para quien no tenga correo, imprimir las credenciales. Una vez entregados todos, usar *Ajustes → Borrar credenciales temporales* para que no queden contraseñas ni PIN legibles en la base.
5. Pedir a los emprendedores que ingresen, cambien su contraseña, **elijan su categoría** y carguen sus productos.
6. Avisar a los compradores que paguen con el **código de pago** desde su celular y que nunca digan su PIN en voz alta.
7. Hacer una venta de prueba con código de pago y anularla.
8. Durante el evento, tener una mesa de ayuda con un super administrador para resetear contraseñas y PIN, y un administrador revisando el *Panel* por si aparecen compras reportadas.

## Estructura

```
server.js            arranque, tareas automáticas cada minuto
src/api.js           rutas HTTP (autenticación, compras, ventas, admin, super admin)
src/ventas.js        reglas de negocio de ventas, PIN, anulaciones, vencimientos
src/db.js            capa de datos (SQL Server / SQLite demo)
src/xlsx.js          lector de Excel/CSV sin dependencias
src/mailer.js        cola y plantillas de correo
db/schema.*.sql      esquema de la base de datos
public/              interfaz (HTML/CSS/JS, sin compilación)
```
