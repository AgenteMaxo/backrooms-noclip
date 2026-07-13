// BACKROOMS MMO — servidor: estáticos del juego + WebSocket de salas.
// Uso: node server/server.js [puerto]   (por defecto 8080)
// En producción va detrás de Caddy (TLS); en desarrollo se abre
// http://localhost:8080 directamente (mismo origen para el ws).
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const P = require('./protocolo');
const filtro = require('./filtro');
const {
  asignar, tickTodas, estado, totalJugadores, observa, chatReciente,
  prepararSala, cambiarDeSala, moverEspectador,
} = require('./sala');
const { DATA } = require('./sim/mundo');
const db = require('./db');

// clave de administración: variable de entorno MMO_ADMIN, o la última fijada
// en caliente con /admin-clave (persistida en datos/, fuera del repo), o una
// aleatoria impresa al arrancar. Un guardián YA autenticado puede cambiarla
// sin tocar el servidor ni reiniciar nada — process.env solo se lee una vez
// al arrancar el proceso, así que editar el .service no basta sin restart.
const ADMIN_CLAVE_FICHERO = path.join(__dirname, 'datos', 'admin-clave.txt');
let ADMIN_CLAVE = process.env.MMO_ADMIN ||
  Math.random().toString(36).slice(2, 10);
try {
  const guardada = fs.readFileSync(ADMIN_CLAVE_FICHERO, 'utf8').trim();
  if (guardada) ADMIN_CLAVE = guardada;
} catch (e) { /* sin clave guardada aún: usa MMO_ADMIN o la aleatoria */ }

const PUERTO = parseInt(process.argv[2], 10) || 8080;
const RAIZ = path.join(__dirname, '..', 'game');
const NIVEL_INICIAL = 'level-0';
const RE_SALA_PRIVADA = /^[a-z0-9_-]{3,32}$/;

function codigoSalaPrivada(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  return RE_SALA_PRIVADA.test(s) ? s : false;
}

// ---------- estáticos (sin dependencias: mimetipos a mano) ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

// ---------- observatorio (solo guardián) ----------
// El detalle por jugador (posición, inventario, equipo) daría ventaja a
// cualquier jugador que lo lea: exige la MISMA clave que /admin, con el mismo
// freno anti fuerza bruta (5 fallos en 10 min por IP).
const ARRANQUE = Date.now();
const obsFallos = new Map(); // ip -> [timestamps de fallos]

function ipDe(req) {
  const reenviada = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return reenviada || req.socket.remoteAddress || '?';
}

// verifica la clave de guardián con freno anti fuerza bruta (5 fallos/10 min
// por IP). Devuelve 'ok' | 'mal' | 'freno'. La comparten /observa, /chat y
// /accion (moderación).
function chequearClave(clave, ip) {
  const ahora = Date.now();
  const fallos = (obsFallos.get(ip) || []).filter((t) => ahora - t < 600000);
  if (fallos.length >= 5) { obsFallos.set(ip, fallos); return 'freno'; }
  if (clave === ADMIN_CLAVE) { obsFallos.delete(ip); return 'ok'; }
  fallos.push(ahora);
  obsFallos.set(ip, fallos);
  return 'mal';
}

function claveObserva(req) {
  const clave = new URL(req.url, 'http://x').searchParams.get('clave') || '';
  return chequearClave(clave, ipDe(req));
}

// busca un jugador VIVO por su id numérico en cualquier sala (para moderar
// desde el panel sin exponer el token completo por la red)
function buscarPorId(id) {
  for (const s of salasVivas())
    for (const j of s.jugadores.values())
      if (j.id === id) return { jug: j, sala: s };
  return null;
}

