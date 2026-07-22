'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
global.MapGen = { T: {}, walkable: () => true };

const almacen = new Map();
global.localStorage = {
  getItem: (clave) => almacen.has(clave) ? almacen.get(clave) : null,
  setItem: (clave, valor) => almacen.set(clave, String(valor)),
  removeItem: (clave) => almacen.delete(clave),
};

require('./game.js');
const Profiles = global.Game.Profiles;

beforeEach(() => {
  almacen.clear();
  Profiles._descCache = null;
});

test('importar completa un perfil mínimo y permite seguir registrando progreso', () => {
  const nombre = '  Perfil recuperado con nombre largo  ';
  assert.equal(Profiles.importar(JSON.stringify({ nombre, datos: { codice: {} } })), true);
  assert.equal(Profiles.activeName(), nombre.trim().slice(0, 24));

  const perfil = Profiles.get();
  assert.deepEqual(perfil.records, { runs: 0, maxNiveles: 0, maxTurnos: 0, escapes: 0 });
  assert.deepEqual(perfil.historial, []);
  assert.deepEqual(perfil.descubiertos, { salidas: {}, entidades: {}, objetos: {} });

  assert.doesNotThrow(() => Profiles.registrarEntrada('level-0'));
  assert.doesNotThrow(() => Profiles.registrarFin(
    false, [{ nombre: 'Level 0' }], 17, 'semilla-test', 'level-0'
  ));

  const actualizado = Profiles.get();
  assert.equal(actualizado.codice['level-0'].veces, 1);
  assert.equal(actualizado.records.runs, 1);
  assert.equal(actualizado.records.maxNiveles, 1);
  assert.equal(actualizado.records.maxTurnos, 17);
  assert.equal(actualizado.historial.length, 1);
});

test('importar conserva datos válidos y sanea las secciones corruptas', () => {
  const datos = {
    creado: '2026-01-02T03:04:05.000Z',
    codice: {
      'level-0': { veces: 3, mejorTurnos: 44, escapado: true },
      roto: null,
    },
    records: { runs: 2, maxNiveles: 'mal', maxTurnos: 80, escapes: -4 },
    historial: [{ fecha: 'hoy', semilla: 'x' }, null, 'inválido'],
    descubiertos: { salidas: [], entidades: null, objetos: { agua_almendras: true } },
    campoFuturo: 'se conserva',
  };

  assert.equal(Profiles.importar(JSON.stringify({ nombre: 'Errante', datos })), true);
  const perfil = Profiles.get();
  assert.deepEqual(perfil.records, { runs: 2, maxNiveles: 0, maxTurnos: 80, escapes: 0 });
  assert.deepEqual(Object.keys(perfil.codice), ['level-0']);
  assert.deepEqual(perfil.codice['level-0'], { veces: 3, mejorTurnos: 44, escapado: true });
  assert.equal(perfil.historial.length, 1);
  assert.deepEqual(perfil.descubiertos, {
    salidas: {}, entidades: {}, objetos: { agua_almendras: true },
  });
  assert.equal(perfil.campoFuturo, 'se conserva');
});

test('remove() invalida _descCache: el códice del perfil borrado no contamina al activo reasignado', () => {
  // create()/select() ya invalidan el caché por su cuenta, así que para
  // aislar el fix de remove() hay que llegar al perfil superviviente SIN
  // pasar por ninguno de los dos después de borrar (remove() reasigna
  // d.activo internamente cuando el perfil borrado era el activo)
  Profiles.create('A');
  Profiles.registrarDescubierto('objetos', 'agua_almendras');
  assert.equal(Profiles.descubierto('objetos', 'agua_almendras'), true);

  Profiles.create('B'); // limpia el caché; A sigue en perfiles
  Profiles.select('A'); // vuelve a activar A con un caché fresco
  assert.equal(Profiles.descubierto('objetos', 'agua_almendras'), true);

  Profiles.remove('A'); // reasigna d.activo a 'B' sin pasar por create()/select()
  assert.equal(Profiles.activeName(), 'B');
  assert.equal(Profiles.descubierto('objetos', 'agua_almendras'), false);
});

test('importar rechaza JSON irrecuperable sin modificar el perfil activo', () => {
  Profiles.create('Existente');
  for (const json of [
    '{mal json',
    JSON.stringify({ nombre: '   ', datos: {} }),
    JSON.stringify({ nombre: 'Sin datos' }),
    JSON.stringify({ nombre: 'Datos array', datos: [] }),
  ]) assert.equal(Profiles.importar(json), false);

  assert.equal(Profiles.activeName(), 'Existente');
  assert.deepEqual(Profiles.list(), ['Existente']);
});
