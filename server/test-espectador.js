// Arnés v30 — MODO ESPECTADOR del guardián: invisibilidad (censo y demás
// clientes), seguimiento automático al cruzar de sala, salida del modo,
// rechazo sin clave de admin y las acciones HTTP del observatorio
// (espectar / espectar-fin / anuncio). Servidor real + clientes ws reales.
//   node server/test-espectador.js
'use strict';

const path = require('path');
const { spawn } = require('child_process');

const REPO = path.join(__dirname, '..');
const WebSocket = require(path.join(REPO, 'server', 'node_modules', 'ws'));
const { MapGen, generarMapa } = require(path.join(REPO, 'server', 'sim', 'mundo'));
const Fisica = require(path.join(REPO, 'game', 'js', 'sim', 'fisica'));

const PUERTO = 8127;
const fallos = [];
function ok(cond, msg) {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) fallos.push(msg);
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function leerClave(server) {
  return new Promise((resolve) => {
    let buf = '';
    server.stdout.on('data', (d) => {
      buf += d.toString();
      const m = buf.match(/clave de admin: \/admin (\S+)/);
      if (m) resolve(m[1]);
    });
  });
}

class Cliente {
  constructor(nombre, nivel) {
    this.nombre = nombre; this.nivelPedido = nivel;
    this.buzon = []; this.x = 0; this.y = 0; this.nivel = null; this.map = null; this.id = null;
    this.censoInicial = [];
  }
  conectar() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${PUERTO}/ws`);
      this.ws.on('open', () => {
        this.enviar({ t: 'hola', nombre: this.nombre, token: 'arnes-esp-' + this.nombre, v: 9, nivel: this.nivelPedido });
      });
      this.ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.t === 'bienvenida' || m.t === 'nivel') {
          this.id = m.id ?? this.id;
          this.nivel = m.nivel;
          this.x = m.x; this.y = m.y;
          this.sec = m.sec ?? 0;
          this.map = generarMapa(m.nivel, m.semilla).map;
          if (m.t === 'bienvenida') { this.censoInicial = m.jugadores || []; res(); }
        }
        if (m.t === 'mueve' && m.id === this.id) {
          this.x = m.x; this.y = m.y;
          if (m.sec !== undefined) this.sec = m.sec;
        }
        this.buzon.push({ m });
      });
      this.ws.on('error', rej);
      setTimeout(() => rej(new Error('timeout conectando ' + this.nombre)), 5000);
    });
  }
  enviar(m) { this.ws.send(JSON.stringify(m)); }
  esperaMsg(pred, ms, desde = 0) {
    return new Promise((res, rej) => {
      const t0 = Date.now();
      const mira = () => {
        for (let i = desde; i < this.buzon.length; i++) if (pred(this.buzon[i].m)) return res(this.buzon[i].m);
        if (Date.now() - t0 > ms) return rej(new Error('timeout esperando mensaje (' + this.nombre + ')'));
        setTimeout(mira, 40);
      };
      mira();
    });
  }
  // navega integrando la física local y reportando {t:'p'} (patrón v24)
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
  const clave = await leerClave(server); // la clave real (fichero o aleatoria)
  await espera(900);
  try {
    // ---------- montaje: objetivo + guardián en level-1 ----------
    const A = new Cliente('Objetivo', 'level-1');
    await A.conectar();
    const B = new Cliente('Guardian', 'level-1');
    await B.conectar();
    ok(B.censoInicial.some((j) => j.id === A.id), 'el guardián ve al objetivo en su censo inicial');

    // ---------- sin clave, el mensaje espectar no hace nada ----------
    let n0 = A.buzon.length;
    A.enviar({ t: 'espectar', objetivo: B.id });
    const rechazo = await A.esperaMsg((m) => m.t === 'aviso', 4000, n0);
    ok(/desconocido/i.test(rechazo.txt), 'espectar SIN admin → «Comando desconocido.»');

    // ---------- login de guardián y entrada al modo ----------
    B.enviar({ t: 'chat', txt: '/admin ' + clave });
    await B.esperaMsg((m) => m.t === 'admin' && m.si === true, 4000);
    n0 = B.buzon.length;
    B.enviar({ t: 'espectar', objetivo: A.id });
    const esp = await B.esperaMsg((m) => m.t === 'espectar', 4000, n0);
    ok(esp.si === true && esp.objetivo.id === A.id, 'el guardián entra en modo espectador sobre el objetivo');
    await B.esperaMsg((m) => m.t === 'mueve' && m.id === B.id, 4000, n0);
    ok(Fisica.dist(B.x, B.y, A.x, A.y) <= 2.5, `teleport junto al objetivo (a ${Fisica.dist(B.x, B.y, A.x, A.y).toFixed(1)} tiles)`);

    // ---------- invisibilidad: un cliente nuevo NO ve al espectador ----------
    const C = new Cliente('Testigo', 'level-1');
    await C.conectar();
    ok(C.censoInicial.some((j) => j.id === A.id), 'el testigo ve al objetivo');
    ok(!C.censoInicial.some((j) => j.id === B.id), 'el testigo NO ve al espectador (invisible)');

    // ---------- /observa lo marca y no lo cuenta; /grafo responde ----------
    const obs = await (await fetch(`http://127.0.0.1:${PUERTO}/observa?clave=${encodeURIComponent(clave)}`)).json();
    const jugObs = obs.salas.flatMap((s) => s.jugadores);
    ok(jugObs.find((j) => j.id === B.id)?.espectador === true, '/observa marca al guardián como espectador');
    const nivelObs = obs.niveles.find((n) => n.nivel === 'level-1');
    ok(nivelObs && nivelObs.jugadores === 2, `el conteo por nivel excluye al espectador (${nivelObs && nivelObs.jugadores} de 2)`);
    const grafo = await (await fetch(`http://127.0.0.1:${PUERTO}/grafo?clave=${encodeURIComponent(clave)}`)).json();
    ok(grafo.niveles && grafo.niveles['level-0'] && grafo.niveles['level-0'].salidas.length > 0, '/grafo devuelve el grafo de niveles');

