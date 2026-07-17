'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { crear } = require('./cargador');

function entorno(fallos = {}) {
  const insertados = [];
  const restantes = { ...fallos };
  const document = {
    currentScript: { src: 'https://juego.test/js/engine/cargador.js?v=293' },
    createElement: () => ({
      async: true,
      remove() { this.eliminado = true; },
    }),
    head: {
      appendChild(elemento) {
        insertados.push(elemento);
        queueMicrotask(() => {
          const ruta = elemento.src.replace('https://juego.test/', '').replace('?v=293', '');
          if ((restantes[ruta] || 0) > 0) {
            restantes[ruta]--;
            elemento.onerror();
          } else elemento.onload();
        });
      },
    },
  };
  return { cargador: crear(document), insertados };
}

test('inyecta una ruta una sola vez, conserva versión y desactiva async', async () => {
  const { cargador, insertados } = entorno();
  await Promise.all([
    cargador.scripts(['js/a.js']),
    cargador.scripts(['js/a.js']),
  ]);

  assert.equal(insertados.length, 1);
  assert.equal(insertados[0].src, 'js/a.js?v=293');
  assert.equal(insertados[0].async, false);
});

test('descarta el lote incompleto y permite reintentarlo entero', async () => {
  const { cargador, insertados } = entorno({ 'js/b.js': 1 });
  const rutas = ['js/a.js', 'js/b.js'];

  await assert.rejects(cargador.scripts(rutas), /No se pudo cargar js\/b\.js/);
  assert.equal(insertados.length, 2);
  assert.ok(insertados.every((elemento) => elemento.eliminado));

  assert.deepEqual(await cargador.scripts(rutas), rutas);
  assert.equal(insertados.length, 4);
});
