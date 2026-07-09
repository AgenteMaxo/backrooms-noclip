// Prueba de persistencia de inventario en SQLite (sin arnés completo).
'use strict';

const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require(path.join(__dirname, 'node_modules', 'ws'));

const PUERTO = 8124;
const REPO = path.join(__dirname, '..');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function cliente(token) {
  return new Promise((res, rej) => {
    const inv = [];
    const ws = new WebSocket(`ws://127.0.0.1:${PUERTO}/ws`);
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'hola', nombre: 'Persist', token, v: 8, nivel: 'level-1' }));
    });
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.t === 'bienvenida') { inv.push(...(m.inv || [])); res({ ws, inv, cerrar: () => ws.close() }); }
      if (m.t === 'inv') { inv.length = 0; inv.push(...m.inv); }
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
    const TOKEN = 'test-persist-inv';
    const s1 = await cliente(TOKEN);
    s1.ws.send(JSON.stringify({ t: 'loot', id: 'trebol' }));
    await espera(400);
    ok(s1.inv.includes('trebol'), 'loot en sesión 1');
    s1.cerrar();
    await espera(300);

    const s2 = await cliente(TOKEN);
    ok(s2.inv.includes('trebol'), 'inventario al reconectar');
    s2.cerrar();
  } finally {
    server.kill();
  }

  console.log(fallos.length ? `\n✗ ${fallos.length} fallos` : '\n✓ persistencia OK');
  process.exit(fallos.length ? 1 : 0);
})();
