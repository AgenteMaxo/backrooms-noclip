// Protocolo v1 de BACKROOMS MMO — mensajes JSON pequeños sobre WebSocket.
//
// Cliente → servidor:
//   {t:'hola', nombre, token, v, sala?} presentarse (sala = código privado opcional)
//   {t:'mover', dx, dy}                 intento de paso a casilla adyacente
//   {t:'rot', rot}                      girar sobre sí mismo (0-3, gratis)
//   {t:'chat', txt}                     mensaje de chat (≤120 chars)
//   {t:'ping'}                          latido
//
// Servidor → cliente:
//   {t:'bienvenida', id, nivel, inst, semilla, x, y, rot, jugadores:[{id,nombre,x,y,rot}]}
//   {t:'entra', id, nombre, x, y, rot}  alguien aparece en tu sala
//   {t:'sale', id}                      alguien se va
//   {t:'mueve', id, x, y}               posición autoritativa (también corrige la tuya)
//   {t:'gira', id, rot}
//   {t:'chat', id, txt}                 chat aprobado (ya filtrado)
//   {t:'aviso', txt}                    mensaje de sistema (solo para ti)
//   {t:'error', txt}                    rechazo con motivo
//   {t:'pong'}
'use strict';

const VERSION = 9; // v30.13: apagones globales de Level 1 (mensaje 'apagon' + campo en estadoDinamico)
const MAX_MSG = 512;          // bytes por mensaje entrante
const MAX_CHAT = 120;         // caracteres de un chat
const COOLDOWN_MOVER = 165;   // ms entre pasos (el cliente usa 170: margen de jitter)
const COOLDOWN_CHAT = 1500;   // ms entre mensajes de chat
const RADIO_CHAT = 14;        // casillas: el chat es de PROXIMIDAD (voz, no megafonía)
const CAP_SALA = 60;          // jugadores por instancia de nivel
const CAP_POR_IP = 8;         // conexiones simultáneas por IP
const MAX_SALA_PRIVADA = 32;  // caracteres máximos del código de sala privada

// Parsea y valida la FORMA de un mensaje entrante. Devuelve null si no es válido.
function leer(raw) {
  if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) return null;
  if (raw.length > MAX_MSG) return null;
  let m;
  try { m = JSON.parse(raw.toString('utf8')); } catch (e) { return null; }
  if (!m || typeof m !== 'object' || typeof m.t !== 'string') return null;
  switch (m.t) {
    case 'hola':
      if (typeof m.nombre !== 'string' || typeof m.token !== 'string') return null;
      if (m.token.length > 64) return null;
      if (m.nivel !== undefined && (typeof m.nivel !== 'string' || m.nivel.length > 32)) return null;
      if (m.sala !== undefined && (typeof m.sala !== 'string' || m.sala.length > MAX_SALA_PRIVADA)) return null;
      return m;
    case 'p': { // v24: POSICIÓN reportada por el cliente (él es la autoridad
      // del movimiento; el servidor la VALIDA — velocidad, paredes, teleports)
      const x = +m.x, y = +m.y, rot = +m.rot;
      if (!isFinite(x) || !isFinite(y)) return null;
      return { t: 'p', x, y, rot: isFinite(rot) ? rot : 0, sec: m.sec | 0 };
    }
    case 'chat':
      if (typeof m.txt !== 'string') return null;
      return { t: 'chat', txt: m.txt.slice(0, MAX_CHAT) };
    case 'accion':
      return { t: 'accion' };                         // ESPACIO contextual
    case 'cruzar':
      return { t: 'cruzar', si: !!m.si };             // respuesta a una oferta de salida
    case 'usar': {
      const mano = m.mano | 0;
      if (mano !== 0 && mano !== 1) return null;
      return { t: 'usar', mano };                     // Q/E: tubería o linterna
    }
    case 'luz':
      return { t: 'luz', si: !!m.si };                // F: linterna encendida/apagada
    case 'mochila': {                                 // gestos del panel de inventario
      const que = m.que;
      if (!['equipar', 'desequipar', 'usarItem', 'tirar', 'arrojar', 'ponerEquipo', 'quitarEquipo'].includes(que)) return null;
      const out = { t: 'mochila', que };
      if (m.slot !== undefined) { out.slot = m.slot | 0; if (out.slot < 0 || out.slot > 9) return null; }
      if (m.mano !== undefined) { out.mano = m.mano | 0; if (out.mano !== 0 && out.mano !== 1) return null; }
      if (m.tipo !== undefined) { if (!['cara', 'cuerpo', 'pies'].includes(m.tipo)) return null; out.tipo = m.tipo; }
      return out;
    }
    case 'loot': { // v25: el botín es INDIVIDUAL y se resuelve en el cliente;
      // aquí solo se pide el alta en el inventario (el server pone cadencia y hueco)
      if (typeof m.id !== 'string' || m.id.length > 32) return null;
      return { t: 'loot', id: m.id };
    }
    case 'admin': { // contraseña de guardián desde Ajustes (responde {t:'admin', si})
      if (typeof m.clave !== 'string' || m.clave.length > 64) return null;
      return { t: 'admin', clave: m.clave };
    }
    case 'espectar': { // v30: el guardián observa a un jugador (null = dejar de hacerlo)
      // v30.7: dir = rotar al siguiente/anterior errante de TODAS las salas
      if (m.dir === 'sig' || m.dir === 'ant') return { t: 'espectar', dir: m.dir };
      if (m.objetivo === null || m.objetivo === undefined) return { t: 'espectar', objetivo: null };
      const objetivo = m.objetivo | 0;
      if (objetivo <= 0) return null;
      return { t: 'espectar', objetivo };
    }
    case 'ping': { // eco del sello de tiempo: el cliente mide su RTT con el pong
      const out = { t: 'ping' };
      if (m.ts !== undefined) { const ts = +m.ts; if (isFinite(ts)) out.ts = ts; }
      return out;
    }
    default:
      return null;
  }
}

module.exports = {
  VERSION, MAX_MSG, MAX_CHAT, COOLDOWN_MOVER, COOLDOWN_CHAT, RADIO_CHAT,
  CAP_SALA, CAP_POR_IP, MAX_SALA_PRIVADA,
  leer,
};
