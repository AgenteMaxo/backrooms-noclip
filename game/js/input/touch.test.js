'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'touch.js'), 'utf8');
const window = {};
vm.runInNewContext(source, { window, Math });
const calcular = window.TouchControls.calcularVector;

test('centra el joystick sin movimiento', () => {
  const result = calcular({ left: 10, top: 20, width: 100 }, 60, 70);
  assert.deepEqual({ ...result }, { x: 0, y: 0, offsetX: 0, offsetY: 0 });
});

test('limita el joystick al radio conservando la dirección', () => {
  const result = calcular({ left: 0, top: 0, width: 100 }, 150, 50);
  assert.equal(result.x, 1);
  assert.equal(result.y, 0);
  assert.equal(result.offsetX, 50);
  assert.equal(result.offsetY, 0);
});
