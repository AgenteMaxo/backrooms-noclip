// BACKROOMS MMO — persistencia con el SQLite NATIVO de Node (node:sqlite,
// Node 22.13+): cero dependencias. Cada jugador es su token anónimo del
// navegador; aquí viven su sintonía, su códice de niveles, el inventario y los baneos.
'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DIR = path.join(__dirname, 'datos');
fs.mkdirSync(DIR, { recursive: true });
const db = new DatabaseSync(path.join(DIR, 'mmo.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS jugadores (
    token TEXT PRIMARY KEY,
    nombre TEXT,
    sintonia INTEGER DEFAULT 0,
    muertes INTEGER DEFAULT 0,
    escapes INTEGER DEFAULT 0,
    baneado INTEGER DEFAULT 0,
    creado INTEGER,
    visto INTEGER,
    inv TEXT DEFAULT '[]',
    manos TEXT DEFAULT '[null,null]',
    equipo TEXT DEFAULT '{"cara":null,"cuerpo":null,"pies":null}'
  );
  CREATE TABLE IF NOT EXISTS visitas (
    token TEXT,
    nivel TEXT,
    veces INTEGER DEFAULT 0,
    PRIMARY KEY (token, nivel)
  );
`);

// Bases antiguas sin columnas de inventario.
for (const sql of [
  "ALTER TABLE jugadores ADD COLUMN inv TEXT DEFAULT '[]'",
  "ALTER TABLE jugadores ADD COLUMN manos TEXT DEFAULT '[null,null]'",
  "ALTER TABLE jugadores ADD COLUMN equipo TEXT DEFAULT '{\"cara\":null,\"cuerpo\":null,\"pies\":null}'",
]) {
  try { db.exec(sql); } catch (e) { /* ya existe */ }
}

// prepare() cacheado se invalida en algunos Node con DDL previo — cada
// consulta se prepara al vuelo (el tráfico de persistencia es bajo).
function run(sql, ...args) { db.prepare(sql).run(...args); }
function get(sql, ...args) { return db.prepare(sql).get(...args); }

function parseJSON(txt, fallback) {
  try { return JSON.parse(txt); }
  catch (e) { return fallback; }
}

function leerInventario(fila) {
  if (!fila) return { inv: [], manos: [null, null], equipo: { cara: null, cuerpo: null, pies: null } };
  return {
    inv: parseJSON(fila.inv, []),
    manos: parseJSON(fila.manos, [null, null]),
    equipo: parseJSON(fila.equipo, { cara: null, cuerpo: null, pies: null }),
  };
}

// Al conectar: da de alta (o refresca) y devuelve el expediente del errante.
function conectar(token, nombre) {
  const ahora = Date.now();
  run(
    'INSERT INTO jugadores (token, nombre, creado, visto) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT(token) DO UPDATE SET nombre = excluded.nombre, visto = excluded.visto',
    token, nombre, ahora, ahora
  );
  const fila = get('SELECT * FROM jugadores WHERE token = ?', token);
  return {
    muertes: fila.muertes | 0,
    escapes: fila.escapes | 0,
    baneado: !!fila.baneado,
    niveles: get('SELECT COUNT(*) AS n FROM visitas WHERE token = ?', token).n | 0,
    inventario: leerInventario(fila),
  };
}

function guardarInventario(token, inv, manos, equipo) {
  run(
    'UPDATE jugadores SET inv = ?, manos = ?, equipo = ? WHERE token = ?',
    JSON.stringify(inv), JSON.stringify(manos), JSON.stringify(equipo), token
  );
}

function sumarMuerte(token) {
  run('UPDATE jugadores SET muertes = muertes + 1 WHERE token = ?', token);
}
function sumarEscape(token) {
  run('UPDATE jugadores SET escapes = escapes + 1 WHERE token = ?', token);
}
function registrarVisita(token, nivel) {
  run(
    'INSERT INTO visitas (token, nivel, veces) VALUES (?, ?, 1) ' +
    'ON CONFLICT(token, nivel) DO UPDATE SET veces = veces + 1',
    token, nivel
  );
}
function ban(token, si = true) {
  run('UPDATE jugadores SET baneado = ? WHERE token = ?', si ? 1 : 0, token);
}

module.exports = {
  conectar, guardarInventario, sumarMuerte, sumarEscape, registrarVisita, ban,
};
