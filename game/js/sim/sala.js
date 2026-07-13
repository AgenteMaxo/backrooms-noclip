// BACKROOMS MMO — las REGLAS DEL MUNDO compartido: una SALA = una instancia
// viva de un nivel («level-0::1»). Censo de jugadores, entidades simuladas
// (sim/entidades.js), objetos del suelo, salidas con mecánica (romper pared/
// suelo con canal + dado), escondites, supervivencia, Sala Manila, riesgoVoid,
// muerte/respawn y el cruce entre salas con puerta de retorno. Los jugadores
// NO se bloquean entre sí; las entidades sí ocupan casilla.
//
// Archivo DUAL (patrón de sim/fisica.js y sim/entidades.js): corre en el
// SERVIDOR (module.exports, vía el wrapper server/sala.js) y en el NAVEGADOR
// (window.Salas, para el modo offline con servidor local de net/local.js).
// UNA sola implementación de las reglas para ambos mundos: un fix aquí
// arregla online Y offline a la vez.
(function () {
'use strict';

const esNode = typeof module !== 'undefined' && module.exports;
// Node: sim/mundo.js carga el motor del juego y expone DATA/RNG/MapGen +
// generarMapa/esTransitable; navegador: index.html cargó ya esos <script>.
const M = esNode ? require('../../../server/sim/mundo') : null;
const DATA = esNode ? M.DATA : window.GAME_DATA;
const RNG = esNode ? M.RNG : window.RNG;
const MapGen = esNode ? M.MapGen : window.MapGen;
const Entidades = esNode ? require('./entidades') : window.Entidades;
const Fisica = esNode ? require('./fisica') : window.Fisica;

// En el mundo compartido las salidas aparecen SIEMPRE (se ignora `prob`, que
// era para las ventanas infinitas del modo por turnos): una instancia fija
// sin puertas sería una trampa. (En Node la implementación canónica vive en
// server/sim/mundo.js; el navegador replica aquí esas tres funciones cortas.)
const defParaOnline = esNode ? null : function (def) {
  return {
    ...def,
    salidas: (def.salidas || []).map((s) => { const c = { ...s }; delete c.prob; return c; }),
  };
};

const generarMapa = esNode ? M.generarMapa : function (nivelId, semilla) {
  const def = DATA.levels[nivelId];
  if (!def) throw new Error(`nivel desconocido: ${nivelId}`);
  const map = MapGen.generate(defParaOnline(def), RNG.create(semilla));
  return { def, map };
};

const esTransitable = esNode ? M.esTransitable : function (map, x, y) {
  if (x < 0 || y < 0 || x >= map.grid.w || y >= map.grid.h) return false;
  return MapGen.walkable(MapGen.at(map.grid, x, y));
};

// Constantes de juego (dueño: este archivo; protocolo.js conserva copias por
// compatibilidad histórica, pero la Sala ya no las lee de allí).
const CAP_SALA = 60;          // jugadores por instancia de nivel
const COOLDOWN_CHAT = 1500;   // ms entre mensajes de chat
const RADIO_CHAT = 14;        // casillas: el chat es de PROXIMIDAD (voz, no megafonía)

// Base de datos INYECTABLE: el servidor real registra expedientes (usarDb en
// server/sala.js); el modo local del navegador se queda con estos no-op.
let db = {
  sumarMuerte() {}, registrarVisita() {}, sumarEscape() {},
};
function usarDb(real) { db = real; }

// Ganchos del anfitrión (el wrapper del servidor los rellena; el modo local
// no los necesita): hoy solo el registro de chat para el observatorio.
const ganchos = { registrarChat(nivel, inst, nombre, txt) {} };

// métricas del caudal de difusión (el wrapper del servidor añade las suyas)
const metricas = { ultMs: 0, maxMs: 0, medias: [], bytes: 0, bytesT: Date.now(), kbs: 0 };

let siguienteId = 1;
const ESCONDITES = new Set(['taquilla', 'nevera', 'archivador']);

// Remodelación no euclidiana: APAGADA online (v23.6 — quien entra a una sala
// tras una remodelación regenera el mapa desde la semilla SIN los chunks
// cambiados → desync). El modo LOCAL del navegador puede reactivarla: su
// único cliente vive en la misma pestaña y jamás «entra tarde».
let REMODEL_ONLINE = false;
function activarRemodel(v) { REMODEL_ONLINE = !!v; }

const PROTECCION_ENTRADA_MS = 3000;

// vector cardinal más cercano a un ángulo θ (0=N, π/2=E, π=S, 3π/2=O)
function cardinalDe(th) {
  const k = ((Math.round(th / (Math.PI / 2)) % 4) + 4) % 4;
  return [[0, -1], [1, 0], [0, 1], [-1, 0]][k];
}
const r2 = (v) => Math.round(v * 100) / 100;
const SALA_PUBLICA = 'publica';
const RE_GRUPO_PRIVADO = /^[a-z0-9_-]{3,32}$/;

function grupoSala(raw) {
  const s = String(raw || '').trim().toLowerCase();
  return s && RE_GRUPO_PRIVADO.test(s) ? s : SALA_PUBLICA;
}

function claveInterna(nivelId, inst, grupo) {
  grupo = grupoSala(grupo);
  return `${grupo}::${nivelId}::${inst}`;
}

// ¿Se puede ir de A a B sin cruzar nada sólido? Muestreo cada ~0.2 tiles con
// radio tolerante (0.22 vs 0.35 del cuerpo): los puntos reportados ya pasaron
// la colisión del cliente — esto solo caza atajos IMPOSIBLES (paredes).
// El paso de 0.2 garantiza una muestra dentro de cualquier muro de 1 tile.
function caminoLegal(grid, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(d / 0.2));
  for (let i = 1; i <= n; i++) {
    const f = i / n;
    if (Fisica.choca(grid, x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, 0.22)) return false;
  }
  return true;
}

function destinoDisponible(def) {
  return def && def.destino && DATA.levels[def.destino];
}

class Sala {
  constructor(nivelId, inst, grupo = SALA_PUBLICA, semillaBase = 'mmo') {
    this.nivelId = nivelId;
    this.inst = inst;
    this.grupo = grupoSala(grupo);
    this.privada = this.grupo !== SALA_PUBLICA;
    this.clave = this.privada ? `${nivelId}::privada::${inst}` : `${nivelId}::${inst}`;
    // La semilla es el contrato con el cliente: mismo string → mismo mapa.
    // El modo local usa una base «solo::<aleatoria>» para que cada run tenga
    // su propio mundo; el servidor conserva la base histórica «mmo».
    this.semilla = this.privada
      ? `${semillaBase}::privada::${this.grupo}::${nivelId}::${inst}`
      : `${semillaBase}::${nivelId}::${inst}`;
    const { def, map } = generarMapa(nivelId, this.semilla);
    this.def = def;
    this.map = map;
    this.jugadores = new Map();
    this.rng = RNG.create(this.semilla + '::sim'); // dados y azar de la sala
    this.entidades = Entidades.crear(map, DATA.entities, RNG.create(this.semilla + '::ents'));
    this.ruido = null;
    this.alCruzar = null; // lo inyecta el anfitrión (cambio de sala)
    this.alMorir = null;  // ídem (respawn en Level 0)
    this.mensajes = 0;    // observatorio: chats emitidos en esta instancia
  }

  get llena() { return this.jugadores.size >= CAP_SALA; }

  ocupada(x, y) {
    for (const j of this.jugadores.values())
      if (Fisica.tileDe(j.x) === x && Fisica.tileDe(j.y) === y) return true;
    return false;
  }

  // busca hueco transitable y libre en anillos crecientes alrededor de un
  // punto (por defecto el spawn del mapa; v23: también junto a una puerta)
  buscarSpawn(cx, cy) {
    const [sx, sy] = cx === undefined ? this.map.spawn : [cx, cy];
    for (let r = 0; r < 20; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = sx + dx, y = sy + dy;
          if (esTransitable(this.map, x, y) && !this.ocupada(x, y)) return [x, y];
        }
    return [sx, sy];
  }

  censo() {
    // los espectadores (v30) no existen para los demás clientes
    return [...this.jugadores.values()].filter((j) => !j.espectador).map((j) => ({
      id: j.id, nombre: j.nombre, x: j.x, y: j.y, rot: j.rot,
      escondido: !!j.escondido,
    }));
  }

  // estado de sala que el cliente no puede derivar de la semilla (v25: los
  // objetos del suelo ya no viajan — el botín es individual de cada cliente)
  estadoDinamico() {
    return {
      ents: this.entidades.map((e) => ({
        uid: e.uid, id: e.id, x: e.x, y: e.y, viva: e.viva, revelada: e.revelada,
      })),
      abiertas: this.map.exits.map((ex, i) => ex.def._abierta ? i : -1).filter((i) => i >= 0),
    };
  }

  entrar(ws, nombre, token, expediente) {
    const id = siguienteId++;
    const [x, y] = this.buscarSpawn();
    const jug = {
      id, ws, nombre, token, x, y, rot: Math.PI, // θ continuo (π = mirando al sur)
      distSala: 0,
      salud: 100, sed: 100, cordura: 100, luz: false, escondido: null, muerto: false,
      inv: [], manos: [null, null], equipo: { cara: null, cuerpo: null, pies: null },
      esAdmin: false, muteadoHasta: 0,
      espectador: null, // v30: {objetivo: id} — guardián invisible observando
      ultMov: 0, ultChat: 0, canal: null, ofertaEn: null, manila: null,
      // observatorio: cuándo entró al mundo y cuántos informes de posición
      // ilegales acumula (vel = speedhack, muro = noclip) — señal de auditoría
      conectadoEn: Date.now(), rechazos: { vel: 0, muro: 0 },
      retorno: null, // puerta personal de vuelta (v23; la pone cambiarDeSala)
      nivelesProtegidos: new Set(),
      invulnerableHasta: 0,
      // v24 — autoridad del cliente con validación:
      sec: 0,            // nº de teleport: descarta informes en vuelo tras un salto
      _posT: Date.now(), // hora del último informe (presupuesto de velocidad)
      _margen: 0.8,      // cubeta de distancia disponible (anti-speedhack)
    };
    this.protegerPrimeraVisita(jug);
    this.prepararCaminata(jug);
    this.enviar(ws, {
      t: 'bienvenida', id, nivel: this.nivelId, inst: this.inst,
      semilla: this.semilla, privada: this.privada, x, y, rot: jug.rot, sec: 0,
      salud: jug.salud, sed: jug.sed, cordura: jug.cordura, inv: jug.inv, manos: jug.manos, equipo: jug.equipo,
      caminata: jug.caminataObjetivo ? { pasos: 0, objetivo: jug.caminataObjetivo } : null,
      jugadores: this.censo(), ...this.estadoDinamico(),
    });
    this.difundir({ t: 'entra', id, nombre, x, y, rot: jug.rot });
    this.jugadores.set(id, jug);
    return jug;
  }

  // Una sola ventana de seguridad por nivel y por conexión/run. Al conservar
  // el Set en `jug` durante los cruces, volver por una puerta no la renueva.
  protegerPrimeraVisita(jug, ahora = Date.now()) {
    jug.nivelesProtegidos ||= new Set();
    if (jug.nivelesProtegidos.has(this.nivelId)) return false;
    jug.nivelesProtegidos.add(this.nivelId);
    jug.invulnerableHasta = ahora + PROTECCION_ENTRADA_MS;
    return true;
  }

  // La caminata online es PERSONAL: tus pasos reales en el nivel te van
  // desintonizando hasta que TÚ haces no-clip al destino (el nivel no puede
  // «ceder» para 60 personas a la vez). El objetivo sale de tu token: cada
  // errante recorre su propia distancia.
  prepararCaminata(jug) {
    jug.pasosSala = 0;
    jug.distSala = 0;
    jug.caminataObjetivo = (this.map.caminatas || []).some(destinoDisponible)
      ? MapGen.walkingGoal(this.def, `${jug.token}::${this.clave}`, 1, 0)
      : 0;
  }

  enviarInv(jug) {
    this.enviar(jug.ws, {
      t: 'inv', inv: jug.inv, manos: jug.manos, equipo: jug.equipo,
    });
  }

  enviarEstado(jug) {
    this.enviar(jug.ws, { t: 'estado', salud: jug.salud, sed: jug.sed, cordura: jug.cordura });
  }

  herir(jug, cantidad, causa) {
    if (jug.espectador) return; // un observador no puede ser tocado
    jug.salud = Math.max(0, jug.salud - cantidad);
    this.enviarEstado(jug);
    if (jug.salud <= 0) this.morir(jug, causa);
  }

  supervivencia(jug, distancia) {
    if (distancia <= 0 || jug.muerto) return;
    jug._supervivencia = (jug._supervivencia || 0) + distancia;
    const pasos = Math.floor(jug._supervivencia / 4);
    if (!pasos) return;
    jug._supervivencia -= pasos * 4;
    const reglas = this.def.reglas || [];
    const posesion = new Set([...(jug.inv || []), ...(jug.manos || []), ...Object.values(jug.equipo || {})].filter(Boolean));
    const trajeHostil = posesion.has('avmh');
    const proteccionQuimica = trajeHostil || posesion.has('repelente_corrosion');
    const mascara = jug.equipo.cara === 'mascara_gas' || trajeHostil || proteccionQuimica;
    const chaqueta = jug.equipo.cuerpo === 'chaqueta' || trajeHostil;
    const botas = jug.equipo.pies === 'botas_reforzadas';
    // sed y cordura drenan por TILES reales acumulados con la MISMA cadencia
    // que el modo offline (1 turno ≈ 1 tile: sed base -1/9, calor -1/4;
    // cordura -1/20 con zumbido o -1/25 con alucinaciones/aislamiento/
    // vigilado, doblado con máscara/protección). Antes se descontaba por
    // "pasos" de 4 tiles con Math.ceil(), 5-6× más rápido de lo debido y sin
    // que la máscara marcara diferencia real (ceil(1/8) y ceil(1/4) daban 1).
    const tiles = pasos * 4;
    jug._sedAcum = (jug._sedAcum || 0) + tiles;
    const cadSed = reglas.includes('calor') ? 4 : 9;
    if (jug._sedAcum >= cadSed) {
      const n = Math.floor(jug._sedAcum / cadSed);
      jug._sedAcum -= n * cadSed;
      jug.sed = Math.max(0, jug.sed - n);
    }
    if (reglas.some((r) => ['zumbido', 'alucinaciones', 'aislamiento', 'vigilado'].includes(r))) {
      jug._corduraAcum = (jug._corduraAcum || 0) + tiles;
      const cadCordura = (reglas.includes('zumbido') ? 20 : 25) * (mascara ? 2 : 1);
      if (jug._corduraAcum >= cadCordura) {
        const n = Math.floor(jug._corduraAcum / cadCordura);
        jug._corduraAcum -= n * cadCordura;
        jug.cordura = Math.max(0, jug.cordura - n);
      }
    }
    if (reglas.includes('frio') && !chaqueta) this.herir(jug, pasos, 'el frío');
    // Los charcos sirena son una amenaza física del terreno: las botas
    // anulan el arrastre cuando el jugador pisa una casilla de agua.
    const tx = Fisica.tileDe(jug.x), ty = Fisica.tileDe(jug.y);
    if (!jug.muerto && reglas.includes('agua_traicionera') && !botas &&
        this.map.grid.t[ty * this.map.grid.w + tx] === 3)
      this.herir(jug, pasos * 2, 'un charco sirena');
    if (!jug.muerto && jug.sed === 0) this.herir(jug, pasos, 'la deshidratación');
    if (!jug.muerto && jug.cordura === 0) this.morir(jug, 'perdiste la cordura');
    if (!jug.muerto) this.enviarEstado(jug);
  }

  salir(jug) {
    if (!this.jugadores.delete(jug.id)) return;
    this.difundir({ t: 'sale', id: jug.id });
  }

  // ---------- v24: el MOVIMIENTO es del cliente; el servidor VALIDA ----------
  // Toda la saga v23.x demostró que simular el movimiento del jugador en el
  // servidor pelea contra la latencia (cerca de esquinas el resultado es
  // CAÓTICO: 60 ms deciden de qué lado de un pilar sales). En un cooperativo
  // la autoridad correcta es el cliente — integra su física (sim/fisica.js) y
  // reporta su posición; aquí solo se comprueba que sea FÍSICAMENTE posible:
  //  · cubeta de velocidad (anti-speedhack: Σdist ≤ vel·Σt, con margen)
  //  · caminoLegal (anti-noclip: nada de cruzar paredes entre informes)
  //  · sec (nº de teleport): descarta informes en vuelo tras un salto
  // Un informe ilegal NO mueve nada: se responde con la última posición
  // válida ('mueve' + sec) y el cliente vuelve a ella.
  posicion(jug, m) {
    // espectador (v30): la cámara sigue al objetivo en el cliente — ningún
    // informe cuenta (ni supervivencia, ni ofertas, ni validación)
    if (jug.muerto || jug.escondido || jug.espectador) return;
    if ((m.sec | 0) < (jug.sec || 0)) return; // anterior a un teleport: obsoleto
    const ahora = Date.now();
    const dt = Math.min(1.5, (ahora - (jug._posT ?? ahora)) / 1000);
    jug._posT = ahora;
    // El cliente integra hasta 0.6 s tras un microparón y envía el rastro en
    // tramos cortos. La cubeta guarda ese presupuesto, pero cada informe sigue
    // limitado a 1.3 tiles para que un salto grande no pase por teleport válido.
    jug._margen = Math.min(3.2, (jug._margen ?? 0.8) + dt * Fisica.VEL_JUGADOR * 1.12);
    const d = Fisica.dist(jug.x, jug.y, m.x, m.y);
    const excesoVel = d > 1.3 || d > jug._margen;
    if (excesoVel || !caminoLegal(this.map.grid, jug.x, jug.y, m.x, m.y)) {
      if (jug.rechazos) jug.rechazos[excesoVel ? 'vel' : 'muro']++;
      jug.sec = (jug.sec || 0) + 1;
      this.enviar(jug.ws, { t: 'mueve', id: jug.id, x: r2(jug.x), y: r2(jug.y), sec: jug.sec });
      return;
    }
    jug._margen -= d;
    jug.x = m.x; jug.y = m.y;
    if (m.rot !== undefined) jug.rot = m.rot;
    (this._movidosExtra || (this._movidosExtra = [])).push(jug);
    // canal de romper: alejarse del punto de inicio lo interrumpe
    if (jug.canal && Fisica.dist(m.x, m.y, jug.canal.origen[0], jug.canal.origen[1]) > 0.3)
      this.cancelarCanal(jug, 'Te apartas: dejas lo que estabas haciendo.');
    this.proximidad(jug);
    this.supervivencia(jug, d);
    this.caminataAvanza(jug, d);
    this.manilaAvanza(jug);
  }

  // Sala Manila: permanencia REAL (minutos de reloj) — ambiental, NO usa
  // jug.canal (eso bloquearía registrar/esconderse durante minutos enteros).
  // Cada estancia (entra/sale/reentra) es un intento propio con su tirada.
  manilaAvanza(jug) {
    const rect = this.map.manila;
    if (!rect || jug.muerto) { jug.manila = null; return; }
    const dentro = jug.x >= rect.x && jug.x < rect.x + rect.w &&
      jug.y >= rect.y && jug.y < rect.y + rect.h;
    if (!dentro) { jug.manila = null; return; }
    if (!jug.manila) {
      jug.manilaIntento = (jug.manilaIntento || 0) + 1;
      const seg = MapGen.manilaGoal(this.map.manilaSalida, `${jug.token}::${this.clave}`, jug.manilaIntento);
      jug.manila = { desde: Date.now(), objetivoMs: seg * 1000, aviso: 0 };
      return;
    }
    const frac = (Date.now() - jug.manila.desde) / jug.manila.objetivoMs;
    if (frac >= 0.5 && jug.manila.aviso < 1) {
      jug.manila.aviso = 1;
      this.enviar(jug.ws, { t: 'aviso', txt: 'Este sitio empieza a difuminarte los sentidos…' });
    } else if (frac >= 0.8 && jug.manila.aviso < 2) {
      jug.manila.aviso = 2;
      this.enviar(jug.ws, { t: 'aviso', txt: 'Cuesta recordar por qué entraste aquí…' });
    } else if (frac >= 1) {
      jug.manila = null;
      const original = this.map.manilaSalida;
      if (!original || !this.alCruzar) return;
      let destino = original.destino;
      if (destino?.startsWith('*opciones:'))
        destino = this.rng.pick(destino.slice('*opciones:'.length).split(','));
      const def = { ...original, destino, _destinoResuelto: destino };
      this.enviar(jug.ws, { t: 'aviso', txt: 'El tiempo se te ha escapado de las manos. Ya no sabes cuánto llevas aquí.' });
      this.alCruzar(jug, this, def, { sinTarjeta: true });
    }
  }

  // caminata personal por DISTANCIA recorrida (1 «paso» ≈ 1 tile)
  caminataAvanza(jug, d) {
    if (!jug.caminataObjetivo || jug.muerto) return;
    jug.distSala = (jug.distSala || 0) + d;
    const pasos = Math.floor(jug.distSala);
    if (pasos > (jug.pasosSala || 0)) {
      jug.pasosSala = pasos;
      if (pasos % 20 === 0 || pasos >= jug.caminataObjetivo)
        this.enviar(jug.ws, { t: 'caminata', pasos, objetivo: jug.caminataObjetivo });
      if (pasos >= jug.caminataObjetivo) {
        const defC = (this.map.caminatas || []).find(destinoDisponible);
        if (!defC) {
          jug.caminataObjetivo = 0;
          this.enviar(jug.ws, { t: 'aviso', txt: 'Ese camino no lleva a ninguna parte (nivel fuera del piloto).' });
          return;
        }
        if (this.alCruzar) this.alCruzar(jug, this, defC, { sinTarjeta: true });
      }
    }
  }

  // consecuencias de la posición (v22, por PROXIMIDAD): ofertar salida a
  // <0.6 (histéresis: se rearma al alejarse >1.0). v25: los objetos del suelo
  // ya NO se gestionan aquí — el botín es individual y lo recoge el cliente.
  proximidad(jug) {
    const s = this.salidaCerca(jug, 0.6);
    if (s && jug.ofertaEn !== s.i) this.ofrecer(jug, s);
    else if (!s && jug.ofertaEn !== null && !this.salidaCerca(jug, 1.0)) jug.ofertaEn = null;
  }

  salidaCerca(jug, radio) {
    let mejor = null, mejorD = radio;
    this.map.exits.forEach((e, i) => {
      const d = Fisica.dist(e.x, e.y, jug.x, jug.y);
      if (d <= mejorD) { mejorD = d; mejor = { i, ex: e }; }
    });
    // tu puerta personal de retorno (v23) compite como una salida más
    if (jug.retorno) {
      const r = jug.retorno;
      const d = Fisica.dist(r.x, r.y, jug.x, jug.y);
      if (d <= mejorD) {
        mejor = { i: 'R', ex: { x: r.x, y: r.y, def: {
          texto: 'El camino por el que llegaste sigue abierto', destino: r.destino, tipo: 'retorno',
        } } };
      }
    }
    return mejor;
  }

  ofrecer(jug, { i, ex }) {
    jug.ofertaEn = i;
    const def = ex.def;
    if ((def._mec === 'romper' || def._mec === 'romper_suelo') && !def._abierta) {
      this.enviar(jug.ws, {
        t: 'aviso',
        txt: def._mec === 'romper_suelo'
          ? 'El suelo CRUJE bajo la moqueta. Pulsa ESPACIO para intentar romperlo.'
          : 'Esta pared está AGRIETADA: suena hueca. Pulsa ESPACIO para intentar abrirla.',
      });
      return;
    }
    this.enviar(jug.ws, { t: 'oferta', i, texto: def.texto, destino: def.destino, tipo: def.tipo });
  }

  // ---------- ESPACIO contextual (v22: todo por proximidad) ----------
  // v25: los CONTENEDORES ya no pasan por aquí — registrar/dado/botín es
  // individual y vive en el cliente (Net.accion lo intercepta); al servidor
  // solo llega {t:'loot'} para dar de alta el objeto encontrado.
  accion(jug) {
    if (jug.espectador) { this.avisoFantasma(jug); return; }
    if (jug.muerto || jug.canal) return;
    // 1) escondite: salir de él
    if (jug.escondido) { this.esconder(jug, false); return; }
    const prop = (this.map.props || []).find(
      (p) => ESCONDITES.has(p.id) && Fisica.dist(p.x, p.y, jug.x, jug.y) <= 1.2
    );
    // 2) salida con mecánica de romper (a ≤1.0)
    const s = this.salidaCerca(jug, 1.0);
    if (s && (s.ex.def._mec === 'romper' || s.ex.def._mec === 'romper_suelo') && !s.ex.def._abierta) {
      this.iniciarRomper(jug, s);
      return;
    }
    // 3) salida normal: reofrecer
    if (s) { this.ofrecer(jug, s); return; }
    if (prop) { this.esconder(jug, true, prop); return; }
    this.enviar(jug.ws, { t: 'aviso', txt: 'No hay nada con lo que interactuar aquí.' });
  }

  // ---------- alta de botín (v25): el cliente resolvió su dado individual ----------
  // El servidor solo garantiza lo importante: cadencia (nada de granjas de
  // objetos por mensaje) y hueco en la mochila. El objeto debe existir.
  loot(jug, id) {
    if (jug.muerto || jug.espectador) return;
    const def = DATA.objects[id];
    if (!def) return;
    const ahora = Date.now();
    if (ahora - (jug._ultLoot || 0) < 1200) return; // cadencia máxima de botín
    if (jug.inv.length >= 6) {
      this.enviar(jug.ws, { t: 'aviso', txt: 'No te cabe nada más en la mochila.' });
      return;
    }
    jug._ultLoot = ahora;
    jug.inv.push(id);
    // tubería o linterna a una mano libre: lista para usar
    const m = jug.manos.indexOf(null);
    if (m >= 0 && (def.manos || def.efecto?.toggle === 'luz')) {
      jug.manos[m] = id;
      jug.inv.pop();
    }
    this.enviarInv(jug);
  }

  esconder(jug, si, prop) {
    if (si) {
      jug.escondido = { x: prop.x, y: prop.y };
      // el cuerpo se queda EN el mueble: al salir, sales de ahí
      jug.x = prop.x; jug.y = prop.y;
      jug.sec = (jug.sec || 0) + 1; // teleport: los informes en vuelo caducan
      this.difundir({ t: 'mueve', id: jug.id, x: r2(jug.x), y: r2(jug.y), sec: jug.sec });
      this.enviar(jug.ws, { t: 'aviso', txt: 'Te metes dentro. Nada debería verte… si nadie te vio entrar.' });
    } else {
      jug.escondido = null;
    }
    this.difundir({ t: 'esconde', id: jug.id, si: !!si });
  }

  // ---------- romper pared/suelo: canal de 1 s + dado ----------
  iniciarRomper(jug, { i, ex }) {
    const herramienta = jug.manos.includes('tuberia');
    jug.canal = { tipo: 'romper', i, hasta: Date.now() + 1000, herramienta, origen: [jug.x, jug.y] };
    this.hacerRuido(jug.x, jug.y, 10);
    this.difundir({ t: 'canal', id: jug.id, ms: 1000 });
  }

  cancelarCanal(jug, motivo) {
    jug.canal = null;
    this.enviar(jug.ws, { t: 'canalFin', ok: false });
    if (motivo) this.enviar(jug.ws, { t: 'aviso', txt: motivo });
  }

  resolverCanal(jug) {
    const c = jug.canal;
    jug.canal = null;
    const ex = this.map.exits[c.i];
    if (!ex || ex.def._abierta) return;
    let d = this.rng.int(1, 20);
    if (jug.inv.includes('trebol') || jug.manos.includes('trebol') || Object.values(jug.equipo).includes('trebol'))
      d = Math.min(20, d + 2);
    const esSuelo = ex.def._mec === 'romper_suelo';
    const umbral = c.herramienta ? 7 : (esSuelo ? 11 : 12);
    const exito = d >= umbral;
    // v25: el dado es asunto TUYO (los demás ya ven el derrumbe si abre)
    this.enviar(jug.ws, { t: 'dado', id: jug.id, valor: d, exito });
    this.enviar(jug.ws, { t: 'canalFin', ok: true });
    if (exito) {
      ex.def._abierta = true;
      this.difundir({ t: 'abierto', i: c.i });
      this.hacerRuido(ex.x, ex.y, 12);
    } else if (!c.herramienta) {
      // romper a puñetazos/pisotones duele
      jug.salud = Math.max(0, jug.salud - 2);
      this.enviar(jug.ws, { t: 'salud', valor: jug.salud });
      if (jug.salud <= 0) this.morir(jug, 'tus propios golpes');
    }
  }

  // ---------- cruzar salidas ----------
  cruzar(jug, si) {
    if (jug.espectador) return; // el observador cruza siguiendo a su objetivo
    if (!si) { jug.ofertaEn = null; return; }
    const s = this.salidaCerca(jug, 1.0);
    if (!s || jug.muerto) return;
    const defOriginal = s.ex.def;
    let def = defOriginal;
    if (defOriginal.destino === '*aleatoria') {
      const candidatos = Object.keys(DATA.levels).filter((id) => id !== this.nivelId);
      const destino = candidatos.length ? this.rng.pick(candidatos) : null;
      // La definición pertenece al mapa compartido: no convertir la puerta en
      // un destino fijo para quienes la crucen después.
      def = { ...defOriginal, destino, _destinoResuelto: destino };
    } else if (defOriginal.destino?.startsWith('*opciones:')) {
      const opciones = defOriginal.destino.slice('*opciones:'.length).split(',');
      const destino = this.rng.pick(opciones);
      def = { ...defOriginal, destino, _destinoResuelto: destino };
    }
    if ((def._mec === 'romper' || def._mec === 'romper_suelo') && !def._abierta) return;
    if (!DATA.levels[def.destino]) {
      this.enviar(jug.ws, { t: 'aviso', txt: 'Ese camino no lleva a ninguna parte (nivel fuera del piloto).' });
      return;
    }
    // ---------- riesgoVoid (paridad con crossExit de game.js) ----------
    // el mismo d20 que resolverCanal (this.rng, semilla de sala): la MISMA
    // secuencia determinista consumida por todo lo que ocurre en la sala.
    if (def.tipo === 'arriesgada' && def.riesgoVoid > 0) {
      let d = this.rng.int(1, 20);
      if (jug.inv.includes('trebol') || jug.manos.includes('trebol') || Object.values(jug.equipo).includes('trebol'))
        d = Math.min(20, d + 2);
      const umbral = Math.round(def.riesgoVoid * 20);
      const exito = d > umbral; // offline: d <= umbral === caes
      this.enviar(jug.ws, { t: 'dado', id: jug.id, valor: d, exito });
      if (!exito) { this.morir(jug, 'el Vacío'); return; }
    }
    if (this.alCruzar) this.alCruzar(jug, this, def);
  }

  // ---------- manos: tubería (golpe hacia donde miras) y linterna ----------
  aplicarNumericos(jug, def) {
    const ef = def.efecto || {};
    if (ef.salud) {
      if (ef.salud < 0) this.herir(jug, Math.abs(ef.salud), def.nombre);
      else jug.salud = Math.min(100, jug.salud + ef.salud);
    }
    if (ef.sed) jug.sed = Math.max(0, Math.min(100, jug.sed + ef.sed));
    if (ef.cordura) jug.cordura = Math.max(0, Math.min(100, jug.cordura + ef.cordura));
    if (ef.ruido) this.hacerRuido(jug.x, jug.y, ef.ruido);
    this.enviarEstado(jug);
    if (!jug.muerto && (jug.salud <= 0 || jug.sed <= 0 || jug.cordura <= 0))
      this.morir(jug, def.nombre);
  }

  entidadesEnRadio(jug, radio) {
    return this.entidades.filter((e) => e.viva && Fisica.dist(e.x, e.y, jug.x, jug.y) <= radio);
  }

  entidadFrontal(jug, rango) {
    const [fx, fy] = cardinalDe(jug.rot ?? Math.PI);
    let mejor = null, mejorD = Infinity;
    for (const e of this.entidades) {
      if (!e.viva) continue;
      const dx = Math.round(e.x - jug.x), dy = Math.round(e.y - jug.y);
      const delante = fx ? (Math.abs(dy) <= 1 && Math.sign(dx) === fx) : (Math.abs(dx) <= 1 && Math.sign(dy) === fy);
      const d = Math.abs(dx) + Math.abs(dy);
      if (delante && d <= rango && d < mejorD) { mejor = e; mejorD = d; }
    }
    return mejor;
  }

  danarEntidad(e, dano) {
    e.vida -= dano;
    e.revelada = true;
    if (e.vida <= 0) { e.viva = false; this.difundir({ t: 'entMuere', uid: e.uid }); }
    else this.difundir({ t: 'entHit', uid: e.uid });
  }

  usarActivoCatalogo(jug, def) {
    const ef = def.efecto || {};
    const radio = ef.radio || 3;
    this.aplicarNumericos(jug, def);
    if (jug.muerto) return true;
    switch (ef.activo) {
      case 'fuego':
      case 'fuego_menor':
      case 'toxina':
      case 'gas':
        for (const e of this.entidadesEnRadio(jug, radio)) {
          this.danarEntidad(e, ef.dano || (ef.activo === 'fuego' ? 30 : 20));
          if (ef.activo !== 'fuego_menor') e.huyendoHasta = Date.now() + 4000;
        }
        this.hacerRuido(jug.x, jug.y, ef.activo === 'fuego' ? 12 : 8);
        this.difundir({ t: 'golpe', id: jug.id, x: jug.x, y: jug.y });
        return true;
      case 'paralisis':
        for (const e of this.entidadesEnRadio(jug, radio || 1)) {
          e.paralizadaHasta = Date.now() + 90000;
          this.difundir({ t: 'entHit', uid: e.uid });
        }
        return true;
      case 'disparo': {
        const e = this.entidadFrontal(jug, 7);
        this.hacerRuido(jug.x, jug.y, ef.radio || 10);
        const [fx, fy] = cardinalDe(jug.rot ?? Math.PI);
        this.difundir({ t: 'golpe', id: jug.id, x: jug.x + fx, y: jug.y + fy });
        if (e) this.danarEntidad(e, ef.dano || 34);
        return true;
      }
      case 'flash':
        for (const e of this.entidadesEnRadio(jug, radio)) {
          e.revelada = true;
          e.paralizadaHasta = Date.now() + 1800;
          this.difundir({ t: 'entHit', uid: e.uid });
        }
        return true;
      case 'ruido':
        this.hacerRuido(jug.x, jug.y, radio);
        return true;
      case 'repeler':
      case 'sellar':
        for (const e of this.entidadesEnRadio(jug, radio)) e.huyendoHasta = Date.now() + 5000;
        return true;
      case 'salida': {
        const salidas = this.def.salidas.filter((s) => s.destino && DATA.levels[s.destino] && s.tipo !== 'sellada');
        const salida = salidas.length ? this.rng.pick(salidas) : null;
        if (!salida || !this.alCruzar) {
          this.enviar(jug.ws, { t: 'aviso', txt: `${def.nombre} vibra, pero no encuentra ruta estable.` });
          return true;
        }
        this.alCruzar(jug, this, salida);
        return true;
      }
      case 'blink': {
        const [fx, fy] = cardinalDe(jug.rot ?? Math.PI);
        for (let d = 5; d >= 2; d--) {
          const tx = Math.round(jug.x) + fx * d, ty = Math.round(jug.y) + fy * d;
          if (!esTransitable(this.map, tx, ty)) continue;
          jug.x = tx; jug.y = ty;
          // teleport de verdad (como esconder()/cambiarDeSala): sec nuevo para
          // que caduquen los informes en vuelo del cliente y 'mueve' (ya
          // manejado por cliente.js) en vez de un 't:tp' que nadie escuchaba
          jug.sec = (jug.sec || 0) + 1;
          this.difundir({ t: 'mueve', id: jug.id, x: r2(jug.x), y: r2(jug.y), sec: jug.sec });
          return true;
        }
        this.enviar(jug.ws, { t: 'aviso', txt: `${def.nombre} no encuentra hueco.` });
        return true;
      }
      case 'claridad':
        this.enviar(jug.ws, { t: 'aviso', txt: `${def.nombre}: entiendes un poco mejor este sitio.` });
        return true;
      case 'glitch':
        for (const e of this.entidadesEnRadio(jug, radio)) {
          e.revelada = true;
          this.difundir({ t: 'entHit', uid: e.uid });
        }
        return true;
      case 'celeridad':
      case 'ocultar':
      case 'refugio':
        jug.escondido = { temporal: true };
        this.difundir({ t: 'esconde', id: jug.id, si: true });
        return true;
      case 'riesgo':
        this.enviar(jug.ws, { t: 'aviso', txt: `${def.nombre} reacciona de forma peligrosa.` });
        return true;
      default:
        return false;
    }
  }

  usar(jug, mano) {
    if (jug.espectador) { this.avisoFantasma(jug); return; }
    if (jug.muerto || jug.escondido) return;
    const id = jug.manos[mano];
    const def = DATA.objects[id];
    if (def?.efecto?.toggle === 'luz') { this.luz(jug, !jug.luz); return; }
    if (def?.efecto?.activo && this.usarActivoCatalogo(jug, def)) {
      if (def.efecto.activo !== 'paralisis') {
        if (def.manos === 2 || jug.manos[1] === '=') jug.manos = [null, null];
        else jug.manos[mano] = null;
        this.enviarInv(jug);
      }
      return;
    }
    if (!def && id === 'linterna') { this.luz(jug, !jug.luz); return; }
    if (id !== 'tuberia') return;
    const ahora = Date.now();
    if (ahora - (jug.ultGolpe || 0) < 400) return;
    jug.ultGolpe = ahora;
    const [fx, fy] = cardinalDe(jug.rot ?? Math.PI);
    const tx = jug.x + fx, ty = jug.y + fy;
    this.difundir({ t: 'golpe', id: jug.id, x: tx, y: ty });
    this.hacerRuido(jug.x, jug.y, 8);
    // el barrido alcanza a la entidad viva más cercana al punto de impacto
    let e = null, mejor = 0.9;
    for (const e2 of this.entidades) {
      if (!e2.viva) continue;
      const d = Fisica.dist(e2.x, e2.y, tx, ty);
      if (d <= mejor) { mejor = d; e = e2; }
    }
    if (!e) return;
    const fuerte = [...(jug.inv || []), ...(jug.manos || [])].some((oid) => DATA.objects[oid]?.efecto?.pasivo === 'fuerza');
    e.vida -= fuerte ? 20 : 12;
    e.revelada = true;
    if (e.vida <= 0) {
      e.viva = false;
      this.difundir({ t: 'entMuere', uid: e.uid });
    } else {
      this.difundir({ t: 'entHit', uid: e.uid });
    }
  }

  // la linterna solo alumbra EN LA MANO (v23): el servidor manda, el cliente
  // refleja — luzDe llega también al dueño (nada de encender en local)
  luz(jug, si) {
    if (jug.espectador && si) return; // un fantasma no enciende linternas
    const tieneLuzEnMano = (jug.manos || []).some((id) => DATA.objects[id]?.efecto?.toggle === 'luz');
    if (si && !tieneLuzEnMano) {
      this.enviar(jug.ws, { t: 'aviso', txt: 'Necesitas una fuente de luz en la mano (B: mochila, arrastrala a una mano).' });
      si = false;
    }
    if (jug.luz === !!si) return;
    jug.luz = !!si;
    this.difundir({ t: 'luzDe', id: jug.id, si: jug.luz });
  }

  // ---------- mochila autoritativa (los gestos del panel llegan por red) ----------
  mochila(jug, m) {
    if (jug.espectador) { this.avisoFantasma(jug); return; }
    if (jug.muerto) return;
    const OBJ = DATA.objects;
    const aviso = (txt) => this.enviar(jug.ws, { t: 'aviso', txt });
    switch (m.que) {
      case 'equipar': {
        const id = jug.inv[m.slot];
        const def = id && OBJ[id];
        if (!def || !def.manos) { aviso('Eso no se empuña.'); return; }
        if (def.manos === 2) {
          if (jug.manos[0] || jug.manos[1]) { aviso('Necesitas las DOS manos libres.'); return; }
          jug.manos = [id, '='];
        } else {
          const libre = jug.manos.indexOf(null);
          if (libre < 0) { aviso('Tienes las manos ocupadas.'); return; }
          jug.manos[libre] = id;
        }
        jug.inv.splice(m.slot, 1);
        break;
      }
      case 'desequipar': {
        let mano = m.mano;
        if (jug.manos[mano] === '=') mano = 0;
        const id = jug.manos[mano];
        if (!id) return;
        if (jug.inv.length >= 6) { aviso('La mochila está llena.'); return; }
        if (OBJ[id] && OBJ[id].manos === 2) jug.manos = [null, null];
        else jug.manos[mano] = null;
        jug.inv.push(id);
        break;
      }
      case 'usarItem': {
        const id = jug.inv[m.slot];
        const def = id && OBJ[id];
        if (!def) return;
        const ef = def.efecto || {};
        if (ef.activo && this.usarActivoCatalogo(jug, def)) {
          if (ef.activo !== 'paralisis') jug.inv.splice(m.slot, 1);
          aviso(`Usas ${def.nombre}.`);
        } else if (ef.salud || ef.sed || ef.cordura || ef.ruido) {
          this.aplicarNumericos(jug, def);
          jug.inv.splice(m.slot, 1);
          aviso(`Usas ${def.nombre}.`);
        } else if (ef.toggle === 'luz') {
          this.luz(jug, !jug.luz);
        } else {
          aviso('Aquí dentro, eso todavía no surte efecto.');
          return;
        }
        break;
      }
      case 'tirar': case 'arrojar': {
        const id = jug.inv[m.slot];
        if (!id) return;
        jug.inv.splice(m.slot, 1);
        let tx = jug.x, ty = jug.y;
        if (m.que === 'arrojar') {
          // vuela hasta 4 casillas hacia donde miras: distracción sonora
          const [fx, fy] = cardinalDe(jug.rot ?? Math.PI);
          const jx = Fisica.tileDe(jug.x), jy = Fisica.tileDe(jug.y);
          for (let d = 4; d >= 1; d--) {
            if (esTransitable(this.map, jx + fx * d, jy + fy * d)) { tx = jx + fx * d; ty = jy + fy * d; break; }
          }
          this.hacerRuido(tx, ty, 12);
        }
        // v25: el objeto en el suelo es TUYO (mundo de botín individual):
        // solo tu cliente lo dibuja y lo puede volver a recoger
        this.enviar(jug.ws, { t: 'itemSuelto', x: tx, y: ty, id, recien: m.que === 'tirar' });
        break;
      }
      case 'ponerEquipo': {
        const id = jug.inv[m.slot];
        const def = id && OBJ[id];
        if (!def || !def.equipo) { aviso('Eso no se viste.'); return; }
        const anterior = jug.equipo[def.equipo];
        jug.equipo[def.equipo] = id;
        jug.inv.splice(m.slot, 1);
        if (anterior) jug.inv.push(anterior);
        break;
      }
      case 'quitarEquipo': {
        const id = jug.equipo[m.tipo];
        if (!id) return;
        if (jug.inv.length >= 6) { aviso('La mochila está llena.'); return; }
        jug.equipo[m.tipo] = null;
        jug.inv.push(id);
        break;
      }
    }
    this.enviarInv(jug);
    // si la linterna salió de las manos con la luz encendida, se apaga sola
    if (jug.luz && !(jug.manos || []).some((id) => DATA.objects[id]?.efecto?.toggle === 'luz')) this.luz(jug, false);
  }

  hacerRuido(x, y, radio) {
    this.ruido = { x, y, radio, hasta: Date.now() + 3200 };
  }

  // ---------- modo espectador del guardián (v30) ----------
  avisoFantasma(jug) {
    this.enviar(jug.ws, { t: 'aviso', txt: 'Eres un observador: las Backrooms no te sienten.' });
  }

  // convierte al guardián en observador invisible del objetivo (misma sala).
  // Para los demás clientes simplemente «se va» ('sale'); las entidades lo
  // ignoran por los filtros de sim/entidades.js.
  espectarA(jug, objetivo) {
    if (!jug.espectador) this.difundir({ t: 'sale', id: jug.id }, jug.id);
    if (jug.luz) this.luz(jug, false);
    jug.espectador = { objetivo: objetivo.id };
    jug.escondido = null; jug.canal = null; jug.manila = null; jug.ofertaEn = null;
    jug.x = objetivo.x; jug.y = objetivo.y;
    jug.sec = (jug.sec || 0) + 1; // teleport: caducan los informes en vuelo
    this.enviar(jug.ws, { t: 'mueve', id: jug.id, x: r2(jug.x), y: r2(jug.y), sec: jug.sec });
    this.enviar(jug.ws, { t: 'espectar', si: true, objetivo: { id: objetivo.id, nombre: objetivo.nombre } });
  }

  // el observador vuelve al mundo: reaparece junto a su objetivo (o donde
  // estaba) y los demás lo ven entrar
  dejarDeEspectar(jug, motivo) {
    if (!jug.espectador) return;
    const obj = this.jugadores.get(jug.espectador.objetivo);
    jug.espectador = null;
    const ancla = obj || jug;
    const [x, y] = this.buscarSpawn(Fisica.tileDe(ancla.x), Fisica.tileDe(ancla.y));
    jug.x = x; jug.y = y;
    jug.sec = (jug.sec || 0) + 1;
    jug._posT = Date.now();
    jug._margen = 0.8;
    this.enviar(jug.ws, { t: 'mueve', id: jug.id, x: r2(x), y: r2(y), sec: jug.sec });
    this.difundir({ t: 'entra', id: jug.id, nombre: jug.nombre, x, y, rot: jug.rot }, jug.id);
    this.enviar(jug.ws, { t: 'espectar', si: false });
    if (motivo) this.enviar(jug.ws, { t: 'aviso', txt: motivo });
  }

  // ---------- muerte: como el roguelike, despiertas otra vez en Level 0 ----------
  morir(jug, causa) {
    if (jug.espectador) return; // los observadores no mueren
    jug.muerto = true;
    jug.escondido = null;
    jug.canal = null;
    jug.manila = null;
    if (jug.luz) this.luz(jug, false); // la linterna se pierde con el resto
    db.sumarMuerte(jug.token);
    this.enviar(jug.ws, { t: 'botinReset', semilla: this.semilla });
    this.difundir({ t: 'muere', id: jug.id, causa });
    setTimeout(() => {
      if (!this.jugadores.has(jug.id)) return;
      jug.salud = 100; jug.sed = 100; jug.cordura = 100;
      jug.muerto = false;
      jug.inv = []; jug.manos = [null, null];
      // lo VESTIDO también se queda atrás (paridad con startRun del modo solo;
      // si no, las botas_reforzadas regalaban su bonus para siempre)
      jug.equipo = { cara: null, cuerpo: null, pies: null };
      this.enviarInv(jug); // el cliente pisa inv/manos/equipo (mensaje 'inv')
      if (this.alMorir) this.alMorir(jug, this, causa);
    }, 2500);
  }

  // ---------- remodelación no euclidiana: EVENTO de sala (v21) ----------
  // El mismo algoritmo del modo solo (regenerar un chunk 14×14 lejos de la
  // vista, conservando bordes y validando conectividad) pero para TODOS a la
  // vez: el crujido que recorre el nivel lo oye la sala entera.
  remodelar() {
    const g = this.map.grid, T = MapGen.T, CH = 14;
    if (g.w < CH + 6 || g.h < CH + 6) return false;
    const rng = this.rng;
    for (let intento = 0; intento < 12; intento++) {
      const cx = rng.int(2, g.w - CH - 3);
      const cy = rng.int(2, g.h - CH - 3);
      // fuera de la vista de TODOS los jugadores de la sala
      let vista = false;
      for (const j of this.jugadores.values()) {
        const ncx = Math.max(cx, Math.min(j.x, cx + CH - 1));
        const ncy = Math.max(cy, Math.min(j.y, cy + CH - 1));
        if (Math.max(Math.abs(j.x - ncx), Math.abs(j.y - ncy)) < 20) { vista = true; break; }
      }
      if (vista) continue;
      if (this.map.exits.some((e) => e.x >= cx && e.x < cx + CH && e.y >= cy && e.y < cy + CH)) continue;

      const backup = new Uint8Array(CH * CH);
      for (let y = 0; y < CH; y++)
        for (let x = 0; x < CH; x++)
          backup[y * CH + x] = g.t[(cy + y) * g.w + (cx + x)];

      for (let y = 1; y < CH - 1; y++)
        for (let x = 1; x < CH - 1; x++) {
          const gx = cx + x, gy = cy + y;
          const viejo = g.t[gy * g.w + gx];
          if (viejo === T.VACIO || viejo === T.AGUA) continue;
          const pilar = (gx % 2 === 0 && gy % 2 === 0) || rng.chance(0.22);
          g.t[gy * g.w + gx] = pilar ? T.PARED : T.SUELO;
        }
      const dentro = (x, y) => x >= cx && x < cx + CH && y >= cy && y < cy + CH;
      for (const it of this.map.items) if (!it.taken && dentro(it.x, it.y)) g.t[it.y * g.w + it.x] = T.SUELO;
      for (const pr of this.map.props || []) if (dentro(pr.x, pr.y)) g.t[pr.y * g.w + pr.x] = T.SUELO;
      for (const e of this.entidades) if (e.viva && dentro(e.x, e.y)) g.t[e.y * g.w + e.x] = T.SUELO;

      // validar: salidas Y jugadores siguen conectados entre sí (BFS del spawn)
      const dist = MapGen.bfsDist(g, this.map.spawn[0], this.map.spawn[1]);
      const ok = this.map.exits.every((e) => dist[e.y * g.w + e.x] >= 0) &&
        [...this.jugadores.values()].every(
          (j) => dist[Fisica.tileDe(j.y) * g.w + Fisica.tileDe(j.x)] >= 0);
      if (!ok) {
        for (let y = 0; y < CH; y++)
          for (let x = 0; x < CH; x++)
            g.t[(cy + y) * g.w + (cx + x)] = backup[y * CH + x];
        continue;
      }

      const tiles = [];
      for (let y = 0; y < CH; y++)
        for (let x = 0; x < CH; x++) tiles.push(g.t[(cy + y) * g.w + (cx + x)]);
      this.difundir({ t: 'remodel', x: cx, y: cy, ch: CH, tiles });
      return true;
    }
    return false;
  }

  // ---------- tick de simulación (lo llama el anfitrión a 20 Hz) ----------
  tick(ahora) {
    if (!this.jugadores.size) return;
    const dt = Math.min(0.25, (ahora - (this._ultTick || ahora)) / 1000);
    this._ultTick = ahora;
    // las posiciones aceptadas en posicion() esperan aquí su difusión
    const movidos = this._movidosExtra || [];
    this._movidosExtra = [];
    for (const jug of this.jugadores.values())
      if (jug.canal && ahora >= jug.canal.hasta) this.resolverCanal(jug);
    Entidades.tick(this, ahora, dt);
    // difusión BATCHED de posiciones: un solo mensaje por tick con lo que se
    // movió (dedupe: un jugador puede venir del tramo parcial Y del tick)
    if (movidos.length || (this._entMovidas && this._entMovidas.length)) {
      this.difundir({
        t: 'pos',
        j: [...new Map(movidos.map((j) => [j.id, j])).values()]
          .map((j) => [j.id, r2(j.x), r2(j.y), r2(j.rot ?? 0)]),
        e: (this._entMovidas || []).map((e) => [e.uid, r2(e.x), r2(e.y)]),
      });
      this._entMovidas = [];
    }
    // regla no_euclidiana de la ficha: cada 45-90 s el nivel se reorganiza.
    // DESACTIVADA online (v23.6, decisión del usuario): quien entra a una sala
    // DESPUÉS de una remodelación reconstruye el mapa desde la semilla SIN los
    // chunks cambiados → su cliente y el servidor juegan con mapas distintos
    // (desync brutal, jugadores atravesando paredes). El modo LOCAL sí puede
    // (activarRemodel): su único cliente nunca entra «tarde».
    if (REMODEL_ONLINE && (this.def.reglas || []).includes('no_euclidiano')) {
      if (!this._remodelEn) this._remodelEn = ahora + 45000 + this.rng.int(0, 45000);
      if (ahora >= this._remodelEn) {
        this._remodelEn = ahora + 45000 + this.rng.int(0, 45000);
        this.remodelar();
      }
    }
  }

  chat(jug, txt) {
    if (jug.espectador) { this.avisoFantasma(jug); return; }
    const ahora = Date.now();
    if (ahora < (jug.muteadoHasta || 0)) {
      this.enviar(jug.ws, { t: 'aviso', txt: 'Estás silenciado. Las paredes no te escuchan.' });
      return;
    }
    if (ahora - jug.ultChat < COOLDOWN_CHAT) {
      this.enviar(jug.ws, { t: 'aviso', txt: 'Más despacio: un mensaje cada segundo y medio.' });
      return;
    }
    jug.ultChat = ahora;
    this.mensajes++;
    ganchos.registrarChat(this.nivelId, this.inst, jug.nombre, txt);
    // chat de PROXIMIDAD: solo lo oye quien está a ≤14 casillas del que habla
    // (ni siquiera viaja por la red a los demás — nada de espiar el tráfico)
    const raw = JSON.stringify({ t: 'chat', id: jug.id, txt });
    for (const j of this.jugadores.values()) {
      if (j.ws.readyState !== 1) continue;
      if (j.id !== jug.id && Math.hypot(j.x - jug.x, j.y - jug.y) > RADIO_CHAT) continue;
      j.ws.send(raw);
    }
  }

  enviar(ws, msg) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  difundir(msg, exceptoId) {
    const raw = JSON.stringify(msg);
    for (const j of this.jugadores.values())
      if (j.id !== exceptoId && j.ws.readyState === 1) {
        j.ws.send(raw);
        metricas.bytes += raw.length;
      }
  }
}

// ---------- registro de salas ----------
const salas = new Map();

// Una sala vacía se libera tras un periodo de gracia: si alguien vuelve antes,
// conserva su estado dinámico (paredes rotas, contenedores registrados,
// entidades muertas); si no, se recupera la memoria — la misma clave recrea
// el MISMO mapa desde su semilla. Sin esto el registro solo crecía: cada
// nivel::instancia visitado retenía su grid y sus entidades para siempre.
const GRACIA_SALA_VACIA = 5 * 60 * 1000;

// El modo local fija aquí su base de semilla («solo::<aleatoria>»): cada run
// offline tiene su propio mundo. El servidor conserva la base «mmo».
let semillaBase = 'mmo';
function fijarSemillaBase(base) { semillaBase = base; }

function crearSala(nivelId, inst, grupo) {
  const sala = new Sala(nivelId, inst, grupo, semillaBase);
  salas.set(claveInterna(nivelId, inst, grupo), sala);
  console.log(`[sala] abierta ${sala.clave} (${sala.map.grid.w}×${sala.map.grid.h}, ${sala.entidades.length} entidades)`);
  return sala;
}

function asignar(nivelId, grupo = SALA_PUBLICA) {
  grupo = grupoSala(grupo);
  let inst = 1;
  for (;;) {
    const clave = claveInterna(nivelId, inst, grupo);
    let sala = salas.get(clave);
    if (!sala) sala = crearSala(nivelId, inst, grupo);
    if (!sala.llena) return sala;
    inst++;
  }
}

function totalJugadores() {
  return [...salas.values()].reduce((n, s) => n + s.jugadores.size, 0);
}

function todas() { return [...salas.values()]; }

// ---------- cruce de salas y respawn (compartidos servidor/local) ----------

function prepararSala(sala) {
  sala.alCruzar = cambiarDeSala;
  sala.alMorir = (jug, salaVieja, causa) => cambiarDeSala(jug, salaVieja, {
    destino: 'level-0',
    texto: `Moriste (${causa}). Despiertas otra vez sobre la moqueta húmeda, con las manos vacías.`,
  }, { sinRetorno: true });
}

// salidas de las que físicamente NO se puede volver — la MISMA regla que
// esSinRetorno en game.js (caídas, vacío, desplomes) para que el mundo
// online respete la física del modo original
function esSinRetorno(def) {
  if (def.sinRetorno) return true;
  if (def.tipo === 'void') return true;
  return /agujero|caes |caer |caída|desplom|abismo|pozo|trampilla|no.?clip|desmay|despiert/i.test(def.texto || '');
}

// cruce de salas: sacar de la sala vieja, meter en la del nivel destino y
// mandar el estado nuevo (el cliente reconstruye el mapa desde la semilla)
function cambiarDeSala(jug, salaVieja, defSalida, opts) {
  salaVieja.salir(jug);
  const nueva = asignar(defSalida.destino, salaVieja.grupo);
  prepararSala(nueva);
  // ---------- puerta de RETORNO (v23): la puerta que cruzaste te espera ----------
  // salvo que llegaras cayendo/por el vacío/noclip (caminata o /tp): de ahí no se vuelve
  const origen = salaVieja.nivelId;
  const conRetorno = !(opts && opts.sinRetorno) && !(opts && opts.sinTarjeta) &&
    !esSinRetorno(defSalida) && origen !== nueva.nivelId;
  jug.retorno = null;
  // cruzar por aquí SIEMPRE devuelve al mundo (un espectador viaja por
  // moverEspectador): si un guardián espectando usa /tp, el flag no puede
  // sobrevivir en el servidor con el cliente ya fuera del modo
  jug.espectador = null;
  let x, y;
  const iVuelta = conRetorno
    ? nueva.map.exits.findIndex((e) => e.def.destino === origen) : -1;
  if (iVuelta >= 0) {
    // el nivel ya tiene la puerta que conecta de vuelta: apareces a su lado
    const ex = nueva.map.exits[iVuelta];
    [x, y] = nueva.buscarSpawn(ex.x, ex.y);
    jug.ofertaEn = iVuelta; // no reabrir la oferta hasta alejarse y volver
  } else {
    [x, y] = nueva.buscarSpawn();
    if (conRetorno) {
      // puerta personal: SOLO tú la ves — es TU camino de vuelta
      jug.retorno = { x, y, destino: origen };
      jug.ofertaEn = 'R';
    } else jug.ofertaEn = null;
  }
  jug.x = x; jug.y = y;
  jug.canal = null; jug.escondido = null; jug.manila = null;
  // teleport de sala: caducan los informes de posición en vuelo (v24)
  jug.sec = (jug.sec || 0) + 1;
  jug._posT = Date.now();
  jug._margen = 0.8;
  nueva.protegerPrimeraVisita(jug);
  nueva.prepararCaminata(jug);
  const id = jug.id;
  nueva.jugadores.set(id, jug);
  nueva.enviar(jug.ws, {
    t: 'nivel', nivel: nueva.nivelId, inst: nueva.inst, semilla: nueva.semilla, privada: nueva.privada,
    x, y, rot: jug.rot, sec: jug.sec, via: defSalida.texto,
    sinTarjeta: !!(opts && opts.sinTarjeta),
    salud: jug.salud, sed: jug.sed, cordura: jug.cordura, inv: jug.inv, manos: jug.manos, equipo: jug.equipo,
    retorno: jug.retorno,
    caminata: jug.caminataObjetivo ? { pasos: 0, objetivo: jug.caminataObjetivo } : null,
    jugadores: nueva.censo(), ...nueva.estadoDinamico(),
  });
  nueva.difundir({ t: 'entra', id, nombre: jug.nombre, x, y, rot: jug.rot }, id);
  if (jug.luz) nueva.difundir({ t: 'luzDe', id, si: true });
  if (jug._reSala) jug._reSala(nueva);
  db.registrarVisita(jug.token, nueva.nivelId);
  if (nueva.def.esEscape) db.sumarEscape(jug.token);
  console.log(`[→] ${jug.nombre}#${id} cruza a ${nueva.clave}`);
  // v30: tus espectadores cruzan CONTIGO (invisibles) — cubre puertas,
  // caminata, Sala Manila, /tp y el respawn tras la muerte
  for (const esp of [...salaVieja.jugadores.values()])
    if (esp.espectador && esp.espectador.objetivo === id)
      moverEspectador(esp, salaVieja, nueva, jug);
}

// ---------- modo espectador del guardián (v30) ----------
// Mueve a un espectador a la MISMA instancia que su objetivo (sin pasar por
// asignar(): con la sala llena acabaría en otra instancia y perdería la
// acción). Réplica del tramo final de cambiarDeSala sin retorno ni caminata.
function moverEspectador(esp, salaVieja, nueva, objetivo) {
  salaVieja.salir(esp); // el 'sale' que difunde es inofensivo: nadie lo tenía
  esp.retorno = null;
  esp.canal = null; esp.escondido = null; esp.manila = null; esp.ofertaEn = null;
  esp.caminataObjetivo = 0;
  esp.x = objetivo.x; esp.y = objetivo.y;
  esp.sec = (esp.sec || 0) + 1;
  esp._posT = Date.now();
  esp._margen = 0.8;
  nueva.jugadores.set(esp.id, esp);
  nueva.enviar(esp.ws, {
    t: 'nivel', nivel: nueva.nivelId, inst: nueva.inst, semilla: nueva.semilla, privada: nueva.privada,
    x: esp.x, y: esp.y, rot: esp.rot, sec: esp.sec,
    via: `Sigues a ${objetivo.nombre} a través de la realidad.`,
    sinTarjeta: true,
    salud: esp.salud, sed: esp.sed, cordura: esp.cordura, inv: esp.inv, manos: esp.manos, equipo: esp.equipo,
    retorno: null, caminata: null,
    jugadores: nueva.censo(), ...nueva.estadoDinamico(),
    espectador: { id: objetivo.id, nombre: objetivo.nombre },
  });
  if (esp._reSala) esp._reSala(nueva);
  console.log(`[👁] ${esp.nombre}#${esp.id} sigue a ${objetivo.nombre}#${objetivo.id} → ${nueva.clave}`);
}

const api = {
  Sala, salas, crearSala, asignar, todas, totalJugadores,
  prepararSala, cambiarDeSala, esSinRetorno, moverEspectador,
  usarDb, ganchos, metricas, activarRemodel, fijarSemillaBase,
  generarMapa, esTransitable,
  SALA_PUBLICA, GRACIA_SALA_VACIA, CAP_SALA, COOLDOWN_CHAT, RADIO_CHAT,
};
if (esNode) module.exports = api;
else window.Salas = api;
})();
