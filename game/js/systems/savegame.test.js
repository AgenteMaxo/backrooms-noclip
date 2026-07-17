'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const SaveGame = require('./savegame');

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function worldFixture() {
  return {
    runSeed: 'seed', level: { id: 'level-0' },
    player: {
      salud: 90, cordura: 80, sed: 70, hambre: 60, agotamiento: 50,
      inv: ['agua'], manos: [null, null], equipo: { cara: null, cuerpo: null, pies: null },
    },
    map: { exits: [{ def: { tipo: 'retorno', destino: 'level-1' } }] },
    journal: [], visited: ['level-0'], prevStack: [], entryCount: { 'level-0': 1 },
    turnTotal: 4, dadosN: 2, pasosNivel: 3, _caminataObjetivo: 10, tutorial: {},
  };
}

test('aísla cada guardado por perfil y permite borrarlo', () => {
  const storage = memoryStorage();
  const world = worldFixture();
  let profile = 'A';
  const saves = SaveGame.create({ world, activeProfile: () => profile, enterLevel() {}, storage });

  saves.save();
  assert.equal(saves.load().runSeed, 'seed');
  profile = 'B';
  assert.equal(saves.load(), null);
  profile = 'A';
  saves.clear();
  assert.equal(saves.load(), null);
});

test('reconstruye una partida antigua con valores compatibles', () => {
  const storage = memoryStorage();
  const world = worldFixture();
  let transition;
  const saves = SaveGame.create({
    world,
    activeProfile: () => 'A',
    storage,
    enterLevel: (...args) => {
      transition = args;
      world.level = { id: args[0] };
      world.map = { exits: [] };
      world._caminataObjetivo = 20;
    },
  });

  saves.continueRun({
    runSeed: 'old', levelId: 'level-2',
    player: { salud: 10, cordura: 20, sed: 30, hambre: 40, inv: [] },
    journal: [], visited: [], prevStack: [], entryCount: { 'level-2': 1 },
    turnTotal: 12, pasosNivel: 10, retorno: 'level-1',
  });

  assert.deepEqual(transition, [
    'level-2', 'Retomas la marcha donde lo dejaste.', { retornoA: 'level-1' },
  ]);
  assert.equal(world.player.agotamiento, 100);
  assert.deepEqual(world.player.manos, [null, null]);
  assert.equal(world._caminataAvisos.lejos1, true);
  assert.equal(world._caminataAvisos.lejos2, false);
});
