// BACKROOMS MMO — IA de entidades del mundo compartido.
// Adaptación multijugador de game/js/systems/entities.js: la misma taxonomía
// de comportamientos de las fichas (cazador, errante, imita, emboscada,
// acecho_oscuridad, atraida_luz, estatica_trampa…) pero en tiempo real y
// persiguiendo al jugador MÁS CERCANO de la sala, no a «EL» jugador.
//
// Archivo DUAL (patrón de sim/fisica.js): corre en el SERVIDOR (module.exports,
// vía server/sim/entidades.js) y en el NAVEGADOR (window.Entidades, para el
// modo offline con servidor local) — UNA sola IA para ambos mundos.
(function () {
'use strict';

const esNode = typeof module !== 'undefined' && module.exports;
// Node: sim/mundo.js carga el motor del juego (data/rng/mapgen/fov) y lo
// expone; navegador: index.html ya cargó esos <script> antes que este.
const { MapGen, FOV } = esNode ? require('../../../server/sim/mundo') : window;
const Fisica = esNode ? require('./fisica') : window.Fisica;

const PERIODO_CEREBRO = 260; // ms entre decisiones (elegir waypoint, atacar)
const TELEGRAPH_MS = 600;    // aviso ⚠ antes del golpe: alejarse >1.1 lo esquiva
const RASTRO_MS = 4200;      // tiempo sin detectar a nadie antes de abandonar la caza
const OLFATO = 1.7;          // v25: multiplica el radio de detección de la ficha
                             // (cap 16) — antes apenas te olían a 6 casillas
const RADIO_ENT = 0.3;       // cuerpo físico de las entidades

// velocidad continua (tiles/s): el jugador va a 4.6 — que se sienta la diferencia
function velDe(e) {
  if (e.def.comportamiento === 'cazador') return 5.0; // implacable: te alcanza
  return (e.def.velocidad || 1) >= 2 ? 4.8 : 3.4;
}

function crear(map, defs, rng) {
  return (map.entitySpawns || []).map((s, i) => {
    const def = defs[s.id];
    return {
      uid: i, id: s.id, def,
      x: s.x, y: s.y,
      estado: 'latente',
      revelada: def.comportamiento !== 'imita' && def.comportamiento !== 'emboscada',
      dormidaHasta: def.comportamiento === 'cazador' ? (22 + rng.int(0, 8)) * 400 : 0,
      viva: true,
      vida: def.vida ?? 40,
      paralizadaHasta: 0,
      preparando: false, prepHasta: 0, prepObjetivo: null,
      yaAviso: false,
      sinVerteDesde: 0,
      proximoPaso: 0,
      pasoExtra: 0,
      wp: null, // tile-waypoint hacia el que avanza el cuerpo (v22)
    };
  });
}

function transitable(sala, x, y) {
  const g = sala.map.grid;
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return false;
  return MapGen.walkable(g.t[y * g.w + x]);
}

// ¿el TILE destino está reclamado? (waypoint/cuerpo de otra entidad o jugador)
function ocupada(sala, x, y, self) {
  for (const e of sala.entidades) {
    if (e === self || !e.viva) continue;
    if (Fisica.tileDe(e.x) === x && Fisica.tileDe(e.y) === y) return true;
    if (e.wp && e.wp[0] === x && e.wp[1] === y) return true;
  }
  for (const j of sala.jugadores.values())
    if (!j.escondido && !j.espectador && Fisica.tileDe(j.x) === x && Fisica.tileDe(j.y) === y) return true;
  return false;
}

// BFS multi-fuente desde TODOS los jugadores visibles: dmap[celda] = distancia
// al jugador (no escondido) más cercano. Un solo cálculo sirve a toda la sala.
function dmapJugadores(sala) {
  const g = sala.map.grid;
  const d = new Int32Array(g.w * g.h).fill(-1);
  const cola = [];
  for (const j of sala.jugadores.values()) {
    if (j.escondido || j.muerto || j.espectador) continue;
    const i = Fisica.tileDe(j.y) * g.w + Fisica.tileDe(j.x);
    if (i >= 0 && i < d.length && d[i] !== 0) { d[i] = 0; cola.push(i); }
  }
  for (let q = 0; q < cola.length; q++) {
    const i = cola[q], x = i % g.w, y = (i / g.w) | 0, v = d[i] + 1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
      const ni = ny * g.w + nx;
      if (d[ni] !== -1 || !MapGen.walkable(g.t[ni])) continue;
      d[ni] = v;
      cola.push(ni);
    }
  }
  return d;
}

// El CEREBRO elige tiles-waypoint (misma táctica de siempre); el cuerpo se
// mueve en continuo hacia ellos en cada tick (integrarCuerpos).
function fijarWp(e, x, y) { e.wp = [x, y]; }

function tileEnt(e) { return [Fisica.tileDe(e.x), Fisica.tileDe(e.y)]; }

function pasoHaciaJugadores(sala, e) {
  const g = sala.map.grid, dm = sala._dmap;
  const [ex, ey] = tileEnt(e);
  let mejor = null, mejorV = dm[ey * g.w + ex];
  if (mejorV < 0) mejorV = Infinity;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = ex + dx, ny = ey + dy;
    if (!transitable(sala, nx, ny) || ocupada(sala, nx, ny, e)) continue;
    const v = dm[ny * g.w + nx];
    if (v >= 0 && v < mejorV) { mejorV = v; mejor = [nx, ny]; }
  }
  if (mejor) { fijarWp(e, mejor[0], mejor[1]); return true; }
  return false;
}

