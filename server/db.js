// BACKROOMS MMO — persistencia con el SQLite NATIVO de Node (node:sqlite,
// Node 22.13+): cero dependencias. Cada jugador es su token anónimo del
// navegador; aquí viven su sintonía, su códice, alijo seguro y mochila de salida.
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
    equipo TEXT DEFAULT '{"cara":null,"cuerpo":null,"pies":null}',
    alijo TEXT DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS visitas (
    token TEXT,
    nivel TEXT,
    veces INTEGER DEFAULT 0,
    PRIMARY KEY (token, nivel)
  );
`);

for (const sql of [
  "ALTER TABLE jugadores ADD COLUMN inv TEXT DEFAULT '[]'",
  "ALTER TABLE jugadores ADD COLUMN manos TEXT DEFAULT '[null,null]'",
  "ALTER TABLE jugadores ADD COLUMN equipo TEXT DEFAULT '{\"cara\":null,\"cuerpo\":null,\"pies\":null}'",
  "ALTER TABLE jugadores ADD COLUMN alijo TEXT DEFAULT '[]'",
]) {
  try { db.exec(sql); } catch (e) { /* ya existe */ }
}

function run(sql, ...args) { db.prepare(sql).run(...args); }
function get(sql, ...args) { return db.prepare(sql).get(...args); }

function parseJSON(txt, fallback) {
  try { return JSON.parse(txt); }
  catch (e) { return fallback; }
}

function leerLoadout(fila) {
  if (!fila) return { inv: [], manos: [null, null], equipo: { cara: null, cuerpo: null, pies: null } };
  return {
    inv: parseJSON(fila.inv, []),
    manos: parseJSON(fila.manos, [null, null]),
    equipo: parseJSON(fila.equipo, { cara: null, cuerpo: null, pies: null }),
  };
}

function leerAlijo(fila) {
  return { inv: parseJSON(fila?.alijo, []) };
}

function conectar(token, nombre) {
  const ahora = Date.now();
  run(
    'INSERT INTO jugadores (token, nombre, creado, visto) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT(token) DO UPDATE SET nombre = excluded.nombre, visto = excluded.visto',
    token, nombre, ahora, ahora
  );
  const fila = get('SELECT * FROM jugadores WHERE token = ?', token);
  const loadout = leerLoadout(fila);
  const alijo = leerAlijo(fila);
  return {
    muertes: fila.muertes | 0,
    escapes: fila.escapes | 0,
    baneado: !!fila.baneado,
    niveles: get('SELECT COUNT(*) AS n FROM visitas WHERE token = ?', token).n | 0,
    loadout,
    alijo,
    inventario: loadout,
  };
}

function guardarLoadout(token, inv, manos, equipo) {
  run(
    'UPDATE jugadores SET inv = ?, manos = ?, equipo = ? WHERE token = ?',
    JSON.stringify(inv), JSON.stringify(manos), JSON.stringify(equipo), token
  );
}

function guardarAlijo(token, inv) {
  run('UPDATE jugadores SET alijo = ? WHERE token = ?', JSON.stringify(inv), token);
}

const guardarInventario = guardarLoadout;

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
  conectar, guardarLoadout, guardarAlijo, guardarInventario,
  sumarMuerte, sumarEscape, registrarVisita, ban,
};
