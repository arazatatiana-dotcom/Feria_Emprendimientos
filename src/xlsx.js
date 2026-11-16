'use strict';
/*
 * Lector mínimo de Excel (.xlsx) y CSV sin dependencias.
 * Devuelve la primera hoja como arreglo de objetos usando la fila 1 como encabezados.
 */
const zlib = require('zlib');

function unzip(buf) {
  // Ubicar el "End of Central Directory"
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('El archivo no es un Excel (.xlsx) válido');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const lnlen = buf.readUInt16LE(off + 26), lelen = buf.readUInt16LE(off + 28);
    const start = off + 30 + lnlen + lelen;
    const data = buf.subarray(start, start + csize);
    files[name] = () => (method === 0 ? data : zlib.inflateRawSync(data)).toString('utf8');
    p += 46 + nlen + elen + clen;
  }
  return files;
}

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
const textOf = (xml) => decode([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]).join(''));

function colIndex(ref) {
  const letters = ref.replace(/\d+/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function readXlsx(buf) {
  const files = unzip(buf);
  const shared = files['xl/sharedStrings.xml'] ? [...files['xl/sharedStrings.xml']().matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => textOf(m[1])) : [];
  // Primera hoja según workbook.xml
  let sheetPath = 'xl/worksheets/sheet1.xml';
  try {
    const wb = files['xl/workbook.xml']();
    const rid = wb.match(/<sheet [^>]*r:id="([^"]+)"/)[1];
    const rels = files['xl/_rels/workbook.xml.rels']();
    const target = rels.match(new RegExp(`<Relationship [^>]*Id="${rid}"[^>]*Target="([^"]+)"`)) ||
      rels.match(new RegExp(`<Relationship [^>]*Target="([^"]+)"[^>]*Id="${rid}"`));
    if (target) sheetPath = target[1].startsWith('/') ? target[1].slice(1) : 'xl/' + target[1];
  } catch (_) { /* usar sheet1 */ }
  if (!files[sheetPath]) throw new Error('No se encontró la hoja de cálculo');
  // Estilos: detectar qué celdas tienen formato de fecha
  const dateStyles = new Set();
  if (files['xl/styles.xml']) {
    const st = files['xl/styles.xml']();
    const custom = {};
    for (const m of st.matchAll(/<numFmt [^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) custom[m[1]] = m[2];
    const cellXfs = (st.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/) || [])[1] || '';
    [...cellXfs.matchAll(/<xf [^>]*?numFmtId="(\d+)"/g)].forEach((m, i) => {
      const id = +m[1];
      const fmt = custom[id] || '';
      if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || /[dy]/i.test(fmt.replace(/\[[^\]]*\]|"[^"]*"/g, ''))) dateStyles.add(i);
    });
  }
  const rows = [];
  for (const rm of files[sheetPath]().matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], inner = cm[2] || '';
      const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1];
      const t = (attrs.match(/t="(\w+)"/) || [])[1];
      const s = +((attrs.match(/s="(\d+)"/) || [])[1] || -1);
      const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val;
      if (t === 's') val = shared[+v];
      else if (t === 'inlineStr') val = textOf(inner);
      else if (t === 'str') val = v !== undefined ? decode(v) : '';
      else if (t === 'b') val = v === '1';
      else if (v !== undefined) {
        val = Number(v);
        if (dateStyles.has(s)) val = excelDate(val);
      } else val = '';
      row[ref ? colIndex(ref) : row.length] = val;
    }
    rows.push(row);
  }
  return toObjects(rows);
}

function excelDate(serial) {
  const d = new Date(Math.round((serial - 25569) * 86400e3));
  return d.toISOString().slice(0, 10);
}

function readCsv(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/)[0];
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return toObjects(rows);
}

// Normaliza encabezados: "Fecha de Ingreso" -> "fecha_de_ingreso"
const normKey = (k) => String(k ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function toObjects(rows) {
  const clean = rows.filter(r => r && r.some(v => v !== '' && v !== undefined && v !== null));
  if (!clean.length) return [];
  const headers = clean[0].map(normKey);
  return clean.slice(1).map((r, i) => {
    const o = { __fila: i + 2 };
    headers.forEach((h, j) => { if (h) o[h] = r[j] === undefined ? '' : r[j]; });
    return o;
  });
}

function readSheet(filename, base64) {
  const buf = Buffer.from(base64, 'base64');
  if (/\.csv$/i.test(filename) || /\.txt$/i.test(filename)) return readCsv(buf.toString('utf8'));
  if (/\.xls$/i.test(filename)) throw new Error('Formato .xls antiguo: guarde el archivo como .xlsx o .csv');
  return readXlsx(buf);
}

// Busca el primer campo presente entre varios nombres posibles de columna
function pick(row, ...names) {
  for (const n of names) if (row[n] !== undefined && row[n] !== '') return row[n];
  return '';
}

module.exports = { readSheet, pick, normKey };
