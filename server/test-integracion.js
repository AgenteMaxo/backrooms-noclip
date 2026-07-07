// Arnés de integración (v23): levanta el servidor MMO real y verifica con un
// cliente WebSocket de verdad: protocolo v3, admin por mensaje, linterna
// autoritativa, registro de contenedores y puerta de retorno (ida y vuelta).
'use strict';

const path = require('path');
const { spawn } = require('child_process');

const REPO = path.join(__dirname, '..');
const WebSocket = require(path.join(REPO, 'server', 'node_modules', 'ws'));
const { DATA, RNG, MapGen, generarMapa } = require(path.join(REPO, 'server', 'sim', 'mundo'));
const Fisica = require(path.join(REPO, 'game', 'js', 'sim', 'fisica'));

const PUERTO = 8123;
const CLAVE = 'clave-de-prueba';
const fallos = [];
function ok(cond, msg) {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) fallos.push(msg);
}

// ---------- elegir un nivel de pruebas pequeño y tranquilo ----------
function elegirNivel() {
  const candidatos = [];
  for (const def of Object.values(DATA.levels)) {
    if (def.infinito) continue;
    if ((def.peligro ?? 0) > 1) continue;
    try {
      const { map } = generarMapa(def.id, `mmo::${def.id}::1`);
      if (map.grid.w > 90 || map.grid.h > 90) continue;
      if (map.caminatas && map.caminatas.length) continue;
      const cont = (map.props || []).some((p) => p.contenedor && !p.registrado);
      const salida = map.exits.some((e) =>
        !e.def._mec && e.def.tipo !== 'void' && DATA.levels[e.def.destino] &&
        !/agujero|caes |caer |caída|desplom|abismo|pozo|trampilla/i.test(e.def.texto || ''));
      if (cont && salida) candidatos.push({ id: def.id, area: map.grid.w * map.grid.h });
    } catch (e) { /* nivel no generable: fuera */ }
  }
  candidatos.sort((a, b) => a.area - b.area);
  if (!candidatos.length) throw new Error('ningún nivel candidato para el arnés');
  return candidatos[0].id;
}

