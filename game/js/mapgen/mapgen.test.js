const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../data.js');
require('../engine/rng.js');
require('./mapgen.js');

function countTiles(g) {
  const counts = { walkable: 0, vacio: 0 };
  for (const tile of g.t) {
    if (MapGen.walkable(tile)) counts.walkable++;
    if (tile === MapGen.T.VACIO) counts.vacio++;
  }
  return counts;
}

test('invernadero con altura no divisible por 3 no cae al fallback de pasillos', () => {
  const def = {
    id: 'audit-invernadero',
    bioma: 'invernadero',
    tam: [84, 56],
    salidas: [],
    objetos: [],
    entidades: [],
  };

  const map = MapGen.generate(def, RNG.create('pre-fix-4'));
  const counts = countTiles(map.grid);

  assert.ok(counts.walkable >= 60, 'el mapa debe tener suelo suficiente para jugar');
  assert.ok(counts.vacio > 0, 'el invernadero debe conservar vacio; el fallback de pasillos no tiene vacio');
});

test('Level 6 conserva dos salidas físicas y la salida por caminata', () => {
  const def = GAME_DATA.levels['level-6'];

  for (let i = 0; i < 100; i++) {
    const seed = `regresion-level-6::${i}`;
    const map = MapGen.generate(def, RNG.create(seed));
    const destinosFisicos = map.exits.map((e) => e.def.destino).sort();

    assert.deepEqual(destinosFisicos, ['level-6-1', 'level-8'], `${seed}: salidas físicas`);
    assert.deepEqual(map.caminatas.map((s) => s.destino), ['level-7'], `${seed}: salida por caminata`);
    for (const salida of [...map.exits.map((e) => e.def), ...map.caminatas]) {
      assert.ok(GAME_DATA.levels[salida.destino], `${seed}: existe ${salida.destino}`);
    }
  }
});

test('Level 0 genera sus botellas y taquillas adicionales en sitios validos', () => {
  const def = {
    id: 'level-0',
    bioma: 'pasillos',
    tam: [150, 150],
    infinito: true,
    salidas: [],
    objetos: [{ id: 'agua_almendras', n: [3, 4] }],
    contenedores: [10, 14],
    entidades: [],
  };

  for (let i = 0; i < 50; i++) {
    const map = MapGen.generate(def, RNG.create(`level-0-recursos-${i}`));
    const botellas = map.items.filter((item) => item.id === 'agua_almendras');
    const taquillas = map.props.filter((prop) => prop.id === 'taquilla');
    const posiciones = new Set();

    assert.ok(botellas.length >= 3 && botellas.length <= 4);
    assert.ok(taquillas.length >= 10 && taquillas.length <= 14);

    for (const recurso of [...botellas, ...taquillas]) {
      assert.ok(MapGen.walkable(MapGen.at(map.grid, recurso.x, recurso.y)));
      const clave = `${recurso.x},${recurso.y}`;
      assert.ok(!posiciones.has(clave), `recurso solapado en ${clave}`);
      posiciones.add(clave);
    }
    for (const taquilla of taquillas)
      assert.equal(MapGen.at(map.grid, taquilla.x, taquilla.y - 1), MapGen.T.PARED);
  }
});
