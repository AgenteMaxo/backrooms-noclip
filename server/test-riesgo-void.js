// Arnés: paridad de riesgoVoid entre el modo solo y el multijugador. La salida
// arriesgada de level-909 (riesgoVoid: 0.1, sin entidades, sin mecánica previa,
// única salida del nivel) permite aislar la tirada de vacío a un solo dado.
// Sin mocking de RNG, se repite la conexión hasta observar AMBOS desenlaces
// (éxito y muerte) — con p≈10% de morir, 60 intentos dan >99.8% de confianza.
'use strict';

const path = require('path');
const { spawn } = require('child_process');

const REPO = path.join(__dirname, '..');
const WebSocket = require(path.join(REPO, 'server', 'node_modules', 'ws'));
const { MapGen, generarMapa } = require(path.join(REPO, 'server', 'sim', 'mundo'));
const Fisica = require(path.join(REPO, 'game', 'js', 'sim', 'fisica'));

const PUERTO = 8125;
const fallos = [];
function ok(cond, msg) {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) fallos.push(msg);
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

class Cliente {
  constructor(nombre, nivel) {
    this.nombre = nombre; this.nivelPedido = nivel;
    this.buzon = []; this.x = 0; this.y = 0; this.nivel = null; this.map = null; this.id = null;
  }
  conectar() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${PUERTO}/ws`);
      this.ws.on('open', () => {
        this.enviar({ t: 'hola', nombre: this.nombre, token: 'arnes-void-' + this.nombre, v: 7, nivel: this.nivelPedido });
        res();
      });
      this.ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.t === 'bienvenida' || m.t === 'nivel') {
          this.id = m.id ?? this.id;
          this.nivel = m.nivel;
          this.x = m.x; this.y = m.y;
          this.sec = m.sec ?? 0;
          this.map = generarMapa(m.nivel, m.semilla).map;
        }
        if (m.t === 'mueve' && m.id === this.id) {
          this.x = m.x; this.y = m.y;
          if (m.sec !== undefined) this.sec = m.sec;
        }
        this.buzon.push({ m });
      });
      this.ws.on('error', rej);
    });
  }
  enviar(m) { this.ws.send(JSON.stringify(m)); }
  esperaMsg(pred, ms, desde = 0) {
    return new Promise((res, rej) => {
      const t0 = Date.now();
      const mira = () => {
        for (let i = desde; i < this.buzon.length; i++) if (pred(this.buzon[i].m)) return res(this.buzon[i].m);
        if (Date.now() - t0 > ms) return rej(new Error('timeout'));
        setTimeout(mira, 40);
      };
      mira();
    });
  }
  irA(tx, ty, radio = 0.55) {
    return new Promise((res, rej) => {
      const g = this.map.grid;
      const dist = MapGen.bfsDist(g, tx, ty);
      const t0 = Date.now();
      let tAnt = Date.now();
      const paso = setInterval(() => {
        const d = Fisica.dist(this.x, this.y, tx, ty);
        if (d <= radio) { clearInterval(paso); return res(); }
        if (Date.now() - t0 > 90000) {
          clearInterval(paso);
          return rej(new Error(`atascado hacia ${tx},${ty} en ${this.x.toFixed(1)},${this.y.toFixed(1)}`));
        }
        const cx = Fisica.tileDe(this.x), cy = Fisica.tileDe(this.y);
        let destino = [tx, ty];
        const aqui = dist[cy * g.w + cx];
        if (aqui > 1) {
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
            const v = dist[ny * g.w + nx];
            if (v >= 0 && v < aqui) { destino = [nx, ny]; break; }
          }
        }
        const ahora = Date.now();
        const dt = Math.min(0.2, (ahora - tAnt) / 1000);
        tAnt = ahora;
        const vx = destino[0] - this.x, vy = destino[1] - this.y;
        [this.x, this.y] = Fisica.mover(g, this.x, this.y, vx, vy, dt, Fisica.VEL_JUGADOR);
        this.enviar({
          t: 'p', x: Math.round(this.x * 100) / 100, y: Math.round(this.y * 100) / 100,
          rot: Math.round(Math.atan2(vx, -vy) * 100) / 100, sec: this.sec || 0,
        });
      }, 70);
    });
  }
}

(async () => {
  const server = spawn(process.execPath, ['server/server.js', String(PUERTO)], {
    cwd: REPO, env: { ...process.env, MMO_DEV: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => console.error('[server-err]', d.toString().trim()));
  await espera(1200);
  let exitos = 0, muertes = 0;
  const INTENTOS = 60;
  try {
    for (let i = 0; i < INTENTOS && (exitos === 0 || muertes === 0); i++) {
      const c = new Cliente(`Void${i}`, 'level-909');
      await c.conectar();
      await c.esperaMsg((m) => m.t === 'bienvenida', 4000);

      const salida = c.map.exits[0];
      if (i === 0) {
        ok(!!salida && salida.def.tipo === 'arriesgada' && salida.def.riesgoVoid === 0.1,
          'level-909 tiene la salida arriesgada esperada (riesgoVoid: 0.1)');
      }
      await c.irA(salida.x, salida.y, 0.5);
      await c.esperaMsg((m) => m.t === 'oferta', 6000);
      const n0 = c.buzon.length;
      c.enviar({ t: 'cruzar', si: true });
      const dado = await c.esperaMsg((m) => m.t === 'dado' && m.id === c.id, 4000, n0);
      if (i === 0) ok(typeof dado.valor === 'number' && dado.valor >= 1 && dado.valor <= 20,
        `dado válido (${dado.valor})`);
      if (dado.exito) {
        const niv = await c.esperaMsg((m) => m.t === 'nivel', 4000, n0);
        if (exitos === 0) ok(niv.nivel === 'level-910', `éxito: cruzas a ${niv.nivel}`);
        exitos++;
      } else {
        const muere = await c.esperaMsg((m) => m.t === 'muere' && m.id === c.id, 4000, n0);
        if (muertes === 0) ok(muere.causa === 'el Vacío', `fallo: mueres (causa: ${muere.causa})`);
        await c.esperaMsg((m) => m.t === 'nivel' && m.nivel === 'level-0', 6000, n0);
        muertes++;
      }
      c.ws.close();
    }
    console.log(`  (${exitos} éxitos, ${muertes} muertes en ${exitos + muertes} intentos)`);
    ok(exitos > 0, `se observó al menos un cruce con éxito (${exitos})`);
    ok(muertes > 0, `se observó al menos una caída al Vacío (${muertes})`);
  } catch (e) {
    fallos.push('excepción: ' + e.message);
    console.error('EXCEPCIÓN', e);
  } finally {
    server.kill();
  }
  console.log(fallos.length ? `\n✗ ${fallos.length} fallos` : '\n✓ TODO OK');
  process.exit(fallos.length ? 1 : 0);
})();
