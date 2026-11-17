'use strict';
/*
 * Capa de datos con dos motores intercambiables:
 *  - mssql : SQL Server interno o Azure SQL (producción)
 *  - sqlite: modo demo/pruebas usando node:sqlite (sin instalar nada)
 * El código de la app usa solo SQL estándar con parámetros @nombre,
 * más los helpers insert() y tx().
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');

function normRow(row) {
  if (!row) return row;
  for (const k of Object.keys(row)) {
    const v = row[k];
    if (v instanceof Date) row[k] = v.toISOString();
    else if (typeof v === 'boolean') row[k] = v ? 1 : 0;
    else if (typeof v === 'bigint') row[k] = Number(v);
  }
  return row;
}

// ---------------- SQL Server ----------------
async function createMssql() {
  const sql = require('mssql');
  const pool = await new sql.ConnectionPool({
    server: config.db.server,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    options: { encrypt: config.db.encrypt, trustServerCertificate: config.db.trustCert },
    pool: { max: 20, min: 2, idleTimeoutMillis: 30000 },
  }).connect();

  function bind(req, params = {}) {
    for (const [k, v] of Object.entries(params)) {
      if (v instanceof Date) req.input(k, sql.DateTime2, v);
      else if (typeof v === 'number' && !Number.isInteger(v)) req.input(k, sql.Decimal(12, 2), v);
      else if (typeof v === 'string') req.input(k, sql.NVarChar(v.length > 4000 ? sql.MAX : 4000), v);
      else req.input(k, v === undefined ? null : v);
    }
    return req;
  }
  function api(getReq) {
    return {
      async query(text, params) {
        const r = await bind(getReq(), params).query(text);
        return (r.recordset || []).map(normRow);
      },
      async get(text, params) { return (await this.query(text, params))[0]; },
      async run(text, params) {
        const r = await bind(getReq(), params).query(text);
        return { changes: (r.rowsAffected || []).reduce((a, b) => a + b, 0) };
      },
      async insert(table, obj) {
        const keys = Object.keys(obj);
        const r = await bind(getReq(), obj).query(
          `INSERT INTO ${table} (${keys.join(',')}) OUTPUT INSERTED.id VALUES (${keys.map(k => '@' + k).join(',')})`);
        return r.recordset[0].id;
      },
    };
  }
  const base = api(() => pool.request());
  base.dialect = 'mssql';
  base.tx = async (fn) => {
    for (let intento = 1; ; intento++) {
      const t = new sql.Transaction(pool);
      await t.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
      try {
        const res = await fn(api(() => new sql.Request(t)));
        await t.commit();
        return res;
      } catch (err) {
        try { await t.rollback(); } catch (_) { /* ya revertida */ }
        if (err && err.number === 1205 && intento < 3) continue; // deadlock: reintentar
        throw err;
      }
    }
  };
  base.migrate = async () => {
    const text = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.mssql.sql'), 'utf8')
      .replace(/^--.*$/gm, '');
    for (const stmt of text.split(/\n(?=IF )/)) if (stmt.trim()) await pool.request().batch(stmt);
  };
  base.close = () => pool.close();
  return base;
}

// ---------------- SQLite (demo) ----------------
function createSqlite() {
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(path.dirname(config.db.sqliteFile), { recursive: true });
  const db = new DatabaseSync(config.db.sqliteFile);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');

  // node:sqlite rechaza parámetros que no aparecen en la consulta: se filtran
  const conv = (params = {}, text = '') => {
    const o = {};
    for (const [k, v] of Object.entries(params)) {
      if (!new RegExp('@' + k + '\\b').test(text)) continue;
      o[k] = v instanceof Date ? v.toISOString() : (v === undefined ? null : v);
    }
    return o;
  };
  // Las transacciones son asíncronas: un candado evita que otras peticiones se mezclen
  let lock = Promise.resolve();
  const sync = {
    async query(text, params) { return db.prepare(text).all(conv(params, text)).map(r => normRow({ ...r })); },
    async get(text, params) { return (await this.query(text, params))[0]; },
    async run(text, params) { const r = db.prepare(text).run(conv(params, text)); return { changes: Number(r.changes) }; },
    async insert(table, obj) {
      const keys = Object.keys(obj);
      const text = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(k => '@' + k).join(',')})`;
      const r = db.prepare(text).run(conv(obj, text));
      return Number(r.lastInsertRowid);
    },
  };
  const waitLock = (fn) => async (...a) => { await lock; return fn.apply(sync, a); };
  const base = {
    dialect: 'sqlite',
    query: waitLock(sync.query), get: waitLock(sync.get), run: waitLock(sync.run), insert: waitLock(sync.insert),
    tx(fn) {
      const p = lock.then(async () => {
        db.exec('BEGIN IMMEDIATE');
        try { const r = await fn(sync); db.exec('COMMIT'); return r; }
        catch (e) { db.exec('ROLLBACK'); throw e; }
      });
      lock = p.catch(() => {});
      return p;
    },
    async migrate() {
      db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sqlite.sql'), 'utf8'));
      // SQLite no tiene "ADD COLUMN IF NOT EXISTS": se revisa cada columna agregada después
      const nuevas = [['emprendimientos', 'categoria', 'TEXT'], ['ventas', 'idem', 'TEXT'], ['ventas', 'reporte', 'TEXT'],
        ['ventas', 'reporte_estado', 'TEXT'], ['ventas', 'reportada_en', 'TEXT'], ['codigos_pago', 'codigo_clave', 'TEXT']];
      for (const [tabla, col, tipo] of nuevas) {
        const cols = db.prepare(`PRAGMA table_info(${tabla})`).all().map(c => c.name);
        if (!cols.includes(col)) db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${col} ${tipo}`);
      }
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS UX_ventas_idem ON ventas(vendedor_id, idem) WHERE idem IS NOT NULL');
      db.exec('CREATE INDEX IF NOT EXISTS IX_codigos_clave ON codigos_pago(codigo_clave)');
    },
    close() { db.close(); },
  };
  return base;
}

let instance;
async function init() {
  if (instance) return instance;
  instance = config.db.driver === 'mssql' ? await createMssql() : createSqlite();
  await instance.migrate();
  return instance;
}
module.exports = { init, get: () => instance };
