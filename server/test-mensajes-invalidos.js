// Antes del fix, un fallo dentro de ws.on('message') no se capturaba: una
// excepción de CUALQUIER jugador tumbaba el proceso entero y desconectaba a
// todo el mundo. Este arnés inyecta un fallo determinista en sala.posicion()
// (una asunción rota río abajo, simulada — el resto del código ya es muy
// defensivo y no deja fisuras naturales para forzar el mismo bug) y verifica
// el contrato nuevo: (1) el proceso sigue vivo, (2) al jugador que disparó el
// fallo se le cierra el socket (1011, estado irrecuperable para ESA conexión
// — cambiarDeSala() puede dejarlo a medio camino entre salas), (3) el resto
// de jugadores no se entera y sigue jugando con normalidad.
//
// El fallo se inyecta con `node -e` + `--require` implícito: el script
// arranca ANTES que server.js, parchea Sala.prototype.posicion para que la
// PRIMERA llamada lance, y luego requiere server.js normalmente — así el
// servidor real (el mismo código que en producción) corre en este mismo
// proceso hijo, sin tocar ni un byte de server.js/sala.js.
'use strict';
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require(path.join(__dirname, 'node_modules', 'ws'));

const PUERTO = 8129;
const REPO = path.join(__dirname, '..');
const SALA_PATH = path.join(REPO, 'game', 'js', 'sim', 'sala.js');
const SERVER_PATH = path.join(REPO, 'server', 'server.js');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function leerClaveInicial(server) {
  return new Promise((resolve) => {
    let buf = '';
    server.stdout.on('data', (d) => {
      buf += d.toString();
      if (/clave de admin:/.test(buf)) resolve();
    });
  });
}

function cliente(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PUERTO}/ws`);
    const msgs = [];
    let cerrado = false;
    ws.on('close', () => { cerrado = true; });
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'hola', nombre: 'Arnes', token, v: 9, nivel: 'level-1' }));
    });
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      msgs.push(m);
      if (m.t === 'bienvenida') resolve({ ws, msgs, enviar: (o) => ws.send(JSON.stringify(o)), estaCerrado: () => cerrado });
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('timeout conectando')), 4000);
  });
}

function esperaMsg(c, pred, ms = 3000) {
  return new Promise((resolve, reject) => {
    const antes = c.msgs.length;
    const t0 = Date.now();
    const check = () => {
      for (let i = antes; i < c.msgs.length; i++) if (pred(c.msgs[i])) return resolve(c.msgs[i]);
      if (Date.now() - t0 > ms) return reject(new Error('timeout esperando mensaje'));
      setTimeout(check, 30);
    };
    check();
  });
}

function esperaCierre(ws, ms = 3000) {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.CLOSED) return resolve();
    ws.on('close', resolve);
    setTimeout(() => reject(new Error('timeout esperando cierre')), ms);
  });
}

const fallos = [];
function ok(cond, msg) { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fallos.push(msg); }

(async () => {
  const codigoInyeccion = `
    process.argv[2] = ${JSON.stringify(String(PUERTO))};
    const { Sala } = require(${JSON.stringify(SALA_PATH)});
    const original = Sala.prototype.posicion;
    let usado = false;
    Sala.prototype.posicion = function (jug, m) {
      if (!usado) { usado = true; throw new Error('fallo forzado de prueba (fixture test-mensajes-invalidos)'); }
      return original.call(this, jug, m);
    };
    require(${JSON.stringify(SERVER_PATH)});
  `;
  const server = spawn(process.execPath, ['-e', codigoInyeccion], {
    cwd: REPO, env: { ...process.env, MMO_DEV: '1' },
  });
  let stderr = '';
  server.stderr.on('data', (d) => { stderr += d.toString(); });
  await leerClaveInicial(server);
  await espera(600);

  const a = await cliente('arnes-mensajes-invalidos-a');
  const b = await cliente('arnes-mensajes-invalidos-b');

  // A dispara el fallo forzado con un mensaje de posición perfectamente válido
  a.enviar({ t: 'p', x: 5, y: 5, rot: 0 });
  await esperaCierre(a.ws);
  ok(true, 'A recibe el cierre del socket tras el fallo forzado');

  await espera(300);
  ok(server.exitCode === null && !server.killed, 'el proceso del servidor sigue vivo tras la excepción');

  // B nunca se entera: sigue conectado y puede seguir actuando con normalidad
  ok(b.ws.readyState === WebSocket.OPEN, 'B mantiene su conexión abierta');
  b.enviar({ t: 'ping', ts: 123 });
  const pong = await esperaMsg(b, (m) => m.t === 'pong');
  ok(pong.ts === 123, 'B sigue respondiendo con normalidad tras el fallo de A (pong)');

  b.enviar({ t: 'p', x: 5.1, y: 5, rot: 0 });
  await espera(200); // sin respuesta esperada: solo confirma que no lanza ni desconecta
  ok(b.ws.readyState === WebSocket.OPEN, 'B sigue conectado tras reportar su propia posición');

  // un cliente nuevo también puede entrar: el servidor sigue operativo del todo
  const c = await cliente('arnes-mensajes-invalidos-c');
  ok(!!c, 'un cliente nuevo puede conectarse tras el incidente');

  a.ws.close(); b.ws.close(); c.ws.close();
  server.kill();

  console.log(fallos.length ? `\n✗ ${fallos.length} fallos` : '\n✓ TODO OK');
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
