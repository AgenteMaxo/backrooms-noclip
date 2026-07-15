'use strict';

// Tests de la Sala compartida (dual navegador/Node). El test de snapshots a
// 10 Hz que vivía aquí (PR #69, revertido) tiene su equivalente del PR #72 en
// server/test-posiciones-carga.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Sala } = require('./sala');

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
