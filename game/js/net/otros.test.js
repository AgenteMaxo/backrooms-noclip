'use strict';

const assert = require('node:assert/strict');

let ahora = 0;
global.performance = { now: () => ahora };
global.window = {};
global.Game = { world: { otros: [], player: { rx: 0, ry: 0 } } };
window.Game = global.Game;
global.Apariencia = require('../apariencia.js');

require('./otros.js');
const Otros = window.Otros;

Otros.reset(999);
Otros.entra({ id: 1, nombre: 'Objetivo', x: 0, y: 0, rot: 0 });
const objetivo = Otros.lista[0];

// Tras una pausa larga, la primera muestra nueva no debe convertirse en un
// teleport visual. Con el interpolador anterior rx saltaba directamente a 1.
ahora = 1000;
Otros.pos(1, 1, 0, 0);
Otros.muestrear(objetivo, ahora);
assert.equal(objetivo.rx, 0, 'mantiene la posición durante el retardo tras una pausa');

ahora = 1150;
Otros.muestrear(objetivo, ahora);
assert.ok(objetivo.rx > 0 && objetivo.rx < 1,
  `reanuda suavemente sin salto completo (rx=${objetivo.rx})`);

ahora = 1200;
Otros.muestrear(objetivo, ahora);
assert.equal(objetivo.rx, 1, 'alcanza la primera muestra al terminar la interpolación');

// Una secuencia continua conserva la interpolación ordinaria.
ahora = 1100;
Otros.pos(1, 2, 0, 0);
Otros.muestrear(objetivo, 1250); // tiempo visual 1050: mitad entre ambas muestras
assert.equal(objetivo.rx, 1.5, 'interpola linealmente entre muestras continuas');

// Caso real de observación concurrida: 60 jugadores reanudan el movimiento en
// el mismo lote. Ninguno debe saltar a la posición nueva al recibirlo.
ahora = 0;
Otros.reset(999);
for (let id = 1; id <= 60; id++)
  Otros.entra({ id, nombre: `Errante ${id}`, x: id, y: 0, rot: 0 });
ahora = 1000;
for (let id = 1; id <= 60; id++) Otros.pos(id, id + 1, 0, 0);
Otros.frame(ahora);
assert.ok(Otros.lista.every((o) => o.rx === o.id),
  '60 jugadores conservan su posición visual al llegar el primer lote tras una pausa');
ahora = 1150;
Otros.frame(ahora);
assert.ok(Otros.lista.every((o) => o.rx > o.id && o.rx < o.id + 1),
  'los 60 jugadores reanudan el movimiento de forma gradual');

console.log('PASS movimiento remoto suave al reanudar tras una pausa');
