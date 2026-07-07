// Enjambre de bots para probar BACKROOMS MMO.
// Uso: node server/bots.js [n] [url]   → node server/bots.js 50 ws://localhost:8080/ws
// Cada bot camina al azar (respetando el cooldown) y suelta frases de vez en cuando.
'use strict';

const WebSocket = require('ws');

const N = parseInt(process.argv[2], 10) || 50;
const URL = process.argv[3] || 'ws://localhost:8080/ws';
const NIVEL = process.argv[4] || undefined; // p. ej. level-1 (prueba de entidades)
const FRASES = [
  'hola?', '¿alguien más oye el zumbido?', 'por aquí hay una grieta',
  'seguidme', 'me pierdo', 'este pasillo no estaba antes', 'corred',
  'llevo horas caminando', 'qué es ESO', 'las luces parpadean',
];

let conectados = 0, movidos = 0, chats = 0, cruces = 0;

function bot(i) {
  const ws = new WebSocket(URL);
  ws.on('open', () => {
    conectados++;
    ws.send(JSON.stringify({ t: 'hola', nombre: `Bot-${i}`, token: `bot-${i}`, v: 3, nivel: NIVEL }));
    // v22: los bots cambian de RUMBO (vector continuo) en vez de dar pasos
    const rumbo = setInterval(() => {
      if (ws.readyState !== 1) { clearInterval(rumbo); return; }
      const quieto = Math.random() < 0.15;
      const ang = Math.random() * Math.PI * 2;
      ws.send(JSON.stringify({
        t: 'input',
        dx: quieto ? 0 : Math.sin(ang),
        dy: quieto ? 0 : -Math.cos(ang),
      }));
      if (!quieto) ws.send(JSON.stringify({ t: 'rot', th: ang }));
      movidos++;
      if (Math.random() < 0.08) {
        ws.send(JSON.stringify({ t: 'chat', txt: FRASES[Math.floor(Math.random() * FRASES.length)] }));
        chats++;
      }
    }, 600 + Math.random() * 900);
  });
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    // a veces cruzan la salida que pisan: prueba el cambio de sala en caliente
    if (m.t === 'oferta') {
      setTimeout(() => {
        if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'cruzar', si: Math.random() < 0.3 }));
      }, 300);
      cruces++;
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
  console.log(`bots: ${conectados}/${N} conectados · ${movidos} pasos · ${chats} chats`);
  movidos = 0; chats = 0;
}, 5000);
