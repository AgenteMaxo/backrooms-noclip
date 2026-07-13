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
        !e.def._mec && e.def.tipo !== 'void' &&
        !(e.def.tipo === 'arriesgada' && e.def.riesgoVoid > 0) && DATA.levels[e.def.destino] &&
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
        this.enviar({ t: 'hola', nombre: this.nombre, token: 'arnes-' + this.nombre, v: 7, nivel: this.nivelPedido });
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
          for (const i of m.abiertas || []) if (this.map.exits[i]) this.map.exits[i].def._abierta = true;
        }
        if (m.t === 'pos') {
          // el ECO del servidor: posiciones ACEPTADAS (mide el validador)
          for (const [id, x, y] of m.j || []) if (id === this.id) {
            if (this.ecoX !== undefined)
              this.aceptado = (this.aceptado || 0) + Math.hypot(x - this.ecoX, y - this.ecoY);
            this.ecoX = x; this.ecoY = y;
          }
        }
        if (m.t === 'mueve' && m.id === this.id) {
          this.x = m.x; this.y = m.y;
          if (m.sec !== undefined) { this.sec = m.sec; this.rechazos = (this.rechazos || 0) + 1; }
        }
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
  // v24: navega INTEGRANDO la física local y reportando posiciones {t:'p'}
  // (exactamente lo que hace el cliente real)
  irA(tx, ty, radio = 0.55) {
    return new Promise((res, rej) => {
      const g = this.map.grid;
      const dist = MapGen.bfsDist(g, tx, ty);
      const t0 = Date.now();
      let tAnt = Date.now();
      const paso = setInterval(() => {
        const d = Fisica.dist(this.x, this.y, tx, ty);
        if (d <= radio) { clearInterval(paso); return res(); }
        if (Date.now() - t0 > 60000) {
          clearInterval(paso);
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
    const avisoLuz = c.buzon.slice(n0).find((e) => e.m.t === 'aviso' && /(linterna|fuente de luz)/i.test(e.m.txt));
    ok(!luzDe, 'sin linterna en mano NO se difunde luzDe');
    ok(!!avisoLuz, 'sin linterna en mano llega el aviso explicativo');

    // --- microparón: el cliente integra 0.6 s y manda el rastro en una ráfaga
    // de tramos cortos. Deben entrar con el presupuesto acumulado, sin snap ---
    {
      const g = c.map.grid;
      let mejor = null;
      for (let i = 0; i < 24; i++) {
        const th = i * Math.PI * 2 / 24;
        let x = c.x, y = c.y;
        const puntos = [];
        for (let j = 0; j < 6; j++) {
          [x, y] = Fisica.mover(g, x, y, Math.sin(th), -Math.cos(th), 0.1, Fisica.VEL_JUGADOR);
          puntos.push([x, y]);
        }
        const d = Fisica.dist(c.x, c.y, x, y);
        if (!mejor || d > mejor.d) mejor = { d, puntos };
      }
      ok(mejor.d > 1.3, `ruta de microparón recorre ${mejor.d.toFixed(2)} tiles`);
      const n0r = c.rechazos || 0;
      await espera(650);
      for (const [x, y] of mejor.puntos) {
        c.x = x; c.y = y;
        c.enviar({
          t: 'p', x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100,
          rot: 0, sec: c.sec || 0,
        });
      }
      await espera(300);
      ok((c.rechazos || 0) === n0r, 'microparón de 0.6 s → rastro aceptado sin rubber-band');
    }

    // --- v24, el VALIDADOR: (a) informes más rápidos que la física legal se
    // rechazan (anti-speedhack) — lo aceptado nunca supera vel×t ---
    {
      c.aceptado = 0; c.rechazos = 0;
      c.ecoX = undefined; c.ecoY = undefined;
      const t0 = Date.now();
      let fx = c.x, fy = c.y;
      const g = c.map.grid;
      for (let i = 0; i < 30; i++) { // intenta avanzar a ~10 tiles/s (>2× legal)
        const th = i * 0.15;
        [fx, fy] = Fisica.mover(g, fx, fy, Math.sin(th), -Math.cos(th), 0.04 * 2.3, 10);
        c.enviar({ t: 'p', x: fx, y: fy, rot: 0, sec: c.sec || 0 });
        await espera(40);
      }
      await espera(400);
      const dur = (Date.now() - t0) / 1000;
      const tope = 4.6 * dur * 1.2 + 1.4; // margen de cubeta inicial incluido
      ok((c.aceptado || 0) <= tope,
        `speedhack rechazado: acepta ${(c.aceptado || 0).toFixed(1)} tiles en ${dur.toFixed(1)} s (tope ${tope.toFixed(1)}, ${c.rechazos} rechazos)`);
      c.x = c.ecoX ?? c.x; c.y = c.ecoY ?? c.y; // re-sincroniza con lo aceptado
    }

    // --- v24, el VALIDADOR: (b) un salto imposible (2.5 tiles de golpe) se
    // rechaza y el servidor devuelve la última posición válida con sec ---
    {
      const n0r = c.rechazos || 0;
      const nb = c.buzon.length;
      c.enviar({ t: 'p', x: c.x + 2.5, y: c.y, rot: 0, sec: c.sec || 0 });
      await c.espera((m) => m.t === 'mueve' && m.id === c.id, 3000, nb).catch(() => {});
      ok((c.rechazos || 0) > n0r, 'teleport de 2.5 tiles → rechazado con corrección y sec nuevo');
    }

    // --- v25: el botín es INDIVIDUAL — el server solo da de alta con cadencia ---
    const g = c.map.grid;
    const alcanz = (x, y) => MapGen.bfsDist(g, Fisica.tileDe(c.x), Fisica.tileDe(c.y))[y * g.w + x] >= 0;
    {
      n0 = c.buzon.length;
      c.enviar({ t: 'loot', id: 'botiquin' });
      const inv = await c.espera((m) => m.t === 'inv', 3000, n0);
      ok(inv.inv.includes('botiquin'), 'loot da de alta el objeto en el inventario');
      n0 = c.buzon.length;
      c.enviar({ t: 'loot', id: 'trebol' }); // inmediato: la cadencia lo frena
      c.enviar({ t: 'loot', id: 'noexiste' }); // inexistente: ignorado
      await espera(500);
      ok(!c.buzon.slice(n0).some((e) => e.m.t === 'inv'),
        'cadencia de loot: el spam y los ids falsos no cuelan');
    }

    // --- ESPACIO junto a una taquilla te esconde (y otro te saca) ---
    {
      const esc = (c.map.props || [])
        .filter((p) => ['taquilla', 'nevera', 'archivador'].includes(p.id) && alcanz(p.x, p.y))
        .sort((a, b) => (Math.abs(a.x - c.x) + Math.abs(a.y - c.y)) - (Math.abs(b.x - c.x) + Math.abs(b.y - c.y)))[0];
      if (esc) {
        await c.irA(esc.x, esc.y, 0.9);
        n0 = c.buzon.length;
        c.enviar({ t: 'accion' });
        await c.espera((m) => m.t === 'esconde' && m.id === c.id && m.si, 3000, n0);
        ok(true, 'ESPACIO junto a la taquilla te esconde');
        c.enviar({ t: 'accion' });
        await c.espera((m) => m.t === 'esconde' && m.id === c.id && m.si === false, 3000, n0);
        ok(true, 'ESPACIO dentro del mueble te saca');
      } else {
        ok(true, '(sin escondite alcanzable en este mapa: chequeo omitido)');
      }
    }

    // --- cruzar una salida y comprobar la puerta de RETORNO ---
    const salida = c.map.exits
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => !e.def._mec && e.def.tipo !== 'void' &&
        !(e.def.tipo === 'arriesgada' && e.def.riesgoVoid > 0) && DATA.levels[e.def.destino] &&
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
        // alejarse primero (histéresis: >1 tile de TODA salida) y volver
        await espera(300);
        const g2 = c.map.grid;
        const dist2 = MapGen.bfsDist(g2, Fisica.tileDe(c.x), Fisica.tileDe(c.y));
        let lejos = null;
        for (let i = 0; i < dist2.length && !lejos; i++) {
          if (dist2[i] < 3 || dist2[i] > 14) continue;
          const lx = i % g2.w, ly = (i / g2.w) | 0;
          if (c.map.exits.every((e) => Math.hypot(e.x - lx, e.y - ly) > 1.8)) lejos = [lx, ly];
        }
        if (lejos) { try { await c.irA(lejos[0], lejos[1], 0.6); } catch (e) {} }
        await c.irA(objetivo.x, objetivo.y, 0.5);
        const oferta2 = await c.espera((m) => m.t === 'oferta', 5000, c.buzon.length - 4);
        n0 = c.buzon.length;
        c.enviar({ t: 'cruzar', si: true });
        const niv2 = await c.espera((m) => m.t === 'nivel', 5000, n0);
        ok(niv2.nivel === nivelId, `la puerta de retorno te devuelve a ${niv2.nivel}`);
        // Si la puerta usada para volver es ella misma sin-retorno (p. ej. un
        // no-clip de un nivel A hacia el nuestro, que no es la MISMA puerta por
        // la que salimos), cambiarDeSala() no busca pareja natural y usa el
        // spawn por defecto: no tiene sentido exigir cercanía al origen (misma
        // regla que esSinRetorno en server.js/game.js).
        const objetivoSinRetorno = puertaVuelta &&
          /agujero|caes |caer |caída|desplom|abismo|pozo|trampilla|no.?clip|desmay|despiert/i.test(puertaVuelta.def.texto || '');
        if (objetivoSinRetorno) {
          ok(true, 'la puerta usada para volver es sin-retorno (no-clip/caída): no aplica cercanía al origen');
        } else {
          const d2 = Math.hypot(origen.x - niv2.x, origen.y - niv2.y);
          ok(d2 <= 8, `y apareces junto a la puerta original (a ${d2.toFixed(1)} tiles)`);
        }
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
