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
const { asignar, tickTodas, estado } = require('./sala');
const { DATA } = require('./sim/mundo');
const db = require('./db');

// clave de administración: variable de entorno MMO_ADMIN o una aleatoria
// impresa al arrancar (el streamer la escribe en el chat: /admin <clave>)
const ADMIN_CLAVE = process.env.MMO_ADMIN ||
  Math.random().toString(36).slice(2, 10);

const PUERTO = parseInt(process.argv[2], 10) || 8080;
const RAIZ = path.join(__dirname, '..', 'game');
const NIVEL_INICIAL = 'level-0';

// ---------- estáticos (sin dependencias: mimetipos a mano) ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

const servidor = http.createServer((req, res) => {
  if (req.url === '/estado') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(estado()));
    return;
  }
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  // normaliza y encierra dentro de game/ (nada de ../)
  const ruta = path.normalize(path.join(RAIZ, url === '/' ? 'index.html' : url));
  if (!ruta.startsWith(RAIZ)) { res.writeHead(403); res.end(); return; }
  fs.readFile(ruta, (err, datos) => {
    if (err) { res.writeHead(404); res.end('no existe'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(ruta).toLowerCase()] || 'application/octet-stream' });
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
      // puerta de desarrollo (?nivel=): SOLO con MMO_DEV=1 — en producción
      // todo el mundo despierta en Level 0, como manda el lore
      const devOk = process.env.MMO_DEV === '1';
      const nivel = devOk && m.nivel && DATA.levels[m.nivel] ? m.nivel : NIVEL_INICIAL;
      sala = asignar(nivel);
      prepararSala(sala);
      jug = sala.entrar(ws, nombre, m.token, expediente);
      jug._reSala = (s) => { sala = s; };  // el cruce actualiza la sala del socket
      db.registrarVisita(m.token, nivel);
      console.log(`[+] ${jug.nombre}#${jug.id} → ${sala.clave} (${sala.jugadores.size})`);
      return;
    }
    if (!jug) return; // todo lo demás exige estar dentro
    if (m.t === 'input') sala.input(jug, m.dx, m.dy);
    else if (m.t === 'rot') sala.girar(jug, m.th);
    else if (m.t === 'accion') sala.accion(jug);
    else if (m.t === 'cruzar') sala.cruzar(jug, m.si);
    else if (m.t === 'usar') sala.usar(jug, m.mano);
    else if (m.t === 'luz') sala.luz(jug, m.si);
    else if (m.t === 'mochila') sala.mochila(jug, m);
    else if (m.t === 'chat') {
      if (m.txt.startsWith('/')) { comando(jug, sala, m.txt); return; }
      const txt = filtro.chatLimpio(m.txt);
      if (txt) sala.chat(jug, txt);
    } else if (m.t === 'ping') sala.enviar(ws, { t: 'pong' });
  });

  ws.on('close', () => {
    porIp.set(ip, (porIp.get(ip) || 1) - 1);
    if (porIp.get(ip) <= 0) porIp.delete(ip);
    if (jug && sala) {
      sala.salir(jug);
      console.log(`[-] ${jug.nombre}#${jug.id} ← ${sala.clave} (${sala.jugadores.size})`);
    }
  });
  ws.on('error', () => {});
});

function prepararSala(sala) {
  sala.alCruzar = cambiarDeSala;
  sala.alMorir = (jug, salaVieja, causa) => cambiarDeSala(jug, salaVieja, {
    destino: 'level-0',
    texto: `Moriste (${causa}). Despiertas otra vez sobre la moqueta húmeda, con las manos vacías.`,
  });
}

// cruce de salas: sacar de la sala vieja, meter en la del nivel destino y
// mandar el estado nuevo (el cliente reconstruye el mapa desde la semilla)
function cambiarDeSala(jug, salaVieja, defSalida, opts) {
  salaVieja.salir(jug);
  const nueva = asignar(defSalida.destino);
  prepararSala(nueva);
  const [x, y] = nueva.buscarSpawn();
  jug.x = x; jug.y = y;
  jug.ofertaEn = null; jug.canal = null; jug.escondido = null;
  nueva.prepararCaminata(jug);
  const id = jug.id;
  nueva.jugadores.set(id, jug);
  nueva.enviar(jug.ws, {
    t: 'nivel', nivel: nueva.nivelId, inst: nueva.inst, semilla: nueva.semilla,
    x, y, rot: jug.rot, via: defSalida.texto,
    sinTarjeta: !!(opts && opts.sinTarjeta),
    salud: jug.salud, inv: jug.inv, manos: jug.manos,
    caminata: jug.caminataObjetivo ? { pasos: 0, objetivo: jug.caminataObjetivo } : null,
    jugadores: nueva.censo(), ...nueva.estadoDinamico(),
  });
  nueva.difundir({ t: 'entra', id, nombre: jug.nombre, x, y, rot: jug.rot }, id);
  if (jug._reSala) jug._reSala(nueva);
  db.registrarVisita(jug.token, nueva.nivelId);
  if (nueva.def.esEscape) db.sumarEscape(jug.token);
  console.log(`[→] ${jug.nombre}#${id} cruza a ${nueva.clave}`);
}

// ---------- comandos de chat (moderación del streamer) ----------
const { todas: salasVivas } = require('./sala');

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
    if (arg === ADMIN_CLAVE) {
      jug.esAdmin = true;
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
    cambiarDeSala(jug, sala, { destino: id, texto: 'El guardián camina por donde quiere.' });
  } else {
    sala.enviar(jug.ws, { t: 'aviso', txt: 'Comandos: /anuncio <txt> · /kick <nombre> · /mute <nombre> [min] · /ban <nombre> · /tp <nivel>' });
  }
}

// simulación: 10 Hz para todas las salas con gente dentro
setInterval(() => tickTodas(Date.now()), 100);

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
  console.log(`clave de admin: /admin ${ADMIN_CLAVE}   (fija otra con la variable MMO_ADMIN)`);
});
