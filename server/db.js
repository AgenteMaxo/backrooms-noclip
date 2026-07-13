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

const qCarga = db.prepare('SELECT * FROM jugadores WHERE token = ?');
const qAlta = db.prepare(
  'INSERT INTO jugadores (token, nombre, creado, visto) VALUES (?, ?, ?, ?) ' +
  'ON CONFLICT(token) DO UPDATE SET nombre = excluded.nombre, visto = excluded.visto'
);
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
  return {
    muertes: fila.muertes | 0,
    escapes: fila.escapes | 0,
    baneado: !!fila.baneado,
    niveles: qNiveles.get(token).n | 0,
  };
}

function sumarMuerte(token) { qMuerte.run(token); }
function sumarEscape(token) { qEscape.run(token); }
function registrarVisita(token, nivel) { qVisita.run(token, nivel); }
function ban(token, si = true) { qBan.run(si ? 1 : 0, token); }

const qResumen = db.prepare(
  'SELECT COUNT(*) AS n, COALESCE(SUM(muertes),0) AS m, COALESCE(SUM(escapes),0) AS e, ' +
  'COALESCE(SUM(baneado),0) AS b FROM jugadores'
);
const qActivos = db.prepare('SELECT COUNT(*) AS n FROM jugadores WHERE visto > ?');
const qTopNiveles = db.prepare(
  'SELECT nivel, SUM(veces) AS visitas, COUNT(*) AS errantes FROM visitas ' +
  'GROUP BY nivel ORDER BY visitas DESC LIMIT 12'
);

// resumen histórico para el observatorio: cuánta gente ha pasado por aquí,
// cuánta murió/escapó y qué niveles pisan de verdad (decisiones de contenido)
function resumen() {
  const f = qResumen.get();
  const dia = Date.now() - 24 * 3600 * 1000;
  return {
    registrados: f.n | 0, muertes: f.m | 0, escapes: f.e | 0, baneados: f.b | 0,
    activos24h: qActivos.get(dia).n | 0,
    nivelesTop: qTopNiveles.all().map((r) => ({
      nivel: r.nivel, visitas: r.visitas | 0, errantes: r.errantes | 0,
    })),
  };
}

module.exports = { db, conectar, sumarMuerte, sumarEscape, registrarVisita, ban, resumen };