// ---------- cliente de prueba ----------
class Cliente {
  constructor(nombre, nivel) {
    this.nombre = nombre;
    this.nivelPedido = nivel;
    this.buzon = [];      // mensajes recibidos (para esperas)
    this.x = 0; this.y = 0;
    this.nivel = null;
    this.map = null;
    this.id = null;
  }
  conectar() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${PUERTO}/ws`);
      this.ws.on('open', () => {
        this.enviar({ t: 'hola', nombre: this.nombre, token: 'arnes-' + this.nombre, v: 3, nivel: this.nivelPedido });
        res();
      });
      this.ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.t === 'bienvenida' || m.t === 'nivel') {
          this.id = m.id ?? this.id;
          this.nivel = m.nivel;
          this.x = m.x; this.y = m.y;
          this.map = generarMapa(m.nivel, m.semilla).map;
          for (const i of m.abiertas || []) if (this.map.exits[i]) this.map.exits[i].def._abierta = true;
        }
        if (m.t === 'pos') {
          for (const [id, x, y] of m.j || []) if (id === this.id) { this.x = x; this.y = y; }
        }
        if (m.t === 'mueve' && m.id === this.id) { this.x = m.x; this.y = m.y; }
        this.buzon.push({ m, t: Date.now() });
      });
      this.ws.on('error', rej);
    });
  }
  enviar(m) { this.ws.send(JSON.stringify(m)); }
  // espera un mensaje que cumpla el predicado (mira también lo ya recibido desde `desde`)
  espera(pred, ms, desde = 0) {
    return new Promise((res, rej) => {
      const t0 = Date.now();
      const mira = () => {
        for (let i = desde; i < this.buzon.length; i++) if (pred(this.buzon[i].m)) return res(this.buzon[i].m);
        if (Date.now() - t0 > ms) return rej(new Error('timeout esperando mensaje'));
        setTimeout(mira, 40);
      };
      mira();
    });
  }
  // navega con el input vectorial hasta quedar a ≤radio del tile (tx,ty)
  irA(tx, ty, radio = 0.55) {
    return new Promise((res, rej) => {
      const g = this.map.grid;
      const dist = MapGen.bfsDist(g, tx, ty);
      const t0 = Date.now();
      let ultimo = null;
      const paso = setInterval(() => {
        const d = Fisica.dist(this.x, this.y, tx, ty);
        if (d <= radio) {
          clearInterval(paso);
          this.enviar({ t: 'input', dx: 0, dy: 0 });
          return res();
        }
        if (Date.now() - t0 > 60000) {
          clearInterval(paso);
          this.enviar({ t: 'input', dx: 0, dy: 0 });
          return rej(new Error(`atascado navegando a ${tx},${ty} (estoy en ${this.x.toFixed(1)},${this.y.toFixed(1)})`));
        }
        const cx = Fisica.tileDe(this.x), cy = Fisica.tileDe(this.y);
        let destino = [tx, ty];
        const aqui = dist[cy * g.w + cx];
        if (aqui > 1) { // aún lejos: baja por el gradiente BFS
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
            const v = dist[ny * g.w + nx];
            if (v >= 0 && v < aqui) { destino = [nx, ny]; break; }
          }
        }
        const vx = destino[0] - this.x, vy = destino[1] - this.y;
        const m = Math.hypot(vx, vy) || 1;
        const clave = `${Math.round(vx / m * 20)},${Math.round(vy / m * 20)}`;
        if (clave !== ultimo) { // solo al cambiar (como el cliente real)
          ultimo = clave;
          this.enviar({ t: 'input', dx: vx / m, dy: vy / m });
        }
      }, 90);
    });
  }
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- escenario ----------
(async () => {
  const nivelId = elegirNivel();
  console.log(`— nivel de pruebas: ${nivelId}`);

  const server = spawn(process.execPath, ['server/server.js', String(PUERTO)], {
    cwd: REPO,
    env: { ...process.env, MMO_ADMIN: CLAVE, MMO_DEV: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => console.error('[server-err]', d.toString().trim()));
  await espera(1200); // arranque

  try {
    const c = new Cliente('Arnes', nivelId);
    await c.conectar();
    const bienv = await c.espera((m) => m.t === 'bienvenida', 4000);
    ok(bienv.nivel === nivelId, `bienvenida en ${nivelId} (protocolo v3 aceptado)`);

    // --- admin: clave mala y clave buena ---
    let n0 = c.buzon.length;
    c.enviar({ t: 'admin', clave: 'no-es' });
    const admMal = await c.espera((m) => m.t === 'admin', 3000, n0);
    ok(admMal.si === false, 'admin con clave mala → si:false');
    n0 = c.buzon.length;
    c.enviar({ t: 'admin', clave: CLAVE });
    const admBien = await c.espera((m) => m.t === 'admin', 3000, n0);
    ok(admBien.si === true, 'admin con clave buena → si:true');

    // --- linterna sin linterna: ni caso (y aviso) ---
    n0 = c.buzon.length;
    c.enviar({ t: 'luz', si: true });
    await espera(500);
    const luzDe = c.buzon.slice(n0).find((e) => e.m.t === 'luzDe' && e.m.id === c.id);
    const avisoLuz = c.buzon.slice(n0).find((e) => e.m.t === 'aviso' && /linterna/i.test(e.m.txt));
    ok(!luzDe, 'sin linterna en mano NO se difunde luzDe');
    ok(!!avisoLuz, 'sin linterna en mano llega el aviso explicativo');

    // --- registrar un contenedor con ESPACIO ---
    const g = c.map.grid;
    const alcanz = (x, y) => MapGen.bfsDist(g, Fisica.tileDe(c.x), Fisica.tileDe(c.y))[y * g.w + x] >= 0;
    const cont = (c.map.props || [])
      .filter((p) => p.contenedor && !p.registrado && alcanz(p.x, p.y))
      .sort((a, b) => (Math.abs(a.x - c.x) + Math.abs(a.y - c.y)) - (Math.abs(b.x - c.x) + Math.abs(b.y - c.y)))[0];
    ok(!!cont, 'hay un contenedor alcanzable en el mapa');
    if (cont) {
      await c.irA(cont.x, cont.y, 0.9);
      n0 = c.buzon.length;
      c.enviar({ t: 'accion' });
      const reg = await c.espera((m) => m.t === 'registrado', 3000, n0);
      const dado = await c.espera((m) => m.t === 'dado' && m.id === c.id, 3000, n0);
      ok(reg && typeof reg.i === 'number', `ESPACIO registra el contenedor (índice ${reg.i})`);
      ok(dado && dado.valor >= 1 && dado.valor <= 20, `tirada difundida: d20 → ${dado.valor}`);
      // segunda vez: ya registrado, no debe repetirse
      n0 = c.buzon.length;
      c.enviar({ t: 'accion' });
      await espera(400);
      ok(!c.buzon.slice(n0).some((e) => e.m.t === 'registrado'), 'registrar no se repite en el mismo mueble');
    }

    // --- cruzar una salida y comprobar la puerta de RETORNO ---
    const salida = c.map.exits
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => !e.def._mec && e.def.tipo !== 'void' && DATA.levels[e.def.destino] &&
        !/agujero|caes |caer |caída|desplom|abismo|pozo|trampilla/i.test(e.def.texto || '') &&
        e.def.destino !== nivelId && alcanz(e.x, e.y))[0];
    ok(!!salida, 'hay una salida normal alcanzable');
    if (salida) {
      const origen = { x: salida.e.x, y: salida.e.y, destino: salida.e.def.destino };
      await c.irA(salida.e.x, salida.e.y, 0.5);
      const oferta = await c.espera((m) => m.t === 'oferta', 4000);
      ok(!!oferta, `la salida se ofrece al acercarse («${oferta && oferta.texto}»)`);
      n0 = c.buzon.length;
      c.enviar({ t: 'cruzar', si: true });
      const niv = await c.espera((m) => m.t === 'nivel', 5000, n0);
      ok(niv.nivel === origen.destino, `cruce al nivel ${niv.nivel}`);
      // ¿la puerta de vuelta existe?
      const mapaDest = generarMapa(niv.nivel, niv.semilla).map;
      const puertaVuelta = mapaDest.exits.find((e) => e.def.destino === nivelId);
      if (puertaVuelta) {
        const d = Math.hypot(puertaVuelta.x - niv.x, puertaVuelta.y - niv.y);
        ok(d <= 8, `apareces JUNTO a la puerta que vuelve a ${nivelId} (a ${d.toFixed(1)} tiles)`);
        ok(!niv.retorno, 'no hace falta puerta personal: el nivel ya tenía la suya');
      } else {
        ok(!!niv.retorno, 'sin puerta natural: llega puerta personal de retorno');
        if (niv.retorno) ok(niv.retorno.destino === nivelId, `la puerta personal vuelve a ${niv.retorno.destino}`);
      }
      // --- volver por ella ---
      const objetivo = puertaVuelta || niv.retorno;
      if (objetivo) {
        // alejarse primero (histéresis) y volver a la puerta
        await espera(300);
        const lejos = { x: Fisica.tileDe(niv.x) + 3, y: Fisica.tileDe(niv.y) };
        try { await c.irA(lejos.x, lejos.y, 1.2); } catch (e) { /* puede chocar: da igual */ }
        await c.irA(objetivo.x, objetivo.y, 0.5);
        const oferta2 = await c.espera((m) => m.t === 'oferta', 5000, c.buzon.length - 4);
        n0 = c.buzon.length;
        c.enviar({ t: 'cruzar', si: true });
        const niv2 = await c.espera((m) => m.t === 'nivel', 5000, n0);
        ok(niv2.nivel === nivelId, `la puerta de retorno te devuelve a ${niv2.nivel}`);
        const d2 = Math.hypot(origen.x - niv2.x, origen.y - niv2.y);
        ok(d2 <= 8, `y apareces junto a la puerta original (a ${d2.toFixed(1)} tiles)`);
      }
    }

    // --- /tp de guardián: viaje sin retorno ---
    n0 = c.buzon.length;
    c.enviar({ t: 'chat', txt: '/tp level-1' });
    const nivTp = await c.espera((m) => m.t === 'nivel', 5000, n0);
    ok(nivTp.nivel === 'level-1', '/tp funciona para el guardián');
    ok(!nivTp.retorno, '/tp NO deja puerta personal de retorno');

    // --- ping con eco ---
    n0 = c.buzon.length;
    c.enviar({ t: 'ping', ts: 12345 });
    const pong = await c.espera((m) => m.t === 'pong', 2000, n0);
    ok(pong.ts === 12345, 'pong devuelve el sello de tiempo (medición de RTT)');

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
