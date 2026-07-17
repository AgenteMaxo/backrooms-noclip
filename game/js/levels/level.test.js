'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function cargarRegistro() {
  const window = {};
  const source = fs.readFileSync(path.join(__dirname, 'level.js'), 'utf8');
  vm.runInNewContext(source, { window, Object, Error });
  return window.Levels;
}

test('enruta únicamente los hooks del nivel activo', () => {
  const levels = cargarRegistro();
  const llamadas = [];
  const world = { level: { id: 'level-0' } };

  levels.registrar('level-0', {
    frame: (recibido, tiempo) => llamadas.push(['frame', recibido, tiempo]),
    turno: (recibido, contexto) => llamadas.push(['turno', recibido, contexto]),
  });

  levels.frame('level-1', world, 10);
  levels.frame(world.level, world, 20);
  levels.turno(world.level, world, { dentroManila: true });

  assert.deepEqual(llamadas, [
    ['frame', world, 20],
    ['turno', world, { dentroManila: true }],
  ]);
});

test('rechaza registros duplicados', () => {
  const levels = cargarRegistro();
  levels.registrar('level-0', {});
  assert.throws(() => levels.registrar('level-0', {}), /ya está registrado/);
});