function pasoAleatorio(sala, e) {
  const [ex, ey] = tileEnt(e);
  const dirs = sala.rng.shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]]);
  for (const [dx, dy] of dirs) {
    const nx = ex + dx, ny = ey + dy;
    if (transitable(sala, nx, ny) && !ocupada(sala, nx, ny, e)) {
      fijarWp(e, nx, ny);
      return;
    }
  }
}

function pasoHacia(sala, e, tx, ty) {
  const [ex, ey] = tileEnt(e);
  const dx = Math.sign(tx - ex), dy = Math.sign(ty - ey);
  const opciones = Math.abs(tx - ex) > Math.abs(ty - ey)
    ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];
  for (const [mx, my] of opciones) {
    if (!mx && !my) continue;
    if (transitable(sala, ex + mx, ey + my) && !ocupada(sala, ex + mx, ey + my, e)) {
      fijarWp(e, ex + mx, ey + my);
      return;
    }
  }
}

function adyacente(e, j) {
  return Fisica.dist(e.x, e.y, j.x, j.y) <= 0.95;
}

function jugadorAdyacente(sala, e) {
  for (const j of sala.jugadores.values())
    if (!j.escondido && !j.muerto && !j.espectador && adyacente(e, j)) return j;
  return null;
}

function enPenumbra(sala, j) {
  return (sala.def.oscuridad ?? 0) >= 0.5 && !j.luz;
}

// ¿A quién detecta esta entidad? El candidato más cercano que pase el filtro
// de su ficha (vista/oscuridad/luz/adyacente/sigilo/global) — mismos criterios
// que el modo por turnos, sin la Sintonía (llega en M3).
function detecta(sala, e) {
  const d = e.def.deteccion || {};
  let objetivo = null, mejorDist = Infinity;
  for (const j of sala.jugadores.values()) {
    if (j.escondido || j.muerto || j.espectador) continue;
    // botas reforzadas (−1): te detectan más tarde. El radio de la ficha se
    // amplifica con OLFATO: cada entidad conserva su alcance RELATIVO (las
    // de radio corto siguen siendo miopes; las cazadoras huelen de lejos)
    const rMod = (j.equipo && j.equipo.pies === 'botas_reforzadas' ? -1 : 0);
    const radio = Math.max(1, Math.min(16, Math.round((d.radio ?? 6) * OLFATO)) + rMod);
    const dd = Math.hypot(e.x - j.x, e.y - j.y);
    if (dd >= mejorDist) continue;
    // el LOS de Bresenham exige TILES enteros (con floats nunca converge y
    // recorre hasta el borde del mapa devolviendo siempre falso)
    const ver = () => FOV.los(sala.map.grid,
      Fisica.tileDe(e.x), Fisica.tileDe(e.y), Fisica.tileDe(j.x), Fisica.tileDe(j.y));
    let ve = false;
    switch (d.tipo) {
      case 'vista': ve = dd <= radio && ver(); break;
      case 'oscuridad': ve = dd <= radio && ver() && enPenumbra(sala, j); break;
      case 'luz': ve = j.luz && dd <= radio; break;
      case 'adyacente':
      case 'contacto': ve = dd <= Math.max(1, (d.radio || 1) + rMod); break;
      case 'sigilo': ve = dd <= radio && ver(); break;
      case 'global': ve = true; break;
      default: ve = dd <= Math.max(1, 6 + rMod) && ver();
    }
    if (ve) { objetivo = j; mejorDist = dd; }
  }
  return objetivo;
}

