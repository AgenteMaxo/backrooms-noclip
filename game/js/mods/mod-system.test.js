'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load() {
  const window = { dispatchEvent() {}, addEventListener() {} };
  const context = { window, console, TextEncoder, TextDecoder, atob, btoa, CustomEvent: function () {}, indexedDB: undefined };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(__dirname + '/mod-system.js', 'utf8'), context);
  return window.ModSystem;
}

test('acepta un BRMOD declarativo mínimo', () => {
  const mods = load();
  const pkg = {
    brmodVersion: 1,
    manifest: { formatVersion: 1, id: 'test.caja', name: 'Caja', content: [{ id: 'caja', type: 'prop', model: 'models/caja.bbmodel', scale: 0.0625 }] },
    files: { 'models/caja.bbmodel': { encoding: 'json', data: { elements: [] } } },
  };
  const record = mods.normalizePackage(pkg, 'caja.brmod');
  assert.equal(record.id, 'test.caja');
  assert.equal(record.files['models/caja.bbmodel'].kind, 'text');
});

test('rechaza scripts y rutas ascendentes', () => {
  const mods = load();
  const pkg = {
    brmodVersion: 1,
    manifest: { formatVersion: 1, id: 'test.bad', name: 'Bad', content: [{ id: 'bad', type: 'prop', model: '../evil.js' }] },
    files: { '../evil.js': { encoding: 'utf8', data: 'alert(1)' } },
  };
  assert.throws(() => mods.normalizePackage(pkg), /Ruta de mod no permitida/);
});

test('tipos ejecutables quedan limitados al alpha visual', () => {
  const mods = load();
  assert.equal(mods.isRuntimeType('prop'), true);
  assert.equal(mods.isRuntimeType('entity'), false);
  assert.equal(mods.isRuntimeType('item'), false);
});
