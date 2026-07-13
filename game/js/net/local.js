// BACKROOMS MMO — SERVIDOR LOCAL: el modo offline ejecuta las MISMAS reglas
// que el servidor real, dentro de la propia pestaña. La Sala y la IA vienen
// de game/js/sim/sala.js y sim/entidades.js (archivos duales compartidos con
// server/): el cliente (net/cliente.js) habla con este módulo por un ws FALSO
// (loopback) y no distingue si al otro lado hay un VPS o esta misma pestaña.
//
// Réplica del enrutado de server/server.js sin red ni moderación: aquí no hay
// filtro de chat, ni baneos, ni límites por IP — estás solo en tu mundo.
(function () {
  'use strict';

  const NIVEL_INICIAL = 'level-0';
  let jug = null;
  let sala = null;
  let bucle = null;

  function token() {
    try {
      let t = localStorage.getItem('mmo-token');
      if (!t) {
        t = Array.from(crypto.getRandomValues(new Uint8Array(16)),
          (b) => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem('mmo-token', t);
      }
      return t;
    } catch (e) { return 'sin-token'; }
  }

  // comandos de guardián útiles en local (debug): /tp y /give — el resto de
  // la moderación (kick/ban/mute) no tiene sentido contra uno mismo
  function comando(linea) {
    const DATA = window.GAME_DATA;
    const [cmd, ...args] = linea.trim().split(/\s+/);
    const aviso = (txt) => sala.enviar(jug.ws, { t: 'aviso', txt });
    if (cmd === '/tp') {
      const id = args[0];
      if (!id || !DATA.levels[id]) { aviso(`/tp <nivel> — «${id || ''}» no existe.`); return true; }
      Salas.cambiarDeSala(jug, sala, { destino: id, texto: 'El guardián camina por donde quiere.' }, { sinRetorno: true });
      return true;
    }
    if (cmd === '/give') {
      const id = args[0];
      if (!id || !DATA.objects[id]) { aviso(`/give <objeto> — «${id || ''}» no existe.`); return true; }
      if (jug.inv.length >= 6) { aviso('No te cabe nada más en la mochila.'); return true; }
      jug.inv.push(id);
      sala.enviarInv(jug);
      aviso(`El guardián materializa: ${DATA.objects[id].nombre}.`);
      return true;
    }
    if (cmd.startsWith('/')) { aviso('En local solo existen /tp y /give.'); return true; }
    return false;
  }

  // el switch de server.js, sin P.leer (los mensajes ya nacen bien formados
  // en cliente.js — aquí no hay clientes hostiles que validar)
  const stats = { p: 0, otros: 0 }; // telemetría de depuración
  function procesar(m) {
    if (!jug || !m || typeof m.t !== 'string') return;
    if (m.t === 'p') stats.p++; else stats.otros++;
    switch (m.t) {
      case 'p': sala.posicion(jug, m); break;
      case 'loot': sala.loot(jug, m.id); break;
      case 'accion': sala.accion(jug); break;
      case 'cruzar': sala.cruzar(jug, m.si); break;
      case 'usar': sala.usar(jug, m.mano); break;
      case 'luz': sala.luz(jug, m.si); break;
      case 'mochila': sala.mochila(jug, m); break;
      case 'admin':
        // paridad con la regla v25: en local cualquier clave desbloquea
        jug.esAdmin = true;
        sala.enviar(jug.ws, { t: 'admin', si: true });
        break;
      case 'chat': {
        const txt = String(m.txt || '').slice(0, 120);
        if (!txt) break;
        if (txt.startsWith('/')) { comando(txt); break; }
        sala.chat(jug, txt);
        break;
      }
      case 'ping':
        sala.enviar(jug.ws, m.ts !== undefined ? { t: 'pong', ts: m.ts } : { t: 'pong' });
        break;
    }
  }

  // Conecta el cliente al mundo local. `alRecibir(m)` recibe los mensajes de
  // la sala YA parseados; devuelve el ws falso que cliente.js usará para
  // enviar. TODAS las entregas van por microtarea (FIFO): ni la sala ni el
  // cliente re-entran en su propio envío — el mismo aislamiento que da la red.
  function conectar(nombre, alRecibir, nivelInicial) {
    const S = window.Salas;
    if (!jug) {
      // cada carga de página = una run con su propio mundo (semilla aleatoria
      // de sesión); el registro de salas PERSISTE mientras dure la pestaña —
      // volver a un nivel te lo devuelve tal y como lo dejaste, como online
      const base = 'solo::' + Math.random().toString(36).slice(2, 10);
      S.fijarSemillaBase(base);
      // la remodelación no euclidiana vuelve en local (v23.6 la apagó online
      // por el desync entre clientes; aquí el único cliente vive en esta
      // misma pestaña y jamás entra «tarde» a una sala remodelada)
      S.activarRemodel(true);
    }
    // ws falso del LADO SALA: lo que la sala «envía» le llega al cliente
    const wsSala = {
      readyState: 1,
      send(raw) {
        const m = JSON.parse(raw);
        queueMicrotask(() => alRecibir(m));
      },
    };
    const nivel = nivelInicial && window.GAME_DATA.levels[nivelInicial] ? nivelInicial : NIVEL_INICIAL;
    sala = S.asignar(nivel);
    S.prepararSala(sala);
    jug = sala.entrar(wsSala, nombre, token(), {});
    jug._reSala = (s) => { sala = s; }; // el cruce actualiza la sala activa
    if (!bucle) {
      // el corazón del mundo: 20 Hz como el servidor real. En una pestaña en
      // segundo plano el navegador lo ralentiza — el mundo «se pausa» contigo.
      bucle = setInterval(() => {
        const ahora = Date.now();
        for (const s of S.todas()) {
          if (!s.jugadores.size) continue;
          try { s.tick(ahora); } catch (e) { console.error('[local] tick:', e); }
        }
      }, 50);
    }
    // ws falso del LADO CLIENTE: lo que el cliente envía entra al router
    return {
      readyState: 1,
      send(raw) {
        const m = JSON.parse(raw);
        queueMicrotask(() => procesar(m));
      },
      close() {},
    };
  }

  window.Local = {
    conectar,
    // introspección para depuración/selftest: el estado que la sala local
    // tiene de ti (la verdad del «servidor»)
    get jugador() { return jug; },
    get sala() { return sala; },
    get stats() { return stats; },
  };
})();