function atacar(sala, e, jug, ahora) {
  // Mientras el aviso está activo, el cerebro vuelve a evaluar la entidad
  // varias veces. Esas evaluaciones no deben convertir el aviso en un golpe
  // prematuro ni permitir que el Cazador lo omita tras su primer ataque.
  if (e.preparando) return;
  e.preparando = true;
  e.yaAviso = true;
  e.prepHasta = ahora + TELEGRAPH_MS;
  e.prepObjetivo = jug.id;
  sala.difundir({ t: 'entPrep', uid: e.uid });
}

function golpe(sala, e, jug, ahora) {
  e.preparando = false;
  e.prepObjetivo = null;
  if (jug.muerto) return; // los cadáveres no se rematan (muertes dobles en BD)
  if (ahora < (jug.invulnerableHasta || 0)) {
    sala.difundir({ t: 'entFalla', uid: e.uid });
    return;
  }
  const dano = e.def.dano ?? 10;
  jug.salud = Math.max(0, jug.salud - dano);
  sala.difundir({ t: 'entAtaca', uid: e.uid, id: jug.id, dano });
  sala.enviar(jug.ws, { t: 'salud', valor: jug.salud });
  if (e.def.danoCordura) { /* cordura online llega en M3 */ }
  if (jug.salud <= 0) sala.morir(jug, e.def.nombre);
}

// resolución del telegraph: pasado el aviso, golpea si sigue teniendo a
// alguien al lado (prioridad: su objetivo); si no, desgarra el aire
function resolverTelegraph(sala, e, ahora) {
  if (!e.preparando || ahora < e.prepHasta) return;
  const obj = sala.jugadores.get(e.prepObjetivo);
  if (obj && !obj.escondido && !obj.muerto && adyacente(e, obj)) { golpe(sala, e, obj, ahora); return; }
  const otro = jugadorAdyacente(sala, e);
  if (otro) { golpe(sala, e, otro, ahora); return; }
  e.preparando = false;
  e.prepObjetivo = null;
  sala.difundir({ t: 'entFalla', uid: e.uid });
}

