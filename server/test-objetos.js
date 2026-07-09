const assert = require('assert');

global.window = {};
require('../game/js/data.js');
global.document = {
  createElement(tag) {
    assert.strictEqual(tag, 'canvas', 'sprites solo debe crear canvas en este test');
    return {
      width: 0,
      height: 0,
      getContext() {
        return {
          imageSmoothingEnabled: false,
          fillStyle: '',
          strokeStyle: '',
          lineWidth: 1,
          globalCompositeOperation: '',
          shadowColor: '',
          shadowBlur: 0,
          translate() {},
          scale() {},
          drawImage() {},
          fillRect() {},
          strokeRect() {},
          beginPath() {},
          arc() {},
          ellipse() {},
          moveTo() {},
          lineTo() {},
          quadraticCurveTo() {},
          closePath() {},
          fill() {},
          stroke() {},
          save() {},
          restore() {},
        };
      },
    };
  },
};
global.Image = class {
  set src(value) { this._src = value; }
  get src() { return this._src; }
};
require('../game/js/engine/sprites.js');

const PARSED = require('../data/parsed/objects.json');
const DATA = require('../data/game/objects.es.json');
const BUNDLE = global.window.GAME_DATA.objects;

const EXCLUIDOS = new Set([
  'Level 993',
  'Level 948',
  'Extended Almond Water Sub-Item Dossier (Collaborative)',
  'Level 149',
  'Shiny Nickles (Joke)',
  'Shiny Dollers (Joke)',
  'Level 680',
  'Level 828',
  'Object 56/Star Curtain Project',
  'Object 56/A Fleeting Dream.',
  'McDonal Milkshak (Joke)',
  'Phenomenon 2',
]);

const LOCALES = new Set([
  'amuleto',
  'botiquin',
  'botas_reforzadas',
  'chaqueta',
  'linterna',
  'mascara_gas',
  'tuberia',
]);

const ACTIVOS_SOPORTADOS = new Set([
  'blink',
  'celeridad',
  'claridad',
  'disparo',
  'flash',
  'fuego',
  'fuego_menor',
  'gas',
  'glitch',
  'ocultar',
  'paralisis',
  'refugio',
  'repeler',
  'riesgo',
  'ruido',
  'salida',
  'sellar',
  'toxina',
]);

const PASIVOS_SOPORTADOS = new Set([
  'abrigo',
  'aire',
  'arma',
  'detector',
  'fuerza',
  'llave',
  'pisada',
  'proteccion_quimica',
  'suerte',
  'traje_hostil',
]);

const RANURAS = new Set(['cara', 'cuerpo', 'pies']);
const ids = Object.keys(DATA);
const parsedIncluidos = Object.entries(PARSED).filter(([key]) => !EXCLUIDOS.has(key));

assert.strictEqual(Object.keys(PARSED).length, 89, 'la fuente parseada cambio: revisar exclusiones');
assert.strictEqual(EXCLUIDOS.size, 12, 'la lista de exclusiones debe ser explicita');
assert.strictEqual(parsedIncluidos.length, 77, 'deben entrar 77 paginas wiki reales');
assert.strictEqual(ids.length, parsedIncluidos.length + LOCALES.size, 'total de objetos del juego inesperado');
assert.deepStrictEqual(Object.keys(BUNDLE).sort(), ids.sort(), 'game/js/data.js no coincide con objects.es.json');

const porUrl = new Map();
for (const [id, def] of Object.entries(DATA)) {
  if (def.url) {
    assert(!porUrl.has(def.url), `url wiki duplicada: ${def.url}`);
    porUrl.set(def.url, id);
  }
}

for (const [key, rec] of Object.entries(PARSED)) {
  if (EXCLUIDOS.has(key)) {
    assert(!porUrl.has(rec.url), `la pagina excluida no debe estar en catalogo: ${key}`);
  } else {
    assert(porUrl.has(rec.url), `falta pagina wiki en catalogo: ${key} (${rec.url})`);
  }
}

for (const id of LOCALES) {
  assert(DATA[id], `falta objeto local de juego: ${id}`);
  assert(!DATA[id].url, `${id}: objeto local no debe fingir pagina wiki propia`);
}

for (const [id, def] of Object.entries(DATA)) {
  assert.strictEqual(def.id, id, `${id}: id interno inconsistente`);
  assert(def.nombre && typeof def.nombre === 'string', `${id}: falta nombre`);
  assert(def.descripcion && typeof def.descripcion === 'string', `${id}: falta descripcion`);
  assert(def.descripcion.length >= 20, `${id}: descripcion demasiado pobre`);
  assert(def.color && /^#[0-9a-f]{6}$/i.test(def.color), `${id}: color invalido`);
  assert(def.efecto && typeof def.efecto === 'object', `${id}: falta efecto jugable`);

  const e = def.efecto;
  const accionable = e.salud || e.sed || e.cordura || e.ruido || e.toggle || e.activo || e.pasivo;
  assert(accionable, `${id}: efecto vacio/no accionable`);

  if (e.activo) assert(ACTIVOS_SOPORTADOS.has(e.activo), `${id}: activo no soportado ${e.activo}`);
  if (e.pasivo) assert(PASIVOS_SOPORTADOS.has(e.pasivo), `${id}: pasivo no soportado ${e.pasivo}`);
  if (e.toggle) assert.strictEqual(e.toggle, 'luz', `${id}: toggle no soportado ${e.toggle}`);
  for (const stat of ['salud', 'sed', 'cordura', 'ruido', 'dano', 'radio']) {
    if (e[stat] !== undefined) assert(Number.isFinite(e[stat]), `${id}: ${stat} debe ser numerico`);
  }
  if (def.url) {
    assert(/^https:\/\/backrooms\.fandom\.com\//.test(def.url), `${id}: url wiki invalida`);
    assert(def.wikiTitle, `${id}: falta wikiTitle`);
  }
  if (def.manos) assert([1, 2].includes(def.manos), `${id}: manos invalido`);
  if (def.equipo) assert(RANURAS.has(def.equipo), `${id}: ranura equipo invalida`);
}

const basicos = ['agua_almendras', 'agua_almendras', 'botiquin', 'linterna', 'tuberia', 'trebol'];
const poolLoot = basicos.concat(Object.keys(DATA).filter((id) => !basicos.includes(id)));
assert.strictEqual(new Set(poolLoot).size, ids.length, 'el pool de loot no alcanza todo el catalogo');

for (const id of ids) assert(window.Sprites.tiene(id), `${id}: falta sprite procedural o externo`);
const rutas = window.Sprites.overridePaths('agua_almendras');
for (const ruta of [
  'assets/sprites/agua_almendras.webp',
  'assets/sprites/agua_almendras.png',
  'assets/sprites/agua_almendras.jpg',
  'assets/sprites/agua_almendras.jpeg',
  'assets/objetos/agua_almendras.webp',
  'assets/objetos/agua_almendras.png',
  'assets/objetos/agua_almendras.jpg',
  'assets/objetos/agua_almendras.jpeg',
  'assets/agua_almendras.webp',
  'assets/agua_almendras.png',
  'assets/agua_almendras.jpg',
  'assets/agua_almendras.jpeg',
]) assert(rutas.includes(ruta), `falta ruta de override: ${ruta}`);

console.log(`OK catalogo completo: ${ids.length} objetos, ${parsedIncluidos.length} paginas wiki incluidas, ${EXCLUIDOS.size} exclusiones verificadas`);
