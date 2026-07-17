// Enjambre de bots para probar BACKROOMS MMO.
// Uso: node server/bots.js [n] [url]   → node server/bots.js 50 ws://localhost:8080/ws
// v24: el movimiento es del cliente — cada bot genera el MISMO mapa desde la
// semilla, integra la física compartida y reporta posiciones {t:'p'} legales.
'use strict';

const WebSocket = require('ws');
const { generarMapa } = require('./sim/mundo');
const Fisica = require('../game/js/sim/fisica');

const N = parseInt(process.argv[2], 10) || 50;
const URL = process.argv[3] || 'ws://localhost:8080/ws';
const NIVEL = process.argv[4] || undefined; // p. ej. level-1 (prueba de entidades)
const FRASES = [
  'hola?', '¿alguien más oye el zumbido?', 'por aquí hay una grieta',
  'seguidme', 'me pierdo', 'este pasillo no estaba antes', 'corred',
  'llevo horas caminando', 'qué es ESO', 'las luces parpadean',
];

let conectados = 0, informes = 0, chats = 0, rechazos = 0;
const mapas = new Map(); // semilla → map (compartido entre bots de la misma sala)

function mapaDe(nivel, semilla) {
  if (!mapas.has(semilla)) mapas.set(semilla, generarMapa(nivel, semilla).map);
  return mapas.get(semilla);
}

function bot(i) {
  const ws = new WebSocket(URL);
  const st = { x: 0, y: 0, rot: Math.PI, sec: 0, map: null, id: null };
  ws.on('open', () => {
    conectados++;
    ws.send(JSON.stringify({ t: 'hola', nombre: `Bot-${i}`, token: `bot-${i}`, v: 9, nivel: NIVEL }));
    let giro = 0;
    const paso = setInterval(() => {
      if (ws.readyState !== 1) { clearInterval(paso); return; }
      if (!st.map) return;
      // rumbo errático: gira a ratos, como un jugador perdido
      if (Math.random() < 0.12) giro = [-1, 0, 0, 1][Math.floor(Math.random() * 4)];
      const dt = 0.12;
      st.rot = Fisica.normAng(st.rot + giro * Fisica.GIRO_JUGADOR * dt);
      const quieto = Math.random() < 0.06;
      if (!quieto) {
        [st.x, st.y] = Fisica.mover(st.map.grid, st.x, st.y,
          Math.sin(st.rot), -Math.cos(st.rot), dt, Fisica.VEL_JUGADOR);
      }
      ws.send(JSON.stringify({
        t: 'p', x: Math.round(st.x * 100) / 100, y: Math.round(st.y * 100) / 100,
        rot: Math.round(st.rot * 100) / 100, sec: st.sec,
      }));
      informes++;
      if (Math.random() < 0.01) {
        ws.send(JSON.stringify({ t: 'chat', txt: FRASES[Math.floor(Math.random() * FRASES.length)] }));
        chats++;
      }
    }, 120);
  });
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.t === 'bienvenida' || m.t === 'nivel') {
      st.id = m.id ?? st.id;
      st.x = m.x; st.y = m.y;
      st.rot = m.rot ?? Math.PI;
      st.sec = m.sec ?? 0;
      st.map = mapaDe(m.nivel, m.semilla);
    }
    if (m.t === 'mueve' && m.id === st.id) {
      // teleport o rechazo del validador: el bot acata
      st.x = m.x; st.y = m.y;
      if (m.sec !== undefined) { st.sec = m.sec; rechazos++; }
    }
    // a veces cruzan la salida que pisan: prueba el cambio de sala en caliente
    if (m.t === 'oferta') {
      setTimeout(() => {
        if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'cruzar', si: Math.random() < 0.3 }));
      }, 300);
    }
    if (m.t === 'aviso' && /ESPACIO/.test(m.txt) && Math.random() < 0.5) {
      ws.send(JSON.stringify({ t: 'accion' })); // intenta romper la grieta
    }
  });
  ws.on('error', (e) => console.error(`bot ${i}:`, e.message));
  ws.on('close', () => { conectados--; });
}

for (let i = 1; i <= N; i++) setTimeout(() => bot(i), i * 25);

setInterval(() => {
  console.log(`bots: ${conectados}/${N} conectados · ${informes} informes · ${chats} chats · ${rechazos} rechazos`);
  informes = 0; chats = 0; rechazos = 0;
}, 5000);
