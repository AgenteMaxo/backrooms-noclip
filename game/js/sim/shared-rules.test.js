'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Rules = require('./shared-rules');

test('clasifica salidas irreversibles desde una sola regla', () => {
  assert.equal(Rules.esSinRetorno({ tipo: 'void' }), true);
  assert.equal(Rules.esSinRetorno({ texto: 'Caer por una trampilla' }), true);
  assert.equal(Rules.esSinRetorno({ texto: 'Abrir una puerta' }), false);
});

test('resuelve destinos especiales sin modificar la salida', () => {
  const exit = { destino: '*opciones:level-1,level-2' };
  const destination = Rules.resolverDestino(exit, { pick: (values) => values[1] });
  assert.equal(destination, 'level-2');
  assert.equal(exit.destino, '*opciones:level-1,level-2');
});

test('resuelve el riesgo del Vacío en el mismo umbral d20', () => {
  const exit = { tipo: 'arriesgada', riesgoVoid: 0.1 };
  assert.deepEqual(Rules.resolverRiesgoVoid(exit, 2), { applies: true, threshold: 2, success: false });
  assert.deepEqual(Rules.resolverRiesgoVoid(exit, 3), { applies: true, threshold: 2, success: true });
});

test('planifica equipar y guardar objetos de dos manos', () => {
  const equipped = Rules.equiparManos([null, null], 'fuego', 2);
  assert.deepEqual(equipped.hands, ['fuego', '=']);
  const stored = Rules.guardarMano(equipped.hands, 1, 0);
  assert.equal(stored.itemId, 'fuego');
  assert.deepEqual(stored.hands, [null, null]);
});