function pasoEntidad(sala, e, ahora) {
  const comp = e.def.comportamiento;

  if (ahora < e.paralizadaHasta) return;

  // huyendo del fuego griego: se aleja de los jugadores (dmap creciente)
  if (e.huyendoHasta && ahora < e.huyendoHasta) {
    e.preparando = false;
    const g = sala.map.grid, dm = sala._dmap;
    const [ex, ey] = tileEnt(e);
    let mejor = null, mejorV = dm[ey * g.w + ex];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = ex + dx, ny = ey + dy;
      if (!transitable(sala, nx, ny) || ocupada(sala, nx, ny, e)) continue;
      const v = dm[ny * g.w + nx];
      if (v > mejorV) { mejorV = v; mejor = [nx, ny]; }
    }
    if (mejor) fijarWp(e, mejor[0], mejor[1]);
    return;
  }

  if (comp === 'cazador' && e.dormidaHasta > 0) {
    e.dormidaHasta -= PERIODO_CEREBRO;
    if (e.dormidaHasta <= 0) sala.difundir({ t: 'aviso2', txt: 'EL CAZADOR HA DESPERTADO.' });
    return;
  }

  // trampas y emboscadas: inmóviles, golpean a quien se arrima
  if (comp === 'estatica_trampa' || comp === 'emboscada') {
    const j = jugadorAdyacente(sala, e);
    if (j && detecta(sala, e)) atacar(sala, e, j, ahora);
    return;
  }

  // imitador: quieto hasta que alguien se acerca; entonces se revela
  if (comp === 'imita' && !e.revelada) {
    if (detecta(sala, e)) {
      e.revelada = true;
      e.estado = 'caza';
      sala.difundir({ t: 'entRevela', uid: e.uid });
    }
    return;
  }

  const objetivo = detecta(sala, e);
  if (objetivo) {
    e.estado = 'caza';
    e.sinVerteDesde = 0;
  } else if (e.estado === 'caza') {
    if (!e.sinVerteDesde) e.sinVerteDesde = ahora;
    else if (ahora - e.sinVerteDesde > RASTRO_MS) { e.estado = 'alerta'; e.sinVerteDesde = 0; }
  }

  // smilers y acechadores no cazan a quien va con luz en zona iluminada
  if (comp === 'acecho_oscuridad' && e.estado === 'caza' && objetivo && !enPenumbra(sala, objetivo)) {
    e.estado = 'alerta';
  }

  // ruido reciente: lo que no caza va a investigar
  const rd = sala.ruido;
  if (rd && ahora < rd.hasta && e.estado !== 'caza' &&
      Math.abs(e.x - rd.x) + Math.abs(e.y - rd.y) <= rd.radio) {
    const j = jugadorAdyacente(sala, e);
    if (j) { atacar(sala, e, j, ahora); return; }
    e.estado = 'alerta';
    pasoHacia(sala, e, rd.x, rd.y);
    return;
  }

  const j = jugadorAdyacente(sala, e);
  if (j && (e.estado === 'caza' || comp === 'cazador')) { atacar(sala, e, j, ahora); return; }

  if (e.estado === 'caza' || comp === 'cazador') {
    pasoHaciaJugadores(sala, e);
    // el cazador mete un paso extra cada 3: es implacable
    if (comp === 'cazador' && ++e.pasoExtra % 3 === 0) {
      const j2 = jugadorAdyacente(sala, e);
      if (!j2) pasoHaciaJugadores(sala, e);
    }
    const j3 = jugadorAdyacente(sala, e);
    if (j3) atacar(sala, e, j3, ahora);
  } else if (comp === 'errante' || e.estado === 'alerta') {
    pasoAleatorio(sala, e);
    // los errantes hostiles muerden si los rozas mucho rato
    const j4 = jugadorAdyacente(sala, e);
    if (comp === 'errante' && j4 && sala.rng.chance(0.12)) atacar(sala, e, j4, ahora);
  } else if (comp === 'atraida_luz') {
    if (sala.rng.chance(0.5)) pasoAleatorio(sala, e);
  }
}

function tick(sala, ahora, dt) {
  if (!sala.entidades.length || !sala.jugadores.size) return;
  sala._dmap = dmapJugadores(sala);
  sala._entMovidas = sala._entMovidas || [];
  for (const e of sala.entidades) {
    if (!e.viva) continue;
    resolverTelegraph(sala, e, ahora);
    // CEREBRO: decide waypoint/ataque a su cadencia
    if (ahora >= e.proximoPaso) {
      e.proximoPaso = ahora + PERIODO_CEREBRO;
      pasoEntidad(sala, e, ahora);
    }
    // CUERPO: avanza en continuo hacia su waypoint en cada tick
    if (e.wp && !e.preparando && ahora >= e.paralizadaHasta) {
      const tx = e.wp[0], ty = e.wp[1];
      const dx = tx - e.x, dy = ty - e.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.08) { e.x = tx; e.y = ty; e.wp = null; }
      else {
        const [nx, ny] = Fisica.mover(sala.map.grid, e.x, e.y, dx, dy, dt || 0.1, velDe(e), RADIO_ENT);
        if (Fisica.dist(nx, ny, e.x, e.y) < 0.001) e.wp = null; // atascada: que decida otra cosa
        e.x = nx; e.y = ny;
      }
      sala._entMovidas.push(e);
    }
  }
  if (sala.ruido && ahora > sala.ruido.hasta) sala.ruido = null;
}

const api = { crear, tick };
if (esNode) module.exports = api;
else window.Entidades = api;
})();
