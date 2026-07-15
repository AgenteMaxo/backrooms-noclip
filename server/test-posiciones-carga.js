'use strict';

const assert = require('node:assert/strict');
const { Sala, INTERVALO_POS_MS } = require('../game/js/sim/sala');

assert.equal(INTERVALO_POS_MS, 100,
  'la simulación corre a 20 Hz, pero la red debe agrupar posiciones a 10 Hz');

const sala = Object.create(Sala.prototype);
sala.jugadores = new Map([[1, { id: 1, canal: null }]]);
sala.entidades = [];
sala.def = { reglas: [] };
sala._movidosExtra = new Map();
sala._entMovidas = new Map();
const enviados = [];
sala.difundir = (msg) => enviados.push(msg);

const jug = { id: 1, x: 1, y: 0, rot: 0 };
sala._movidosExtra.set(jug.id, jug);
sala.tick(1000);
assert.equal(enviados.length, 1, 'la primera posición se publica sin espera');

jug.x = 2;
sala._movidosExtra.set(jug.id, jug);
sala.tick(1000 + INTERVALO_POS_MS / 2);
assert.equal(enviados.length, 1, 'la simulación intermedia no crea otro paquete');

jug.x = 3;
sala._movidosExtra.set(jug.id, jug);
sala.tick(1000 + INTERVALO_POS_MS);
assert.equal(enviados.length, 2, 'la red publica a 10 Hz');
assert.equal(enviados[1].j.length, 1, 'solo conserva una muestra por jugador');
assert.equal(enviados[1].j[0][1], 3, 'publica la posición más reciente, no una cola vieja');

console.log(`PASS difusión de posiciones cada ${INTERVALO_POS_MS}ms, una muestra por jugador`);
