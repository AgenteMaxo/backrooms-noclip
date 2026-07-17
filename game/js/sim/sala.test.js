'use strict';

// Tests de la Sala compartida (dual navegador/Node). El test de snapshots a
// 10 Hz que vivía aquí (PR #69, revertido) tiene su equivalente del PR #72 en
// server/test-posiciones-carga.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  Sala,
  CAP_SALA,
  crearControlApagon,
  APAGON_ESPERA_MIN_MS,
  APAGON_PREAVISO_MS,
  APAGON_OSCURO_MS,
  APAGON_RECUPERA_MS,
} = require('./sala');

function socketFake() {
  const mensajes = [];
  return {
    readyState: 1,
    mensajes,
    send(raw) { mensajes.push(JSON.parse(raw)); },
  };
}

test('el aire contaminado de Level 11 desgasta despacio y la máscara lo bloquea', () => {
  const sala = new Sala('level-11', 1, 'prueba-aire', 'test');
  const ws = socketFake();
  const jug = sala.entrar(ws, 'Errante', 'token-aire', {});
  ws.mensajes.length = 0;

  for (let i = 0; i < 11; i++) sala.supervivencia(jug, 4);
  assert.equal(jug.salud, 100, '44 tiles aún no causan daño');

  sala.supervivencia(jug, 4);
  assert.equal(jug.salud, 99, '48 tiles sin filtrar causan solo 1 punto de daño');
  assert.equal(ws.mensajes.some((m) => m.t === 'aviso' && /smog/i.test(m.txt)), true);

  jug.equipo.cara = 'mascara_gas';
  for (let i = 0; i < 12; i++) sala.supervivencia(jug, 4);
  assert.equal(jug.salud, 99, 'la máscara bloquea toda la exposición posterior');
});

test('la simulación es la fuente de verdad del aforo', () => {
  assert.equal(CAP_SALA, 60);
});

test('la Sala Manila usa un mensaje distinto del apagón global de Level 1', () => {
  const sala = new Sala('level-0', 1, 'prueba-apagon-manila', 'test');
  const ws = socketFake();
  const jug = sala.entrar(ws, 'Testigo', 'token-manila', {});
  const rect = sala.map.manila || { x: jug.x - 2, y: jug.y - 2, w: 4, h: 4 };
  sala.map.manila = rect;
  jug.x = rect.x + rect.w / 2;
  jug.y = rect.y + rect.h / 2;
  sala._apagonEn = 0;
  sala.rng.int = () => 0;
  ws.mensajes.length = 0;

  sala.apagonManila(10_000);

  const mensaje = ws.mensajes.find((item) => item.t === 'apagonManila');
  assert.ok(mensaje, 'los clientes reciben apagonManila');
  assert.equal(Number.isFinite(mensaje.ms), true);
  assert.equal(ws.mensajes.some((item) => item.t === 'apagon'), false,
    'no se confunde con las fases del apagón global');
});

test('usar un objeto con sed cero no causa una muerte instantánea', () => {
  const sala = new Sala('level-0', 1, 'prueba-sed', 'test');
  const ws = socketFake();
  const jug = sala.entrar(ws, 'Errante', 'token-sed', {});
  jug.salud = 40;
  jug.sed = 0;
  jug.cordura = 50;

  sala.aplicarNumericos(jug, {
    nombre: 'Botiquín de prueba',
    efecto: { salud: 40 },
  });

  assert.equal(jug.muerto, false);
  assert.equal(jug.salud, 80);
  assert.equal(jug.sed, 0, 'el objeto no recupera sed');

  sala.supervivencia(jug, 4);
  assert.equal(jug.salud, 79, 'la sed cero mantiene el daño gradual al moverse');
});