// grafo de niveles para la Sala de Control: nodos + aristas desde las fichas
// (estático: se calcula una vez). El sentinel *opciones:a,b conecta con VARIOS
// destinos, como en pipeline/make-map.js→destinosDe.
let _grafoCache = null;
function grafoNiveles() {
  if (_grafoCache) return _grafoCache;
  const destinosDe = (s) => {
    if (!s.destino) return [];
    if (s.destino.startsWith('*opciones:'))
      return s.destino.slice('*opciones:'.length).split(',').filter((id) => DATA.levels[id]);
    return DATA.levels[s.destino] ? [s.destino] : [];
  };
  const niveles = {};
  for (const [id, lv] of Object.entries(DATA.levels)) {
    niveles[id] = {
      id, wikiTitle: lv.wikiTitle, nombre: lv.nombre, clase: lv.clase,
      peligro: lv.peligro, bioma: lv.bioma, esEscape: !!lv.esEscape,
      salidas: (lv.salidas || []).map((s) => ({
        destinos: destinosDe(s), tipo: s.tipo, texto: s.texto,
      })),
    };
  }
  _grafoCache = JSON.stringify({ niveles });
  return _grafoCache;
}

const servidor = http.createServer((req, res) => {
  const rutaUrl = (req.url || '/').split('?')[0];
  if (rutaUrl === '/censo') {
    res.writeHead(200, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify({ total: totalJugadores() }));
    return;
  }
  if (rutaUrl === '/estado') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(estado()));
    return;
  }
  if (rutaUrl === '/observa') {
    const ok = claveObserva(req);
    if (ok !== 'ok') {
      res.writeHead(ok === 'freno' ? 429 : 403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: ok === 'freno'
        ? 'Demasiados intentos: las paredes desconfían de ti un buen rato.'
        : 'La clave no abre nada.' }));
      return;
    }
    const datos = observa();
    datos.historico = db.resumen();
    datos.uptimeS = Math.round((Date.now() - ARRANQUE) / 1000);
    datos.protocolo = P.VERSION;
    datos.node = process.version;
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(datos));
    return;
  }
  if (rutaUrl === '/chat') {
    const ok = claveObserva(req);
    if (ok !== 'ok') { res.writeHead(ok === 'freno' ? 429 : 403); res.end(); return; }
    const q = new URL(req.url, 'http://x').searchParams;
    const nivel = q.get('nivel') || '';
    const desde = parseInt(q.get('desde'), 10) || 0;
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ mensajes: chatReciente(nivel, desde) }));
    return;
  }
  if (rutaUrl === '/accion' && req.method === 'POST') {
    let cuerpo = '';
    req.on('data', (c) => { cuerpo += c; if (cuerpo.length > 2000) req.destroy(); });
    req.on('end', () => {
      let m; try { m = JSON.parse(cuerpo); } catch (e) { m = {}; }
      const ok = chequearClave(m.clave || '', ipDe(req));
      if (ok !== 'ok') {
        res.writeHead(ok === 'freno' ? 429 : 403, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: ok === 'freno' ? 'Demasiados intentos.' : 'La clave no abre nada.' }));
        return;
      }
      const responder = (cod, cuerpo) => {
        res.writeHead(cod, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(cuerpo));
      };
      // acciones sin objetivo: anuncio global (retos del streamer) y salir de espectar
      if (m.accion === 'anuncio') {
        const txt = String(m.txt || '').trim().slice(0, 200);
        if (!txt) { responder(400, { error: 'Anuncio vacío.' }); return; }
        for (const s of salasVivas()) s.difundir({ t: 'anuncio', txt });
        console.log(`[obs] anuncio: ${txt}`);
        responder(200, { ok: true, msg: 'Anunciado a todas las Backrooms.' });
        return;
      }
      if (m.accion === 'espectar' || m.accion === 'espectar-fin') {
        // el cuerpo del guardián: su jugador conectado con la clave validada
        // (si hay varios, el de conexión más reciente)
        const guardianes = [];
        for (const s of salasVivas())
          for (const j of s.jugadores.values())
            if (j.esAdmin) guardianes.push({ jug: j, sala: s });
        guardianes.sort((a, b) => (b.jug.conectadoEn || 0) - (a.jug.conectadoEn || 0));
        const g = guardianes[0];
        if (!g) { responder(409, { error: 'Entra al juego y valida tu clave 🔑 en Ajustes primero.' }); return; }
        const r2 = espectar(g.jug, g.sala, m.accion === 'espectar-fin' ? null : (m.id | 0));
        if (r2.error) { responder(409, { error: r2.error }); return; }
        console.log(`[obs] ${m.accion} por ${g.jug.nombre}#${g.jug.id}`);
        responder(200, { ok: true, msg: r2.msg });
        return;
      }
      const r = buscarPorId(m.id | 0);
      if (!r) { responder(404, { error: 'Ese errante ya no está conectado.' }); return; }
      let msg;
      if (m.accion === 'kick') {
        r.jug.ws.close(1008, 'expulsado');
        msg = `${r.jug.nombre} expulsado.`;
        console.log(`[obs] kick ${r.jug.nombre}#${r.jug.id}`);
      } else if (m.accion === 'ban') {
        db.ban(r.jug.token);
        r.jug.ws.close(1008, 'baneado');
        msg = `${r.jug.nombre} baneado (no podrá volver a entrar con este navegador).`;
        console.log(`[obs] ban ${r.jug.nombre}#${r.jug.id}`);
      } else {
        responder(400, { error: 'Acción inválida.' }); return;
      }
      responder(200, { ok: true, msg });
    });
    return;
  }
  if (rutaUrl === '/observatorio' || rutaUrl === '/observatorio/mapa') {
    const archivo = rutaUrl === '/observatorio' ? 'observatorio.html' : 'observatorio-mapa.html';
    fs.readFile(path.join(__dirname, archivo), (err, datos) => {
      if (err) { res.writeHead(404); res.end('no existe'); return; }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
      res.end(datos);
    });
    return;
  }
  if (rutaUrl === '/grafo') {
    // grafo estático de niveles para la Sala de Control (misma clave que /observa)
    const ok = claveObserva(req);
    if (ok !== 'ok') {
      res.writeHead(ok === 'freno' ? 429 : 403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: ok === 'freno' ? 'Demasiados intentos.' : 'La clave no abre nada.' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(grafoNiveles());
    return;
  }
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  // normaliza y encierra dentro de game/ (nada de ../)
  const ruta = path.normalize(path.join(RAIZ, url === '/' ? 'index.html' : url));
  if (!ruta.startsWith(RAIZ)) { res.writeHead(403); res.end(); return; }
  fs.readFile(ruta, (err, datos) => {
    if (err) { res.writeHead(404); res.end('no existe'); return; }
    const ext = path.extname(ruta).toLowerCase();
    const cab = { 'content-type': MIME[ext] || 'application/octet-stream' };
    // el CÓDIGO no se cachea: tras un deploy, F5 normal basta para jugar la
    // versión nueva (un cliente viejo cacheado jugaba con bugs ya arreglados);
    // los assets pesados (audio/imagen/fuentes) sí pueden cachear un rato
    if (ext === '.html' || ext === '.js' || ext === '.css') cab['cache-control'] = 'no-cache';
    else cab['cache-control'] = 'public, max-age=3600';
    res.writeHead(200, cab);
    res.end(datos);
  });
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server: servidor, path: '/ws' });
const porIp = new Map(); // ip -> nº de conexiones

