// Arnés v23 (parte 2): caso de PUERTA PERSONAL de retorno — cruce a un nivel
// que NO tiene salida natural de vuelta (level-1 → the-hub) y regreso por ella.
// También: una salida con texto de no-clip NO debe dejar puerta de vuelta.
'use strict';

const path = require('path');
const { spawn } = require('child_process');

const REPO = path.join(__dirname, '..');
const WebSocket = require(path.join(REPO, 'server', 'node_modules', 'ws'));
const { DATA, MapGen, generarMapa } = require(path.join(REPO, 'server', 'sim', 'mundo'));
const Fisica = require(path.join(REPO, 'game', 'js', 'sim', 'fisica'));

const PUERTO = 8124;
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
        this.enviar({ t: 'hola', nombre: this.nombre, token: 'arnes2-' + this.nombre, v: 9, nivel: this.nivelPedido });
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
  // v24: navega INTEGRANDO la física local y reportando posiciones {t:'p'}
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
  try {
    const c = new Cliente('Arnes2', 'level-1');
    await c.conectar();
    await c.esperaMsg((m) => m.t === 'bienvenida', 4000);

    // salida de level-1 hacia the-hub (sin puerta natural de vuelta allí)
    const salida = c.map.exits.find((e) => e.def.destino === 'the-hub' && !e.def._mec);
    ok(!!salida, 'level-1 tiene la salida hacia the-hub');
    const origen = { x: salida.x, y: salida.y };
    await c.irA(salida.x, salida.y, 0.5);
    await c.esperaMsg((m) => m.t === 'oferta', 5000);
    let n0 = c.buzon.length;
    c.enviar({ t: 'cruzar', si: true });
    const niv = await c.esperaMsg((m) => m.t === 'nivel', 5000, n0);
    ok(niv.nivel === 'the-hub', `cruce a ${niv.nivel}`);
    const natural = c.map.exits.find((e) => e.def.destino === 'level-1');
    ok(!natural, 'the-hub NO tiene puerta natural hacia level-1 (el caso que buscamos)');
    ok(!!niv.retorno, 'llega la puerta PERSONAL de retorno');
    if (niv.retorno) {
      ok(Math.hypot(niv.retorno.x - niv.x, niv.retorno.y - niv.y) <= 2,
        'la puerta personal está donde apareces');
      // alejarse (histéresis: >1 tile de TODA salida, alcanzable) y volver
      const g = c.map.grid;
      const dist2 = MapGen.bfsDist(g, Fisica.tileDe(c.x), Fisica.tileDe(c.y));
      let lejos = null;
      for (let i = 0; i < dist2.length && !lejos; i++) {
        if (dist2[i] < 3 || dist2[i] > 14) continue;
        const lx = i % g.w, ly = (i / g.w) | 0;
        if (c.map.exits.every((e) => Math.hypot(e.x - lx, e.y - ly) > 1.8) &&
            Math.hypot(niv.retorno.x - lx, niv.retorno.y - ly) > 1.8) lejos = [lx, ly];
      }
      if (lejos) { try { await c.irA(lejos[0], lejos[1], 0.6); } catch (e) {} }
      await c.irA(niv.retorno.x, niv.retorno.y, 0.5);
      await c.esperaMsg((m) => m.t === 'oferta' && /llegaste/.test(m.texto || ''), 6000, n0);
      n0 = c.buzon.length;
      c.enviar({ t: 'cruzar', si: true });
      const niv2 = await c.esperaMsg((m) => m.t === 'nivel', 5000, n0);
      ok(niv2.nivel === 'level-1', `la puerta personal te devuelve a ${niv2.nivel}`);
      const d2 = Math.hypot(origen.x - niv2.x, origen.y - niv2.y);
      ok(d2 <= 8, `apareces junto a las escaleras originales (a ${d2.toFixed(1)} tiles)`);
      ok(!c.map.exits.some((e) => e.def.tipo === 'retorno'), 'nota: el retorno nunca vive en el mapa compartido');
    }

    // salida con texto de NO-CLIP: no debe dejar puerta de vuelta
    const noclip = c.map.exits.find((e) => /no.?clip/i.test(e.def.texto || ''));
    ok(!!noclip, 'level-1 tiene una salida de no-clip para probar');
    if (noclip) {
      await c.irA(noclip.x, noclip.y, 0.5);
      await c.esperaMsg((m) => m.t === 'oferta', 6000, n0);
      n0 = c.buzon.length;
      c.enviar({ t: 'cruzar', si: true });
      const niv3 = await c.esperaMsg((m) => m.t === 'nivel', 5000, n0);
      ok(!niv3.retorno, `no-clip a ${niv3.nivel} SIN puerta de retorno (correcto)`);
    }
    c.ws.close();
  } catch (e) {
    fallos.push('excepción: ' + e.message);
    console.error('EXCEPCIÓN', e);
  } finally {
    server.kill();
  }
  console.log(fallos.length ? `\n✗ ${fallos.length} fallos` : '\n✓ TODO OK');
  process.exit(fallos.length ? 1 : 0);
})();
