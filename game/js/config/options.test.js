'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'options.js'), 'utf8');

function cargarOptions(saved, tactil = false) {
  const writes = [];
  const localStorage = {
    getItem() { return saved; },
    setItem(key, value) { writes.push([key, value]); },
  };
  const window = {
    localStorage,
    matchMedia: () => ({ matches: tactil }),
  };
  vm.runInNewContext(source, { window, Object, Array, JSON });
  return { api: window.Options, opts: window.OPTS, writes };
}

test('combina opciones guardadas sin perder controles nuevos', () => {
  const { opts } = cargarOptions(JSON.stringify({
    dado: false,
    gamepadMap: { interact: 7 },
  }));

  assert.equal(opts.dado, false);
  assert.equal(opts.gamepadMap.interact, 7);
  assert.equal(opts.gamepadMap.backpack, 1);
});

test('usa valores seguros si el almacenamiento está corrupto', () => {
  const { opts } = cargarOptions('{mal', true);
  assert.equal(opts.dado, true);
  assert.equal(opts.camaraInvertir, true);
  assert.equal(opts.resolucion, 'auto16x9');
});

test('restaura y persiste la configuración del mando', () => {
  const { api, opts, writes } = cargarOptions(JSON.stringify({
    cursorSpeed: 20,
    gamepadMap: { interact: 9 },
  }));

  api.restaurarMando();

  assert.equal(opts.cursorSpeed, 8);
  assert.equal(opts.gamepadMap.interact, 0);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], 'backrooms-opts');
});