function sala2enviar(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

wss.on('connection', (ws, req) => {
  // Detrás de Caddy todos llegan como 127.0.0.1: la IP real va en X-Forwarded-For.
  // En desarrollo (conexión loopback directa, sin cabecera) no se aplica el cap
  // — si no, los enjambres de bots de prueba se autobloquean.
  const directa = req.socket.remoteAddress || '?';
  const reenviada = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const esLocal = directa === '127.0.0.1' || directa === '::1' || directa === '::ffff:127.0.0.1';
  const ip = reenviada || directa;
  const n = (porIp.get(ip) || 0) + 1;
  if (n > P.CAP_POR_IP && !(esLocal && !reenviada)) { ws.close(1008, 'demasiadas conexiones'); return; }
  porIp.set(ip, n);

  let jug = null, sala = null;
  ws.vivo = true;
  ws.on('pong', () => { ws.vivo = true; });

  // sin presentarse en 5 s → fuera
  const timbre = setTimeout(() => { if (!jug) ws.close(1008, 'sin hola'); }, 5000);

  ws.on('message', (raw) => {
    const m = P.leer(raw);
    if (!m) return;
    if (m.t === 'hola') {
      if (jug) return; // ya presentado
      clearTimeout(timbre);
      if ((m.v | 0) !== P.VERSION) {
        // cliente de una versión vieja: que recargue la página
        sala2enviar(ws, { t: 'error', txt: 'Versión nueva del juego: recarga la página (Ctrl+F5).' });
        ws.close(1008, 'version');
        return;
      }
      const nombre = filtro.nombreLimpio(m.nombre);
      const expediente = db.conectar(m.token, nombre);
      if (expediente.baneado) { ws.close(1008, 'baneado'); return; }
      const salaPrivada = codigoSalaPrivada(m.sala);
      if (salaPrivada === false) {
        sala2enviar(ws, { t: 'error', txt: 'Código de sala privada inválido. Usa 3-32 letras, números, _ o -.' });
        ws.close(1008, 'sala');
        return;
      }
      // puerta de desarrollo (?nivel=): SOLO con MMO_DEV=1 — en producción
      // todo el mundo despierta en Level 0, como manda el lore
      const devOk = process.env.MMO_DEV === '1';
      const nivel = devOk && m.nivel && DATA.levels[m.nivel] ? m.nivel : NIVEL_INICIAL;
      sala = asignar(nivel, salaPrivada || undefined);
      prepararSala(sala);
      jug = sala.entrar(ws, nombre, m.token, expediente);
      jug._reSala = (s) => { sala = s; };  // el cruce actualiza la sala del socket
      db.registrarVisita(m.token, nivel);
      console.log(`[+] ${jug.nombre}#${jug.id} → ${sala.clave} (${sala.jugadores.size})`);
      return;
    }
    if (!jug) return; // todo lo demás exige estar dentro
    if (m.t === 'espectar') {
      // modo espectador (v30): solo el guardián
      if (!jug.esAdmin) { sala.enviar(ws, { t: 'aviso', txt: 'Comando desconocido.' }); return; }
      // v30.7: ←/→ rotan entre TODOS los errantes de todas las instancias
      const objetivo = m.dir ? objetivoGlobal(jug, m.dir === 'sig' ? 1 : -1) : m.objetivo;
      if (m.dir && objetivo === null) {
        sala.enviar(ws, { t: 'aviso', txt: 'No hay otros errantes a los que observar.' });
        return;
      }
      const r = espectar(jug, sala, objetivo);
      if (r.error) sala.enviar(ws, { t: 'aviso', txt: r.error });
      return;
    }
    if (m.t === 'p') sala.posicion(jug, m);
    else if (m.t === 'loot') sala.loot(jug, m.id);
    else if (m.t === 'accion') sala.accion(jug);
    else if (m.t === 'cruzar') sala.cruzar(jug, m.si);
    else if (m.t === 'usar') sala.usar(jug, m.mano);
    else if (m.t === 'luz') sala.luz(jug, m.si);
    else if (m.t === 'mochila') sala.mochila(jug, m);
    else if (m.t === 'admin') {
      // contraseña de guardián desde Ajustes: desbloquea debug y barras
      intentarAdmin(jug, sala, m.clave);
      sala.enviar(ws, { t: 'admin', si: !!jug.esAdmin });
      if (!jug.esAdmin)
        sala.enviar(ws, { t: 'aviso', txt: 'La clave no abre nada.' });
    }
    else if (m.t === 'chat') {
      if (m.txt.startsWith('/')) { comando(jug, sala, m.txt); return; }
      const txt = filtro.chatLimpio(m.txt);
      if (txt) sala.chat(jug, txt);
    } else if (m.t === 'ping') sala.enviar(ws, m.ts !== undefined ? { t: 'pong', ts: m.ts } : { t: 'pong' });
  });

  ws.on('close', () => {
    porIp.set(ip, (porIp.get(ip) || 1) - 1);
    if (porIp.get(ip) <= 0) porIp.delete(ip);
    if (jug && sala) {
      sala.salir(jug);
      // si alguien lo estaba espectando, su objetivo se ha desvanecido
      for (const esp of [...sala.jugadores.values()])
        if (esp.espectador && esp.espectador.objetivo === jug.id)
          sala.dejarDeEspectar(esp, `${jug.nombre} se ha desvanecido de las Backrooms.`);
      console.log(`[-] ${jug.nombre}#${jug.id} ← ${sala.clave} (${sala.jugadores.size})`);
    }
  });
  ws.on('error', () => {});
});

// prepararSala/esSinRetorno/cambiarDeSala Y moverEspectador viven en
// game/js/sim/sala.js (compartidos con el modo offline local) y llegan por
// el wrapper ./sala.

// v30.7: siguiente/anterior errante observable de TODAS las salas (todas las
// instancias y niveles), en orden estable nivel → instancia → id: las flechas
// del espectador recorren el mundo entero, no solo la sala actual.
function objetivoGlobal(jug, dir) {
  const todos = [];
  for (const s of salasVivas())
    for (const j of s.jugadores.values())
      if (!j.espectador && !j.muerto && j.id !== jug.id)
        todos.push({ j, k: `${s.nivelId}::${String(s.inst).padStart(4, '0')}` });
  if (!todos.length) return null;
  todos.sort((a, b) => a.k < b.k ? -1 : a.k > b.k ? 1 : a.j.id - b.j.id);
  const actual = jug.espectador ? jug.espectador.objetivo : -1;
  const i = todos.findIndex((t) => t.j.id === actual);
  const base = i < 0 ? (dir > 0 ? -1 : 0) : i;
  return todos[((base + dir) % todos.length + todos.length) % todos.length].j.id;
}

// entra/sale/cambia de objetivo del modo espectador. La comparten el mensaje
// ws {t:'espectar'} y el botón 👁 del observatorio (/accion). Devuelve
// {ok, msg} o {error}.
function espectar(jug, sala, objetivoId) {
  if (objetivoId === null || objetivoId === undefined) {
    if (!jug.espectador) return { error: 'No estabas observando a nadie.' };
    sala.dejarDeEspectar(jug, 'Vuelves a pisar la moqueta.');
    return { ok: true, msg: `${jug.nombre} vuelve al mundo.` };
  }
  if (jug.muerto) return { error: 'El guardián está muriendo: espera a despertar en Level 0.' };
  const r = buscarPorId(objetivoId | 0);
  if (!r) return { error: 'Ese errante ya no está conectado.' };
  if (r.jug.id === jug.id) return { error: 'No puedes observarte a ti mismo.' };
  if (r.jug.espectador) return { error: 'Ese errante también es un observador.' };
  if (r.jug.muerto) return { error: 'Ese errante está muriendo: espera a que despierte.' };
  if (r.sala === sala) {
    sala.espectarA(jug, r.jug);
  } else {
    // objetivo en otra sala: desaparecer de la actual y viajar con él
    if (!jug.espectador) sala.difundir({ t: 'sale', id: jug.id }, jug.id);
    if (jug.luz) sala.luz(jug, false);
    jug.espectador = { objetivo: r.jug.id };
    moverEspectador(jug, sala, r.sala, r.jug);
  }
  return { ok: true, msg: `Observando a ${r.jug.nombre} en ${r.sala.def.nombre || r.sala.nivelId}.` };
}
// ---------- comandos de chat (moderación del streamer) ----------
const { todas: salasVivas } = require('./sala');

// intento de clave de guardián con FRENO anti fuerza bruta: los espectadores
// PRUEBAN claves en directo — 5 fallos en 10 min silencian los intentos
function intentarAdmin(jug, sala, clave) {
  const ahora = Date.now();
  jug._admFallos = (jug._admFallos || []).filter((t) => ahora - t < 600000);
  if (jug._admFallos.length >= 5) {
    sala.enviar(jug.ws, { t: 'aviso', txt: 'Demasiados intentos: las paredes desconfían de ti un buen rato.' });
    return false;
  }
  if (clave === ADMIN_CLAVE) {
    jug.esAdmin = true;
    return true;
  }
  jug._admFallos.push(ahora);
  console.log(`[admin] intento fallido de ${jug.nombre}#${jug.id} (${jug._admFallos.length}/5)`);
  return false;
}

function buscarJugador(nombre) {
  const objetivo = nombre.toLowerCase();
  for (const sala2 of salasVivas())
    for (const j of sala2.jugadores.values())
      if (j.nombre.toLowerCase() === objetivo) return { jug: j, sala: sala2 };
  return null;
}

function comando(jug, sala, linea) {
  const [cmd, ...resto] = linea.trim().split(/\s+/);
  const arg = resto.join(' ');
  if (cmd === '/admin') {
    if (intentarAdmin(jug, sala, arg)) {
      sala.enviar(jug.ws, { t: 'admin', si: true }); // desbloquea la UI de debug
      sala.enviar(jug.ws, { t: 'aviso', txt: 'Las Backrooms te reconocen como su guardián.' });
    } else sala.enviar(jug.ws, { t: 'aviso', txt: 'La clave no abre nada.' });
    return;
  }
  if (!jug.esAdmin) { sala.enviar(jug.ws, { t: 'aviso', txt: 'Comando desconocido.' }); return; }
  if (cmd === '/anuncio' && arg) {
    for (const s of salasVivas()) s.difundir({ t: 'anuncio', txt: arg });
  } else if (cmd === '/kick' && arg) {
    const r = buscarJugador(arg);
    if (r) { r.jug.ws.close(1008, 'expulsado'); sala.enviar(jug.ws, { t: 'aviso', txt: `${r.jug.nombre} expulsado.` }); }
    else sala.enviar(jug.ws, { t: 'aviso', txt: 'No hay nadie con ese nombre.' });
  } else if (cmd === '/mute' && resto.length) {
    const r = buscarJugador(resto[0]);
    const min = parseInt(resto[1], 10) || 10;
    if (r) { r.jug.muteadoHasta = Date.now() + min * 60000; sala.enviar(jug.ws, { t: 'aviso', txt: `${r.jug.nombre} silenciado ${min} min.` }); }
    else sala.enviar(jug.ws, { t: 'aviso', txt: 'No hay nadie con ese nombre.' });
  } else if (cmd === '/ban' && arg) {
    const r = buscarJugador(arg);
    if (r) { db.ban(r.jug.token); r.jug.ws.close(1008, 'baneado'); sala.enviar(jug.ws, { t: 'aviso', txt: `${r.jug.nombre} baneado.` }); }
    else sala.enviar(jug.ws, { t: 'aviso', txt: 'No hay nadie con ese nombre.' });
  } else if (cmd === '/tp' && arg) {
    // teletransporte de guardián: /tp level-14 (o /tp 14) — debug entre niveles
    const limpio = arg.trim().toLowerCase();
    const id = DATA.levels[limpio] ? limpio
      : DATA.levels['level-' + limpio] ? 'level-' + limpio : null;
    if (!id) {
      sala.enviar(jug.ws, { t: 'aviso', txt: `Nivel desconocido: «${arg}». Ejemplos: /tp 14 · /tp level-483` });
      return;
    }
    cambiarDeSala(jug, sala, { destino: id, texto: 'El guardián camina por donde quiere.' }, { sinRetorno: true });
  } else if (cmd === '/give' && arg) {
    const id = arg.trim();
    if (!DATA.objects[id]) {
      sala.enviar(jug.ws, { t: 'aviso', txt: `Objeto desconocido: «${id}»` });
      return;
    }
    if (jug.inv.length >= 6) {
      sala.enviar(jug.ws, { t: 'aviso', txt: 'Tu mochila está llena.' });
      return;
    }
    jug.inv.push(id);
    sala.enviarInv(jug);
    sala.enviar(jug.ws, { t: 'aviso', txt: `Objeto añadido: ${DATA.objects[id].nombre}` });
  } else if (cmd === '/admin-clave' && arg) {
    const nueva = arg.trim();
    if (nueva.length < 3) {
      sala.enviar(jug.ws, { t: 'aviso', txt: 'La clave debe tener al menos 3 caracteres.' });
      return;
    }
    ADMIN_CLAVE = nueva;
    try {
      fs.mkdirSync(path.dirname(ADMIN_CLAVE_FICHERO), { recursive: true });
      fs.writeFileSync(ADMIN_CLAVE_FICHERO, nueva);
      sala.enviar(jug.ws, { t: 'aviso', txt: 'Clave de guardián actualizada y guardada: sobrevive a un reinicio.' });
    } catch (e) {
      sala.enviar(jug.ws, { t: 'aviso', txt: 'Clave actualizada para esta sesión, pero no se pudo guardar en disco.' });
    }
    console.log(`[admin] ${jug.nombre}#${jug.id} cambió la clave de guardián`);
  } else if (cmd === '/reiniciar') {
    // reinicio del PROCESO desde el chat: el guardián avisa a todos, el
    // proceso sale limpio y systemd (Restart=always) lo revive en ~3 s; los
    // clientes reconectan solos. El mundo vivo (salas/posiciones) se pierde
    // —está en memoria—; jugadores, visitas y baneos persisten en mmo.db.
    for (const s of salasVivas())
      s.difundir({ t: 'anuncio', txt: 'El guardián reinicia la realidad. Las Backrooms parpadean: volvéis en unos segundos…' });
    console.log(`[admin] ${jug.nombre}#${jug.id} reinicia el servidor`);
    setTimeout(() => process.exit(0), 1200); // margen para que el anuncio llegue
  } else {
    sala.enviar(jug.ws, { t: 'aviso', txt: 'Comandos: /anuncio <txt> · /kick <nombre> · /mute <nombre> [min] · /ban <nombre> · /tp <nivel> · /give <objeto> · /admin-clave <nueva> · /reiniciar' });
  }
}

// simulación: 20 Hz para todas las salas con gente dentro (v23.8 — a 10 Hz
// las cuantizaciones del tick se notaban en las maniobras; el coste medido
// con 500 bots a 10 Hz era 7.45 ms/tick: hay margen de sobra)
setInterval(() => tickTodas(Date.now()), 50);

// latido: conexiones muertas fuera cada 30 s
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.vivo) { ws.terminate(); continue; }
    ws.vivo = false;
    try { ws.ping(); } catch (e) {}
  }
}, 30000);

servidor.listen(PUERTO, () => {
  console.log(`BACKROOMS MMO en http://localhost:${PUERTO}  (ws en /ws)`);
  console.log(`clave de admin: /admin ${ADMIN_CLAVE}   (cámbiala en caliente con /admin-clave <nueva> una vez dentro, o fija otra con la variable MMO_ADMIN)`);
  console.log(`observatorio del guardián: http://localhost:${PUERTO}/observatorio (misma clave)`);
});
