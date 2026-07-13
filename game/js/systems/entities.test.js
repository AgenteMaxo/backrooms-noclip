const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../mapgen/mapgen.js');
require('../engine/fov.js');
require('./entities.js');

const T = MapGen.T;

function grid(w = 12, h = 12) {
  return { w, h, t: new Uint8Array(w * h).fill(T.SUELO) };
}

function dmap(g, px, py) {
  const d = new Int32Array(g.w * g.h);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++)
      d[y * g.w + x] = Math.abs(x - px) + Math.abs(y - py);
  return d;
}

function rng({ chance = false } = {}) {
  return {
    chance: () => chance,
    shuffle: (arr) => arr.slice(),
  };
}

function entity(def, x, y) {
  return {
    uid: 1,
    id: def.id,
    def,
    x, y,
    estado: 'latente',
    revelada: true,
    dormida: 0,
    pasoExtra: 0,
    viva: true,
    vida: def.vida ?? 40,
    paralizada: 0,
    huyendo: 0,
    preparando: false,
    yaAviso: false,
    sinVerte: 0,
  };
}

function worldWith(e, player = { x: 6, y: 6, luz: false }) {
  const g = grid();
  let hurtCount = 0;
  const world = {
    player,
    level: { oscuridad: 0 },
    map: { grid: g },
    dmap: dmap(g, player.x, player.y),
    entities: [e],
    turnTotal: 1,
    log: () => {},
    hurt: () => { hurtCount++; },
    sanity: () => {},
    equipado: () => false,
  };
  world.hurtCount = () => hurtCount;
  return world;
}

test('deteccion contacto no cae al radio default de 6 casillas', () => {
  const faceling = entity({
    id: 'faceling',
    nombre: 'Faceling',
    comportamiento: 'errante',
    velocidad: 1,
    dano: 12,
    deteccion: { tipo: 'contacto', radio: 1 },
  }, 2, 2);
  const world = worldWith(faceling, { x: 7, y: 2, luz: false });

  Entities.stepAll(world, rng());

  assert.notEqual(faceling.estado, 'caza');
});

test('una entidad no ataca al jugador escondido si no lo detecta', () => {
  const hound = entity({
    id: 'hound',
    nombre: 'Hound',
    comportamiento: 'errante',
    velocidad: 1,
    dano: 10,
    deteccion: { tipo: 'vista', radio: 6 },
  }, 5, 6);
  const world = worldWith(hound, { x: 6, y: 6, luz: false });
  world.escondido = { x: 6, y: 6, delatado: false };

  Entities.stepAll(world, rng({ chance: false }));

  assert.equal(hound.preparando, false);
  assert.equal(world.hurtCount(), 0);
  assert.deepEqual(world.escondido, { x: 6, y: 6, delatado: false });
});

test('el Cazador entra en caza al despertar', () => {
  const hunter = entity({
    id: 'hunter',
    nombre: 'The Hunter',
    comportamiento: 'cazador',
    velocidad: 2,
    dano: 70,
    deteccion: { tipo: 'global', radio: 99 },
  }, 2, 2);
  hunter.dormida = 1;
  const world = worldWith(hunter, { x: 8, y: 8, luz: false });

  Entities.stepAll(world, rng());

  assert.equal(hunter.dormida, 0);
  assert.equal(hunter.estado, 'caza');
});
