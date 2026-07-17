'use strict';

// Tests de la Sala compartida (dual navegador/Node). El test de snapshots a
// 10 Hz que vivía aquí (PR #69, revertido) tiene su equivalente del PR #72 en
// server/test-posiciones-carga.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  Sala,
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
