'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'state.js'), 'utf8');
const window = {};
vm.runInNewContext(source, { window, Object, Number, Math, TypeError });
const input = window.InputState;

test('combina fuentes sin que una sobrescriba a las demás', () => {
  input.set('touch', 0.25, -0.5);
  input.set('gamepad', 0.5, 0.25);
  assert.equal(input.x, 0.75);
  assert.equal(input.y, -0.25);
});

test('actualiza y reinicia cada fuente de forma independiente', () => {
  input.resetAll();
  input.set('touch', 0.5, 0.5);
  input.set('gamepad', -0.25, 0);
  input.set('touch', 0, -1);
  assert.equal(input.x, -0.25);
  assert.equal(input.y, -1);
  input.reset('touch');
  assert.equal(input.x, -0.25);
  assert.equal(input.y, 0);
});

test('normaliza valores fuera de rango o inválidos', () => {
  input.resetAll();
  input.set('touch', 8, Number.NaN);
  assert.equal(input.x, 1);
  assert.equal(input.y, 0);
});
