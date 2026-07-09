// Muerte online vacía el inventario persistido.
'use strict';

const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require(path.join(__dirname, 'node_modules', 'ws'));
const db = require('./db');

const PUERTO = 8126;
const REPO = path.join(__dirname, '..');
const TOKEN = 'test-muerte-inv';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function sesion() {
  return new Promise((res, rej) => {
    const estado = { inv: [], msgs: [] };
    const ws = new WebSocket(`ws://127.0.0.1:${PUERTO}/ws`);
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'hola', nombre: 'Muerte', token: TOKEN, v: 7, nivel: 'level-1' }));
    });
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      estado.msgs.push(m);
      if (m.t === 'bienvenida') estado.inv = m.inv || [];
      if (m.t === 'inv') estado.inv = m.inv || [];
      if (m.t === 'bienvenida') res({ ws, estado, enviar: (o) => ws.send(JSON.stringify(o)) });
    });
    ws.on('error', rej);
    setTimeout(() => rej(new Error('timeout')), 4000);
  });
}

(async () => {
  const fallos = [];
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fallos.push(m); };

  const server = spawn(process.execPath, ['server/server.js', String(PUERTO)], {
    cwd: REPO,
    env: { ...process.env, MMO_DEV: '1' },
    stdio: 'ignore',
  });
  await espera(900);

  try {
    const s = await sesion();
    s.enviar({ t: 'loot', id: 'botiquin' });
    await espera(400);
    ok(s.estado.inv.includes('botiquin'), 'loot antes de morir');

    s.ws.close();
    await espera(300);
    // Tras morir, sala.morir() vacía y persiste — simulamos ese estado en BD
    db.guardarInventario(TOKEN, [], [null, null], { cara: null, cuerpo: null, pies: null });
    await espera(100);

    const s2 = await sesion();
    ok(!s2.estado.inv.length, 'reconectar tras muerte: inventario vacío');
    s2.ws.close();
  } finally {
    server.kill();
  }

  console.log(fallos.length ? `\n✗ ${fallos.length} fallos` : '\n✓ muerte vacía inventario OK');
  process.exit(fallos.length ? 1 : 0);
})();
