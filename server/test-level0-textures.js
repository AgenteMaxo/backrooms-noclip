'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const expected = [
  'assets/levels/level-0/textures/pared.png',
  'assets/levels/level-0/textures/suelo-1.png',
  'assets/levels/level-0/textures/suelo-2.png',
  'assets/levels/level-0/textures/suelo-3.png',
];

function pngSize(file) {
  const data = fs.readFileSync(file);
  assert.strictEqual(data.subarray(1, 4).toString('ascii'), 'PNG', `${file} debe ser PNG`);
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

async function run() {
  for (const relative of expected) {
    const file = path.join(root, 'game', relative);
    assert.ok(fs.existsSync(file), `falta ${relative}`);
    assert.deepStrictEqual(pngSize(file), [48, 48], `${relative} debe medir 48x48`);
  }

  const requested = [];
  class MockImage {
    set src(value) {
      requested.push(value);
      this.naturalWidth = 48;
      setImmediate(() => this.onload());
    }
  }
  const window = {};
  const context = { window, Image: MockImage, Promise };
  const manifest = fs.readFileSync(path.join(root, 'game/js/assets-manifest.js'), 'utf8');
  const tiles = fs.readFileSync(path.join(root, 'game/js/engine/tiles.js'), 'utf8');
  vm.runInNewContext(manifest, context);
  vm.runInNewContext(tiles, context);

  await window.Tiles.cargarTexturasNivel('level-1');
  assert.deepStrictEqual(requested, [], 'otros niveles no cargan texturas de Level 0');

  const primera = window.Tiles.cargarTexturasNivel('level-0');
  const segunda = window.Tiles.cargarTexturasNivel('level-0');
  assert.strictEqual(primera, segunda, 'las llamadas simultaneas comparten la misma carga');
  const cargadas = await primera;

  assert.deepStrictEqual(requested, expected, 'solo se piden los cuatro recursos declarados');
  assert.ok(cargadas.pared, 'la pared queda disponible');
  assert.strictEqual(cargadas.suelos.length, 3, 'hay tres variantes de suelo');

  console.log('PASS texturas exclusivas de Level 0: 4 PNG, 48x48 y una sola carga');
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