test('la sed baja con cadencias enteras más lentas', () => {
  const normal = new Sala('level-0', 1, 'prueba-sed-normal', 'test');
  const jugNormal = normal.entrar(socketFake(), 'Errante', 'token-sed-normal', {});
  normal.supervivencia(jugNormal, 44);
  assert.equal(jugNormal.sed, 96, 'la sed normal baja 1 punto cada 11 tiles');

  const calor = new Sala('level-2', 1, 'prueba-sed-calor', 'test');
  const jugCalor = calor.entrar(socketFake(), 'Errante', 'token-sed-calor', {});
  calor.supervivencia(jugCalor, 20);
  assert.equal(jugCalor.sed, 96, 'con calor baja 1 punto cada 5 tiles');
});

test('el apagón global de Level 1 respeta espera, oscuridad y recuperación', () => {
  const control = crearControlApagon({ int: (a) => a });
  const mensajesA = [];
  const mensajesB = [];
  const emitir = (m) => {
    mensajesA.push(m);
    mensajesB.push({ ...m });
  };
  const t0 = 10_000;

  control.tick(t0, true, emitir);
  control.tick(t0 + APAGON_ESPERA_MIN_MS - 1, true, emitir);
  assert.equal(mensajesA.length, 0, 'no se repite antes de 30 segundos');

  control.tick(t0 + APAGON_ESPERA_MIN_MS, true, emitir);
  assert.equal(mensajesA[0].fase, 'pre');
  assert.equal(mensajesA[0].duracion, APAGON_PREAVISO_MS);

  let ahora = t0 + APAGON_ESPERA_MIN_MS + APAGON_PREAVISO_MS;
  control.tick(ahora, true, emitir);
  assert.equal(mensajesA[1].fase, 'oscuro');
  assert.equal(mensajesA[1].duracion, APAGON_OSCURO_MS);

  const snap = control.snapshot(ahora + 2000);
  assert.equal(snap.fase, 'oscuro');
  assert.equal(snap.restante, APAGON_OSCURO_MS - 2000,
    'quien entra tarde recibe solo el tiempo restante');

  ahora += APAGON_OSCURO_MS;
  control.tick(ahora, true, emitir);
  assert.equal(mensajesA[2].fase, 'vuelve');
  assert.equal(mensajesA[2].duracion, APAGON_RECUPERA_MS);
  assert.deepEqual(mensajesB, mensajesA, 'todos reciben las mismas fases');

  control.tick(ahora + APAGON_RECUPERA_MS, true, emitir);
  assert.equal(control.snapshot(ahora + APAGON_RECUPERA_MS), null);
});

test('el guardián fuerza el apagón de Level 1 con la duración de oscuridad elegida', () => {
  const control = crearControlApagon({ int: (a) => a });
  const mensajes = [];
  const emitir = (m) => mensajes.push(m);
  const t0 = 10_000;

  // arranca AHORA, sin esperar los 30-60 s naturales
  control.forzar(t0, 8000, emitir);
  assert.equal(mensajes[0].fase, 'pre');

  control.tick(t0 + APAGON_PREAVISO_MS, true, emitir);
  assert.equal(mensajes[1].fase, 'oscuro');
  assert.equal(mensajes[1].duracion, 8000, 'la oscuridad dura lo que pidió el guardián');

  // tras el apagón forzado, el ciclo vuelve a la normalidad (idle)
  control.tick(t0 + APAGON_PREAVISO_MS + 8000, true, emitir);
  assert.equal(mensajes[2].fase, 'vuelve');
});

test('el guardián fuerza el apagón de la Sala Manila sin temporizador ni testigos', () => {
  const sala = new Sala('level-0', 1, 'prueba-apagon-forzado', 'test');
  const ws = socketFake();
  const jug = sala.entrar(ws, 'Testigo', 'token-forzado', {});
  sala.map.manila ||= { x: jug.x - 2, y: jug.y - 2, w: 4, h: 4 };
  ws.mensajes.length = 0;

  // duración fuera de rango → recortada a [500, 30000]
  const n = sala.apagonManilaForzado(999999);
  assert.equal(n, 1, 'llega a todos los jugadores de la instancia');
  const msg = ws.mensajes.find((m) => m.t === 'apagonManila');
  assert.ok(msg, 'se difunde apagonManila aunque nadie esté dentro de la sala');
  assert.equal(msg.ms, 30000, 'la duración se recorta al techo de 30 s');
});
