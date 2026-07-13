// Genera game/js/assets-manifest.js: el inventario de los assets OPCIONALES
// que existen DE VERDAD en game/assets/ (sprites, iconos, sonidos y ambientes
// de nivel). El juego solo carga lo que aparece aquí — nada de sondear rutas
// a ciegas (antes se probaban ~2.900 URLs con 4 extensiones por id y la
// consola/red se llenaban de 404 desde la pantalla de título).
//
// RE-EJECUTAR tras añadir/quitar cualquier archivo en game/assets/:
//   node pipeline/build-assets-manifest.js
// El CI comprueba que el manifiesto committeado esté al día.
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'game');

function archivosDe(dir) {
  try {
    return fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name);
  } catch (e) { return []; }
}

function porPrioridad(dirs, exts) {
  // primera ruta existente según la MISMA prioridad que usaba el sondeo del
  // motor (dir-mayor para sprites, ext-mayor para sonidos: el llamador elige
  // el orden pasando la lista ya ordenada)
  const out = {};
  for (const dir of dirs) {
    for (const nombre of archivosDe(dir)) {
      const ext = path.extname(nombre).slice(1).toLowerCase();
      const id = path.basename(nombre, path.extname(nombre));
      if (!exts.includes(ext)) continue;
      const clave = `${dir}/${nombre}`;
      if (!out[id]) out[id] = [];
      out[id].push({ ruta: clave, dirI: dirs.indexOf(dir), extI: exts.indexOf(ext) });
    }
  }
  return out;
}

function elegir(candidatos, comparador) {
  const res = {};
  for (const [id, lista] of Object.entries(candidatos)) {
    lista.sort(comparador);
    res[id] = lista[0].ruta;
  }
  return res;
}

// ---- sprites: misma prioridad que el viejo rutasOverride() de sprites.js ----
// (dir-mayor: assets/sprites > assets/objetos > assets; ext: webp>png>jpg>jpeg)
const sprites = elegir(
  porPrioridad(['assets/sprites', 'assets/objetos', 'assets'], ['webp', 'png', 'jpg', 'jpeg']),
  (a, b) => a.dirI - b.dirI || a.extI - b.extI
);

// ---- iconos: assets/icons/<id>.png (como Icons.tryOverrides) ----
const iconos = elegir(
  porPrioridad(['assets/icons'], ['png']),
  (a, b) => a.extI - b.extI
);

// ---- sonidos: misma prioridad que el viejo bucle de sfx.js ----
// (ext-mayor: mp3>ogg>wav; dir: entidades > entities > raíz de sounds).
// Menu/ y niveles/ van aparte (música de menú y ambientes por nivel).
const sonidos = elegir(
  porPrioridad(['assets/sounds/entidades', 'assets/sounds/entities', 'assets/sounds'], ['mp3', 'ogg', 'wav']),
  (a, b) => a.extI - b.extI || a.dirI - b.dirI
);

// ---- ambientes por nivel: assets/sounds/niveles/<levelId>.* ----
// (prioridad de Sfx.ambient(): mp3 > wav > ogg)
const ambientes = elegir(
  porPrioridad(['assets/sounds/niveles'], ['mp3', 'wav', 'ogg']),
  (a, b) => a.extI - b.extI
);

const salida = `// GENERADO por pipeline/build-assets-manifest.js — NO editar a mano.
// Inventario de los assets opcionales que existen en game/assets/: el juego
// SOLO carga estas rutas (cero sondeos, cero 404). Tras añadir o quitar
// archivos: node pipeline/build-assets-manifest.js
window.ASSETS_MANIFEST = ${JSON.stringify({ sprites, iconos, sonidos, ambientes }, null, 2)};
`;

const destino = path.join(RAIZ, 'js', 'assets-manifest.js');
fs.writeFileSync(destino, salida);
console.log(`assets-manifest.js: ${Object.keys(sprites).length} sprites, ` +
  `${Object.keys(iconos).length} iconos, ${Object.keys(sonidos).length} sonidos, ` +
  `${Object.keys(ambientes).length} ambientes de nivel`);