    // ---------- seguimiento: el objetivo cruza y el espectador VIAJA con él ----------
    const salida = A.map.exits.find((e) => e.def.destino === 'the-hub' && !e.def._mec);
    ok(!!salida, 'level-1 tiene salida hacia the-hub');
    await A.irA(salida.x, salida.y, 0.5);
    await A.esperaMsg((m) => m.t === 'oferta', 6000);
    n0 = B.buzon.length;
    const nA = A.buzon.length;
    A.enviar({ t: 'cruzar', si: true });
    await A.esperaMsg((m) => m.t === 'nivel', 6000, nA);
    const nivB = await B.esperaMsg((m) => m.t === 'nivel', 6000, n0);
    ok(nivB.nivel === 'the-hub', `el espectador cruza SOLO a ${nivB.nivel} siguiendo al objetivo`);
    ok(nivB.espectador && nivB.espectador.id === A.id, 'el mensaje de nivel conserva el modo espectador');
    ok(nivB.sinTarjeta === true, 'el cruce del espectador va sin tarjeta (fundido)');

    // ---------- salir del modo: vuelve a ser visible ----------
    n0 = B.buzon.length;
    B.enviar({ t: 'espectar', objetivo: null });
    const fin = await B.esperaMsg((m) => m.t === 'espectar', 4000, n0);
    ok(fin.si === false, 'el guardián sale del modo espectador');
    const D = new Cliente('Vecino', 'the-hub');
    await D.conectar();
    ok(D.censoInicial.some((j) => j.id === B.id), 'tras salir, un cliente nuevo SÍ ve al guardián');
    ok(D.censoInicial.some((j) => j.id === A.id), '…y también al objetivo');

    // ---------- acciones HTTP del observatorio ----------
    const post = (cuerpo) => fetch(`http://127.0.0.1:${PUERTO}/accion`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clave, ...cuerpo }),
    }).then((r) => r.json());
    n0 = B.buzon.length;
    const rEsp = await post({ accion: 'espectar', id: A.id });
    ok(rEsp.ok === true, `/accion espectar localiza al guardián y lo activa (${rEsp.msg || rEsp.error})`);
    const esp2 = await B.esperaMsg((m) => m.t === 'espectar', 4000, n0);
    ok(esp2.si === true, 'el guardián recibe el modo espectador desde el observatorio');
    n0 = B.buzon.length;
    const rFin = await post({ accion: 'espectar-fin' });
    ok(rFin.ok === true, '/accion espectar-fin lo devuelve al mundo');
    await B.esperaMsg((m) => m.t === 'espectar' && m.si === false, 4000, n0);
    const nC = C.buzon.length;
    const rAnu = await post({ accion: 'anuncio', txt: 'RETO: el primero en escapar gana' });
    ok(rAnu.ok === true, '/accion anuncio responde ok');
    const anuncio = await C.esperaMsg((m) => m.t === 'anuncio', 4000, nC);
    ok(/RETO/.test(anuncio.txt), 'el anuncio llega a los jugadores de otras salas');

    // ---------- rotación GLOBAL (v30.7): ←/→ recorren TODAS las salas ----------
    // candidatos vivos: C (level-1), A y D (the-hub) — dos niveles distintos.
    // OJO: el salto a un objetivo de OTRA sala llega como mensaje 'nivel' con
    // campo espectador (moverEspectador), no como 't:espectar' (espectarA).
    const engancha = (m) => (m.t === 'espectar' && m.si === true) ||
      (m.t === 'nivel' && m.espectador);
    const idDe = (m) => m.t === 'espectar' ? m.objetivo.id : m.espectador.id;
    const vistos = new Set();
    for (let i = 0; i < 3; i++) {
      n0 = B.buzon.length;
      B.enviar({ t: 'espectar', dir: 'sig' });
      const r = await B.esperaMsg(engancha, 5000, n0);
      vistos.add(idDe(r));
    }
    ok(vistos.size === 3 && [A.id, C.id, D.id].every((id) => vistos.has(id)),
      `dir:'sig' rota por los 3 errantes de 2 niveles distintos (${vistos.size}/3)`);
    n0 = B.buzon.length;
    B.enviar({ t: 'espectar', dir: 'ant' });
    const rAnt = await B.esperaMsg(engancha, 5000, n0);
    ok(vistos.has(idDe(rAnt)), 'dir:\'ant\' también engancha (rotación inversa)');

    // ---------- el objetivo se desconecta: el espectador vuelve al mundo ----------
    n0 = B.buzon.length;
    B.enviar({ t: 'espectar', objetivo: A.id });
    await B.esperaMsg((m) => m.t === 'espectar' && m.si === true, 4000, n0);
    n0 = B.buzon.length;
    A.ws.close();
    const fin2 = await B.esperaMsg((m) => m.t === 'espectar' && m.si === false, 5000, n0);
    ok(!!fin2, 'si el objetivo se desconecta, el espectador vuelve al mundo');

    B.ws.close(); C.ws.close(); D.ws.close();
  } catch (e) {
    fallos.push('excepción: ' + e.message);
    console.error('EXCEPCIÓN', e);
  } finally {
    server.kill();
  }
  console.log(fallos.length ? `\n✗ ${fallos.length} fallos` : '\n✓ TODO OK');
  process.exit(fallos.length ? 1 : 0);
})();
