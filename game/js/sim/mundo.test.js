'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'mundo.js'), 'utf8');

function cargar() {
  let generatedDef = null;
  const level = { id: 'level-0', salidas: [{ destino: 'level-1', prob: 0.2 }] };
  const window = {
    GAME_DATA: { levels: { 'level-0': level } },
    RNG: { create: (seed) => ({ seed }) },
    MapGen: {
      generate: (def) => { generatedDef = def; return { grid: { w: 2, h: 2, t: [0, 1, 0, 0] } }; },
      at: (grid, x, y) => grid.t[y * grid.w + x],
      walkable: (tile) => tile === 0,
    },
    FOV: {},
  };
  vm.runInNewContext(source, { window, globalThis: window });
  return { api: window.MundoSim, level, generated: () => generatedDef };
}

test('el mapa online elimina prob sin modificar la ficha original', () => {
  const context = cargar();
  const result = context.api.generarMapa('level-0', 'semilla');
  assert.equal(result.def, context.level);
  assert.equal(context.level.salidas[0].prob, 0.2);
  assert.equal('prob' in context.generated().salidas[0], false);
});

test('comparte la comprobación de casillas transitables', () => {
  const { api } = cargar();
  const { map } = api.generarMapa('level-0', 'semilla');
  assert.equal(api.esTransitable(map, 0, 0), true);
  assert.equal(api.esTransitable(map, 1, 0), false);
  assert.equal(api.esTransitable(map, -1, 0), false);
});
