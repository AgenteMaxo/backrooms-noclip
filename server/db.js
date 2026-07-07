// BACKROOMS MMO — persistencia con el SQLite NATIVO de Node (node:sqlite,
// Node 22.13+): cero dependencias. Cada jugador es su token anónimo del
// navegador; aquí viven su sintonía, su códice de niveles y los baneos.
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
    visto INTEGER
  );
  CREATE TABLE IF NOT EXISTS visitas (
    token TEXT,
    nivel TEXT,
    veces INTEGER DEFAULT 0,
    PRIMARY KEY (token, nivel)
  );
`);
// columna añadida en v21 (instintos online): migración suave
try { db.exec('ALTER TABLE jugadores ADD COLUMN instintos TEXT DEFAULT "[]"'); } catch (e) {}

const qCarga = db.prepare('SELECT * FROM jugadores WHERE token = ?');
const qAlta = db.prepare(
  'INSERT INTO jugadores (token, nombre, creado, visto) VALUES (?, ?, ?, ?) ' +
  'ON CONFLICT(token) DO UPDATE SET nombre = excluded.nombre, visto = excluded.visto'
);
const qSintonia = db.prepare('UPDATE jugadores SET sintonia = ? WHERE token = ?');
const qMuerte = db.prepare('UPDATE jugadores SET muertes = muertes + 1 WHERE token = ?');
const qEscape = db.prepare('UPDATE jugadores SET escapes = escapes + 1 WHERE token = ?');
const qBan = db.prepare('UPDATE jugadores SET baneado = ? WHERE token = ?');
const qVisita = db.prepare(
  'INSERT INTO visitas (token, nivel, veces) VALUES (?, ?, 1) ' +
  'ON CONFLICT(token, nivel) DO UPDATE SET veces = veces + 1'
);
const qNiveles = db.prepare('SELECT COUNT(*) AS n FROM visitas WHERE token = ?');

// Al conectar: da de alta (o refresca) y devuelve el expediente del errante.
function conectar(token, nombre) {
  const ahora = Date.now();
  qAlta.run(token, nombre, ahora, ahora);
  const fila = qCarga.get(token);
  let instintos = [];
  try { instintos = JSON.parse(fila.instintos || '[]'); } catch (e) {}
  return {
    sintonia: fila.sintonia | 0,
    muertes: fila.muertes | 0,
    escapes: fila.escapes | 0,
    baneado: !!fila.baneado,
    niveles: qNiveles.get(token).n | 0,
    instintos,
  };
}

const qInstintos = db.prepare('UPDATE jugadores SET instintos = ? WHERE token = ?');
function guardarInstintos(token, lista) { qInstintos.run(JSON.stringify(lista || []), token); }

function guardarSintonia(token, v) { qSintonia.run(Math.max(0, Math.min(100, v | 0)), token); }
function sumarMuerte(token) { qMuerte.run(token); }
function sumarEscape(token) { qEscape.run(token); }
function registrarVisita(token, nivel) { qVisita.run(token, nivel); }
function ban(token, si = true) { qBan.run(si ? 1 : 0, token); }

module.exports = { conectar, guardarSintonia, guardarInstintos, sumarMuerte, sumarEscape, registrarVisita, ban };
