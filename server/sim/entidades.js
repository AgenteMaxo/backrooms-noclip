// BACKROOMS MMO — IA de entidades en el servidor.
// Adaptación multijugador de game/js/systems/entities.js: la misma taxonomía
// de comportamientos de las fichas (cazador, errante, imita, emboscada,
// acecho_oscuridad, atraida_luz, estatica_trampa…) pero en tiempo real y
// persiguiendo al jugador MÁS CERCANO de la sala, no a «EL» jugador.
'use strict';

const { MapGen, FOV } = require('./mundo');

const PERIODO_PASO = 260;   // ms por paso con velocidad 1 (el jugador va a 170)
const TELEGRAPH_MS = 600;   // aviso ⚠ antes del golpe: moverse lo esquiva
const RASTRO_MS = 2600;     // tiempo sin detectar a nadie antes de abandonar la caza

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
    };
  });
}

function transitable(sala, x, y) {
  const g = sala.map.grid;
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return false;
  return MapGen.walkable(g.t[y * g.w + x]);
}

function ocupada(sala, x, y, self) {
  for (const e of sala.entidades) if (e !== self && e.viva && e.x === x && e.y === y) return true;
  // los jugadores también bloquean a las entidades: si no, con la sala llena se
  // suben encima (distancia 0 ≠ adyacente) y se quedan clavadas sin atacar
  for (const j of sala.jugadores.values()) if (!j.escondido && j.x === x && j.y === y) return true;
  return false;
}

// BFS multi-fuente desde TODOS los jugadores visibles: dmap[celda] = distancia
// al jugador (no escondido) más cercano. Un solo cálculo sirve a toda la sala.
function dmapJugadores(sala) {
  const g = sala.map.grid;
  const d = new Int32Array(g.w * g.h).fill(-1);
  const cola = [];
  for (const j of sala.jugadores.values()) {
    if (j.escondido) continue;
    const i = j.y * g.w + j.x;
    if (d[i] !== 0) { d[i] = 0; cola.push(i); }
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

function pasoHaciaJugadores(sala, e) {
  const g = sala.map.grid, dm = sala._dmap;
  let mejor = null, mejorV = dm[e.y * g.w + e.x];
  if (mejorV < 0) mejorV = Infinity;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = e.x + dx, ny = e.y + dy;
    if (!transitable(sala, nx, ny) || ocupada(sala, nx, ny, e)) continue;
    const v = dm[ny * g.w + nx];
    if (v >= 0 && v < mejorV) { mejorV = v; mejor = [nx, ny]; }
  }
  if (mejor) { moverA(sala, e, mejor[0], mejor[1]); return true; }
  return false;
}

function pasoAleatorio(sala, e) {
  const dirs = sala.rng.shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]]);
  for (const [dx, dy] of dirs) {
    const nx = e.x + dx, ny = e.y + dy;
    if (transitable(sala, nx, ny) && !ocupada(sala, nx, ny, e)) {
      moverA(sala, e, nx, ny);
      return;
    }
  }
}

function pasoHacia(sala, e, tx, ty) {
  const dx = Math.sign(tx - e.x), dy = Math.sign(ty - e.y);
  const opciones = Math.abs(tx - e.x) > Math.abs(ty - e.y)
    ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];
  for (const [mx, my] of opciones) {
    if (!mx && !my) continue;
    if (transitable(sala, e.x + mx, e.y + my) && !ocupada(sala, e.x + mx, e.y + my, e)) {
      moverA(sala, e, e.x + mx, e.y + my);
      return;
    }
  }
}

function moverA(sala, e, x, y) {
  e.x = x; e.y = y;
  sala.difundir({ t: 'entMueve', uid: e.uid, x, y });
}

function adyacente(e, j) {
  return Math.abs(e.x - j.x) + Math.abs(e.y - j.y) === 1;
}

function jugadorAdyacente(sala, e) {
  for (const j of sala.jugadores.values())
    if (!j.escondido && !j.muerto && adyacente(e, j)) return j;
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
    if (j.escondido || j.muerto) continue;
    // Sintonía alta (v18, online): lo que no es cazador te huele como cosa
    // del lugar y cada vez le importas menos
    if ((j.sintonia || 0) >= 30 && e.def.comportamiento !== 'cazador' &&
        sala.rng.chance((j.sintonia - 20) / 180)) continue;
    // pies de moqueta (−2) y botas reforzadas (−1): te detectan más tarde
    const rMod = ((j.instintos || []).includes('pies_moqueta') ? -2 : 0) +
      (j.equipo && j.equipo.pies === 'botas_reforzadas' ? -1 : 0);
    const radio = Math.max(1, (d.radio ?? 6) + rMod);
    const dd = Math.hypot(e.x - j.x, e.y - j.y);
    if (dd >= mejorDist) continue;
    const ver = () => FOV.los(sala.map.grid, e.x, e.y, j.x, j.y);
    let ve = false;
    switch (d.tipo) {
      case 'vista': ve = dd <= radio && ver(); break;
      case 'oscuridad': ve = dd <= radio && ver() && enPenumbra(sala, j); break;
      case 'luz': // piel de fluorescente: te creen una luz más del techo
        ve = j.luz && dd <= radio && !(j.instintos || []).includes('piel_fluorescente');
        break;
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
  const def = e.def;
  const avisa = def.comportamiento !== 'cazador' || !e.yaAviso;
  if (!e.preparando && avisa) {
    e.preparando = true;
    e.yaAviso = true;
    e.prepHasta = ahora + TELEGRAPH_MS;
    e.prepObjetivo = jug.id;
    sala.difundir({ t: 'entPrep', uid: e.uid });
    return;
  }
  golpe(sala, e, jug);
}

function golpe(sala, e, jug) {
  e.preparando = false;
  e.prepObjetivo = null;
  if (jug.muerto) return; // los cadáveres no se rematan (muertes dobles en BD)
  // reflejos de errante: 25% de esquivar el golpe que viste venir
  if ((jug.instintos || []).includes('reflejos_errante') && sala.rng.chance(0.25)) {
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
  if (obj && !obj.escondido && !obj.muerto && adyacente(e, obj)) { golpe(sala, e, obj); return; }
  const otro = jugadorAdyacente(sala, e);
  if (otro) { golpe(sala, e, otro); return; }
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
    let mejor = null, mejorV = dm[e.y * g.w + e.x];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = e.x + dx, ny = e.y + dy;
      if (!transitable(sala, nx, ny) || ocupada(sala, nx, ny, e)) continue;
      const v = dm[ny * g.w + nx];
      if (v > mejorV) { mejorV = v; mejor = [nx, ny]; }
    }
    if (mejor) moverA(sala, e, mejor[0], mejor[1]);
    return;
  }

  if (comp === 'cazador' && e.dormidaHasta > 0) {
    e.dormidaHasta -= PERIODO_PASO;
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

function tick(sala, ahora) {
  if (!sala.entidades.length || !sala.jugadores.size) return;
  sala._dmap = dmapJugadores(sala);
  for (const e of sala.entidades) {
    if (!e.viva) continue;
    resolverTelegraph(sala, e, ahora);
    if (ahora < e.proximoPaso) continue;
    const vel = e.def.velocidad || 1;
    e.proximoPaso = ahora + PERIODO_PASO / vel;
    pasoEntidad(sala, e, ahora);
  }
  if (sala.ruido && ahora > sala.ruido.hasta) sala.ruido = null;
}

module.exports = { crear, tick };
