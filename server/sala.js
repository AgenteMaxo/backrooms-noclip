// Wrapper Node de las reglas del mundo: la clase Sala, el registro de salas y
// el cruce entre niveles viven en game/js/sim/sala.js (archivo DUAL — el modo
// offline del navegador ejecuta EXACTAMENTE las mismas reglas con un servidor
// local). Aquí queda solo lo exclusivo del servidor real: la base de datos de
// expedientes, el registro de chat del observatorio, las métricas del bucle y
// las vistas /estado y /observa.
'use strict';

require('./sim/mundo'); // bootstrap: carga el motor del juego en global
const compartido = require('../game/js/sim/sala');
const db = require('./db');

const {
  Sala, salas, asignar, todas, totalJugadores,
  prepararSala, cambiarDeSala, esSinRetorno, moverEspectador,
  metricas, SALA_PUBLICA, GRACIA_SALA_VACIA,
} = compartido;

// el servidor real SÍ registra expedientes (muertes/visitas/escapes)
compartido.usarDb(db);

// registro de chat reciente para el observatorio: anillo global etiquetado con
// nivel/instancia. El guardián lo lee por /chat; el juego NO lo difunde (el
// chat sigue siendo de proximidad — esto es solo la vista de moderación).
const CHAT_LOG_MAX = 400;
const chatLog = [];
let chatSeq = 0;
compartido.ganchos.registrarChat = function (nivel, inst, nombre, txt) {
  chatLog.push({ seq: ++chatSeq, ts: Date.now(), nivel, inst, nombre, txt });
  if (chatLog.length > CHAT_LOG_MAX) chatLog.shift();
};
function chatReciente(nivel, desdeSeq) {
  return chatLog.filter((c) => (!nivel || c.nivel === nivel) && c.seq > (desdeSeq | 0));
}

function tickTodas(ahora) {
  const t0 = process.hrtime.bigint();
  for (const [clave, s] of salas) {
    if (!s.jugadores.size) {
      if (!s._vaciaDesde) s._vaciaDesde = ahora;
      else if (ahora - s._vaciaDesde >= GRACIA_SALA_VACIA) {
        salas.delete(clave);
        console.log(`[sala] cerrada ${s.clave} (vacía)`);
      }
      continue;
    }
    s._vaciaDesde = 0;
    // una sala rota no puede tumbar el resto del mundo
    try { s.tick(ahora); } catch (e) { console.error(`[sala ${s.clave}] tick:`, e.message); }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  metricas.ultMs = ms;
  if (ms > metricas.maxMs) metricas.maxMs = ms;
  metricas.medias.push(ms);
  if (metricas.medias.length > 300) metricas.medias.shift(); // últimos 30 s
}

function estado() {
  const media = metricas.medias.length
    ? metricas.medias.reduce((a, b) => a + b, 0) / metricas.medias.length : 0;
  return {
    salas: [...salas.values()].map((s) => ({
      clave: s.clave, privada: s.privada, jugadores: s.jugadores.size,
      entidades: s.entidades.filter((e) => e.viva).length,
    })),
    total: [...salas.values()].reduce((n, s) => n + s.jugadores.size, 0),
    tick: { ultimoMs: +metricas.ultMs.toFixed(2), medioMs: +media.toFixed(2), maxMs: +metricas.maxMs.toFixed(2) },
    memoriaMB: Math.round(process.memoryUsage().rss / 1048576),
    salidaKBs: metricas.kbs,
  };
}

const r2 = (v) => Math.round(v * 100) / 100;
const { DATA } = require('./sim/mundo');

// Observatorio (solo guardián): el detalle que /estado no da — cada jugador
// con sus barras, inventario, equipo y rechazos del validador. `dicc` traduce
// ids de objeto a nombre para que el panel no muestre claves crudas.
// Los tokens NO viajan enteros (son la credencial del jugador): solo 6 chars
// para correlacionar con la base de datos a mano si hace falta.
function observa() {
  const ahora = Date.now();
  const dicc = {};
  const conNombre = (id) => {
    if (id && !dicc[id]) dicc[id] = (DATA.objects[id] && DATA.objects[id].nombre) || id;
    return id;
  };
  // agregado POR NIVEL: reúne todas las instancias/seeds del mismo nivel
  // (varias salas «level-0::1», «level-0::2»… suman aquí) — jugadores, chat,
  // instancias abiertas. Es la vista de negocio: qué niveles se juegan.
  const porNivel = new Map();
  for (const s of salas.values()) {
    const k = s.nivelId;
    if (!porNivel.has(k)) porNivel.set(k, {
      nivel: k, nombre: s.def.nombre || k, peligro: s.def.peligro,
      jugadores: 0, mensajes: 0, instancias: 0, privadas: 0,
    });
    const a = porNivel.get(k);
    // los espectadores no cuentan como jugadores del nivel (vista de negocio)
    a.jugadores += [...s.jugadores.values()].filter((j) => !j.espectador).length;
    a.mensajes += s.mensajes;
    a.instancias++;
    if (s.privada) a.privadas++;
  }

  return {
    ...estado(),
    ahora,
    niveles: [...porNivel.values()].sort((a, b) => b.jugadores - a.jugadores || b.mensajes - a.mensajes),
    salas: [...salas.values()].map((s) => ({
      clave: s.clave, nivel: s.nivelId, nombre: s.def.nombre || s.nivelId,
      peligro: s.def.peligro, privada: s.privada, semilla: s.semilla,
      inst: s.inst, mensajes: s.mensajes,
      entidades: s.entidades.filter((e) => e.viva).map((e) => e.id),
      jugadores: [...s.jugadores.values()].map((j) => ({
        id: j.id, nombre: j.nombre, token6: String(j.token || '').slice(0, 6),
        x: r2(j.x), y: r2(j.y),
        salud: j.salud, sed: j.sed, cordura: j.cordura,
        luz: !!j.luz, escondido: !!j.escondido, muerto: !!j.muerto,
        esAdmin: !!j.esAdmin, muteado: j.muteadoHasta > ahora,
        espectador: !!j.espectador,
        conectadoS: Math.round((ahora - (j.conectadoEn || ahora)) / 1000),
        distSala: Math.round(j.distSala || 0),
        inv: (j.inv || []).map(conNombre),
        manos: (j.manos || []).map(conNombre),
        equipo: {
          cara: conNombre(j.equipo && j.equipo.cara),
          cuerpo: conNombre(j.equipo && j.equipo.cuerpo),
          pies: conNombre(j.equipo && j.equipo.pies),
        },
        rechazos: j.rechazos || { vel: 0, muro: 0 },
      })),
    })),
    dicc,
  };
}

// caudal de salida: se consolida cada 5 s
setInterval(() => {
  const dt = (Date.now() - metricas.bytesT) / 1000;
  metricas.kbs = Math.round(metricas.bytes / dt / 1024);
  metricas.bytes = 0;
  metricas.bytesT = Date.now();
}, 5000);

module.exports = {
  Sala, asignar, tickTodas, estado, totalJugadores, observa, chatReciente, todas,
  prepararSala, cambiarDeSala, esSinRetorno, moverEspectador,
  SALA_PUBLICA, GRACIA_SALA_VACIA,
};
