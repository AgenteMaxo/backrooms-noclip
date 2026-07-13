// Auditoría reproducible y exploratoria de Level 0.
// Uso: node pipeline/level0-audit.js [N] [--random] [--seed=texto]

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

global.window = global;
require('../game/js/engine/rng.js');
require('../game/js/mapgen/mapgen.js');

const levels = require('../data/game/levels.es.json');
const level = levels['level-0'];
const args = process.argv.slice(2);
const nArg = args.find((arg) => /^\d+$/.test(arg));
const N = Math.max(10, parseInt(nArg, 10) || 100);
const randomMode = args.includes('--random');
const explicitSeed = args.find((arg) => arg.startsWith('--seed='))?.slice(7);
const sampleSeed = explicitSeed || (randomMode ? crypto.randomBytes(12).toString('hex') : 'regresion');
const mecanicasSinCasilla = new Set(['caminata', 'manila']);
const salidaManila = level.salidas.find((salida) => MapGen.mecanicaDe(salida) === 'manila');
const apariciones = Object.fromEntries(
  level.salidas
    .filter((salida) => !mecanicasSinCasilla.has(MapGen.mecanicaDe(salida)) && salida.tipo !== 'void')
    .map((salida) => [salida.destino, 0])
);
let aparicionesManila = 0;
const objetivos = [];
const distancias = [];
const [minObjetivo, maxObjetivo] = level.pasosCaminata || [800, 1200];

function signature(map) {
  return JSON.stringify({
    spawn: map.spawn,
    exits: map.exits.map((e) => [e.x, e.y, e.def.destino]).sort(),
    walk: map.caminatas.map((e) => e.destino),
    manila: map.manila ? [map.manila.x, map.manila.y, map.manila.w, map.manila.h] : null,
    manilaSalida: map.manilaSalida?.destino || null,
  });
}

for (let i = 0; i < N; i++) {
  // Un prefijo aleatorio crea una muestra nueva; --seed permite repetirla entera.
  const seed = `auditoria-level0-${sampleSeed}-${String(i).padStart(4, '0')}`;
  const levelSeed = `${seed}::level-0::1`;
  const map = MapGen.generate(level, RNG.create(levelSeed));
  const again = MapGen.generate(level, RNG.create(levelSeed));
  // La partida pasa runSeed a walkingGoal, no levelSeed: la auditoría debe hacer lo mismo.
  const objetivo = MapGen.walkingGoal(level, seed, 1, 0);

  assert.equal(map.grid.w, 150, 'la ventana debe medir 150 de ancho');
  assert.equal(map.grid.h, 150, 'la ventana debe medir 150 de alto');
  assert.equal(map.entitySpawns.length, 0, 'Level 0 no debe generar entidades');
  assert.equal(map.caminatas.length, 1, 'la salida caminando debe existir siempre');
  assert.ok(objetivo >= minObjetivo && objetivo <= maxObjetivo, 'objetivo fuera del rango configurado');
  assert.equal(signature(map), signature(again), 'la misma semilla debe generar lo mismo');
  if (salidaManila) {
    assert.equal(map.manilaSalida?.destino, salidaManila.destino,
      'la Sala Manila debe conservar su salida aunque no aparezca en esta semilla');
    if (map.manila) {
      aparicionesManila++;
      const r = map.manila;
      assert.ok(r.w > 0 && r.h > 0 && r.x >= 0 && r.y >= 0 &&
        r.x + r.w <= map.grid.w && r.y + r.h <= map.grid.h,
      'la Sala Manila debe ser un rectángulo válido dentro del mapa');
    }
  }

  const dist = MapGen.bfsDist(map.grid, map.spawn[0], map.spawn[1]);
  for (const ex of map.exits) {
    const d = dist[ex.y * map.grid.w + ex.x];
    assert.ok(d >= 0, `salida inaccesible hacia ${ex.def.destino}`);
    distancias.push(d);
    apariciones[ex.def.destino] = (apariciones[ex.def.destino] || 0) + 1;
  }
  objetivos.push(objetivo);
}

assert.ok(new Set(objetivos).size > N * 0.5, 'los objetivos apenas varían entre semillas');
// Solo la muestra fija actúa como regresión de distribución. Una muestra aleatoria
// pequeña puede caer legítimamente fuera del 5 % y no debe producir un falso fallo.
if (!randomMode && !explicitSeed) {
  for (const [destino, n] of Object.entries(apariciones)) {
    const salida = level.salidas.find((s) => s.destino === destino);
    const p = salida?.prob ?? 1;
    // Límite inferior de dos desviaciones binomiales: detecta una salida rota
    // sin exigir el mismo mínimo a probabilidades tan distintas como 8 % y 45 %.
    const esperado = N * p;
    const sigma = Math.sqrt(N * p * (1 - p));
    const minCount = Math.max(1, Math.floor(esperado - 2 * sigma));
    assert.ok(n >= minCount, `la salida ${destino} aparece demasiado poco (${n}/${N})`);
  }
  if (salidaManila)
    assert.ok(aparicionesManila > 0, `la Sala Manila no aparece en ninguna semilla (0/${N})`);
}

const media = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
console.log(`Level 0: ${N} semillas ${randomMode || explicitSeed ? 'muestreadas' : 'fijas verificadas'}`);
console.log(`Muestra: ${sampleSeed}`);
if (randomMode && !explicitSeed)
  console.log(`Repetir: node ${path.basename(process.cwd()).toLowerCase() === 'pipeline' ? '' : 'pipeline/'}level0-audit.js ${N} --seed=${sampleSeed}`);
console.log('Ventana: 150×150 · entidades: 0');
console.log(`Objetivo de caminata: ${Math.min(...objetivos)}–${Math.max(...objetivos)} (media ${media(objetivos).toFixed(1)})`);
console.log(`Distancia de salidas físicas: media ${media(distancias).toFixed(1)} casillas`);
if (salidaManila)
  console.log(`Sala Manila: ${aparicionesManila}/${N} semillas (${(aparicionesManila / N * 100).toFixed(1)}%)`);
for (const [destino, n] of Object.entries(apariciones).sort())
  console.log(`  ${destino}: ${n}/${N} semillas (${(n / N * 100).toFixed(1)}%)`);
