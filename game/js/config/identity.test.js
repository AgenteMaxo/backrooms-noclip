'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'identity.js'), 'utf8');

function cargar(storage) {
  const window = {
    localStorage: storage,
    crypto: { getRandomValues: (bytes) => { bytes.fill(10); return bytes; } },
  };
  vm.runInNewContext(source, { window, Uint8Array, Array });
  return window.ClientIdentity;
}

test('crea una sola identidad y la reutiliza', () => {
  const values = new Map();
  const identity = cargar({
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  });
  const first = identity.token();
  assert.equal(first.length, 32);
  assert.equal(identity.token(), first);
  assert.equal(values.get('mmo-token'), first);
});

test('devuelve una identidad segura si el almacenamiento falla', () => {
  const identity = cargar({ getItem: () => { throw new Error('bloqueado'); } });
  assert.equal(identity.token(), 'sin-token');
});
