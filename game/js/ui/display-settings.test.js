'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'display-settings.js'), 'utf8');
const window = {};
vm.runInNewContext(source, { window, Object, Number, Math });
const calcular = window.DisplaySettings.calcularTamano;

test('encaja una resolución automática manteniendo 16:9', () => {
  const result = calcular({
    resolucion: 'auto16x9', fullscreen: false,
    viewportWidth: 1366, viewportHeight: 768, tactil: false,
  });
  assert.deepEqual({ ...result }, {
    layoutWidth: 1322,
    layoutHeight: 744,
    renderWidth: 1322,
    renderHeight: 744,
  });
});

test('separa tamaño visual y resolución interna manual', () => {
  const result = calcular({
    resolucion: '1920x1080', fullscreen: true,
    viewportWidth: 1280, viewportHeight: 800, tactil: false,
  });
  assert.deepEqual({ ...result }, {
    layoutWidth: 1280,
    layoutHeight: 720,
    renderWidth: 1920,
    renderHeight: 1080,
  });
});

test('normaliza configuraciones antiguas o inválidas', () => {
  const antigua = calcular({
    resolucion: 'auto', fullscreen: true,
    viewportWidth: 960, viewportHeight: 600, tactil: false,
  });
  const invalida = calcular({
    resolucion: 'rota', fullscreen: true,
    viewportWidth: 960, viewportHeight: 600, tactil: false,
  });
  assert.deepEqual({ ...antigua }, { ...invalida });
});
