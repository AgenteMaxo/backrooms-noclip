// La clave de guardián (MMO_ADMIN) antes solo se podía cambiar editando el
// systemd y reiniciando el proceso (process.env se lee una única vez al
// arrancar). Este arnés verifica /admin-clave <nueva>: la cambia en caliente
// sin reiniciar, la persiste en server/datos/admin-clave.txt (fuera del
// repo) y confirma que sobrevive a que el proceso se reinicie solo.
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require(path.join(__dirname, 'node_modules', 'ws'));

const PUERTO = 8125;
const REPO = path.join(__dirname, '..');
const FICHERO = path.join(__dirname, 'datos', 'admin-clave.txt');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function leerClaveInicial(server) {
  return new Promise((resolve) => {
    let buf = '';
    server.stdout.on('data', (d) => {
      buf += d.toString();
      const m = buf.match(/clave de admin: \/admin (\S+)/);
      if (m) resolve(m[1]);
    });
  });
}

function cliente(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PUERTO}/ws`);
    const msgs = [];
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'hola', nombre: 'Arnes', token, v: 9, nivel: 'level-1' }));
    });
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      msgs.push(m);
      if (m.t === 'bienvenida') resolve({ ws, msgs, enviar: (o) => ws.send(JSON.stringify(o)) });
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

const fallos = [];
function ok(cond, msg) { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fallos.push(msg); }

(async () => {
  try { fs.unlinkSync(FICHERO); } catch (e) { /* no había clave guardada de antes */ }

  let server = spawn(process.execPath, ['server/server.js', String(PUERTO)], {
    cwd: REPO, env: { ...process.env, MMO_DEV: '1' },
  });
  const claveInicial = await leerClaveInicial(server);
  await espera(600);

  const c = await cliente('arnes-admin-clave');
  c.enviar({ t: 'admin', clave: claveInicial });
  const r1 = await esperaMsg(c, (m) => m.t === 'admin');
  ok(r1.si === true, `login con la clave inicial (aleatoria de arranque)`);

  c.enviar({ t: 'chat', txt: '/admin-clave clave-de-prueba-nueva' });
  const r2 = await esperaMsg(c, (m) => m.t === 'aviso' && /guardada/i.test(m.txt));
  ok(!!r2, 'el servidor confirma que guardó la nueva clave en disco');
  ok(fs.existsSync(FICHERO) && fs.readFileSync(FICHERO, 'utf8').trim() === 'clave-de-prueba-nueva',
    'el fichero admin-clave.txt contiene la clave nueva');

  c.ws.close();
  server.kill();
  await espera(500);

  // reinicia el proceso SIN pasar MMO_ADMIN: debe recoger la clave guardada
  server = spawn(process.execPath, ['server/server.js', String(PUERTO)], {
    cwd: REPO, env: { ...process.env, MMO_DEV: '1' },
  });
  const claveTrasReinicio = await leerClaveInicial(server);
  ok(claveTrasReinicio === 'clave-de-prueba-nueva', 'tras reiniciar el proceso, la clave sigue siendo la nueva');
  await espera(600);

  const c2 = await cliente('arnes-admin-clave-2');
  c2.enviar({ t: 'admin', clave: 'clave-de-prueba-nueva' });
  const r3 = await esperaMsg(c2, (m) => m.t === 'admin');
  ok(r3.si === true, 'un jugador nuevo puede loguearse con la clave persistida');

  const c3 = await cliente('arnes-admin-clave-3'); // conexión fresca, sin admin aún
  c3.enviar({ t: 'admin', clave: claveInicial });
  const r4 = await esperaMsg(c3, (m) => m.t === 'admin');
  ok(r4.si === false, 'la clave vieja YA NO funciona tras el cambio (conexión nueva)');
  c3.ws.close();

  c2.ws.close();
  server.kill();
  try { fs.unlinkSync(FICHERO); } catch (e) { /* limpieza best-effort */ }

  console.log(fallos.length ? `\n✗ ${fallos.length} fallos` : '\n✓ TODO OK');
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
