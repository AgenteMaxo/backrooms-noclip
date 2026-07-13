// Compila todo el catalogo de niveles parseado desde Fandom a fichas jugables.
// Las fichas existentes actuan como overrides artesanales; el resto recibe una
// representacion procedural determinista y conserva sus rutas documentadas.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PARSED_PATH = path.join(ROOT, 'data', 'parsed', 'levels.json');
const CURATED_PATH = path.join(ROOT, 'data', 'game', 'levels.curated.es.json');
const OUTPUT_PATH = path.join(ROOT, 'data', 'game', 'levels.es.json');

const parsedAll = JSON.parse(fs.readFileSync(PARSED_PATH, 'utf8'));
const { playableLevels } = require('./level-policy');
const { PALETTES, DESCRIPTIONS } = require('./biomes');
const parsed = playableLevels(parsedAll);
const curated = JSON.parse(fs.readFileSync(CURATED_PATH, 'utf8'));

function slug(value) {
  return String(value)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'nivel';
}

function buildIds() {
  const byTitle = new Map();
  const used = new Set();
  const curatedByWikiTitle = new Map();
  for (const [id, level] of Object.entries(curated)) {
    if (level.wikiTitle) curatedByWikiTitle.set(level.wikiTitle.toLowerCase(), id);
  }
  const ordered = Object.entries(parsed).sort((a, b) =>
    (a[1].pageid || 0) - (b[1].pageid || 0) || a[0].localeCompare(b[0]));
  for (const [title, level] of ordered) {
    let id = curatedByWikiTitle.get(title.toLowerCase()) || slug(title);
    if (used.has(id)) id += `-${level.pageid || used.size + 1}`;
    used.add(id);
    byTitle.set(title, id);
  }
  return byTitle;
}

const idByTitle = buildIds();
const titleById = new Map([...idByTitle].map(([title, id]) => [id, title]));
const titleByLower = new Map([...idByTitle.keys()].map((title) => [title.toLowerCase(), title]));

function sourceText(level) {
  return `${level.displayTitle || ''} ${level.description || level.lead || ''} ${(level.wikiCategories || []).join(' ')}`.toLowerCase();
}

function biomeText(level) {
  const intro = String(level.description || level.lead || '').slice(0, 900);
  return `${level.displayTitle || ''} ${(level.wikiCategories || []).join(' ')} ${intro}`.toLowerCase();
}

function inferBiome(level) {
  const text = biomeText(level);
  const rules = [
    ['oceano', /\b(?:ocean|seabed|undersea|open water|maritime)\b/],
    ['acuatico', /\b(?:aquatic|flooded|submerged|underwater|pool|waterpark)\b/],
    ['desierto', /\b(?:desert|dune|sandstorm|arid|wasteland)\b/],
    ['nevado', /\b(?:frigid|winter|snow|snowy|icy|glacier|frozen)\b/],
    ['espacial', /\b(?:outer space|space station|spaceship|cosmic|planet|asteroid|vacuum)\b/],
    ['cielo', /\b(?:sky|cloud|airborne|floating island)\b/],
    ['hotel', /\b(?:hotel|motel|resort|guest room)\b/],
    ['centro_comercial', /\b(?:mall|shopping centre|shopping center|retail|supermarket|storefront)\b/],
    ['residencial', /\b(?:residential|apartment|house|neighborhood|suburb)\b/],
    ['escuela', /\b(?:school|classroom|university|college|kindergarten|campus)\b/],
    ['laboratorio', /\b(?:laboratory|research facility|testing chamber|scientific facility)\b/],
    ['fabrica', /\b(?:factory|assembly line|manufacturing|foundry)\b/],
    ['industrial', /\b(?:industrial|warehouse|power plant|machinery|boiler room)\b/],
    ['alcantarillas', /\b(?:sewer|sewage|drainage|storm drain)\b/],
    ['estacion', /\b(?:station|platform|terminal|metro|subway)\b/],
    ['tren', /\b(?:train|railway|railroad|locomotive|carriage)\b/],
    ['carretera', /\b(?:highway|road|motorway|freeway|asphalt)\b/],
    ['pantano', /\b(?:swamp|marsh|bog|wetland)\b/],
    ['parque', /\b(?:park|playground|recreation area)\b/],
    ['granja', /\b(?:farm|farmland|barn|crop field|rural)\b/],
    ['ruinas', /\b(?:ruin|ruined|derelict|collapsed building|abandoned city)\b/],
    ['surreal', /\b(?:surrealism|surreal|dreamcore|weirdcore|glitched levels|glitch|abstraction)\b/],
    ['ciudad', /\b(?:metropolitan|city|town|village|street)\b/],
    ['tuneles', /\b(?:tunnel|cave|cavern|underground|mine)\b/],
    ['hospital', /\b(?:hospital|medical|clinic|surgery|ward|asylum)\b/],
    ['garaje', /\b(?:garage|parking)\b/],
    ['oficinas', /\b(?:office|library|workplace)\b/],
    ['invernadero', /\b(?:greenhouse|garden|botanical|glasshouse)\b/],
    ['bosque', /\b(?:forest|woodland|jungle|grove)\b/],
    ['torres', /\b(?:tower|skyscraper|vertical|stairwell)\b/],
    ['exterior', /\b(?:island|beach|field|mountain|outdoor)\b/],
  ];
  return rules.find(([, re]) => re.test(text))?.[0] || 'pasillos';
}

function inferDanger(level) {
  const numeric = Number.parseInt(level.class?.numeric, 10);
  if (Number.isFinite(numeric)) return Math.max(0, Math.min(5, numeric));
  const label = String(level.class?.label || '').toLowerCase();
  const text = sourceText(level);
  if (/deadzone|omega|sheol|nuclear/.test(label) || /extremely dangerous|certain death|extremely perilous|radioactive exclusion zone|environment:\s*5\s*\/\s*5/.test(text)) return 5;
  if (/habitable|secure|safe at last/.test(label) || /safe and secure/.test(text)) return 1;
  if (/undetermined|variable|contested|threat index/.test(label)) return 3;
  return 2;
}

function inferRules(level) {
  const text = sourceText(level);
  const rules = [];
  if (/dark|unlit|no light|pitch black/.test(text)) rules.push('oscuridad_total');
  if (/freez|frigid|winter|extreme cold|snow|ice\b/.test(text)) rules.push('frio');
  if (/extreme heat|scorch|burning|very hot/.test(text)) rules.push('calor');
  if (/corrosi|acid rain/.test(text)) rules.push('lluvia_corrosiva');
  if (/non.?euclidean|shift(?:ing)? (?:room|wall)|constantly change/.test(text)) rules.push('no_euclidiano');
  if (/hallucinat|psychological|mental effect|sanity/.test(text)) rules.push('alucinaciones');
  if (/isolat|no other (?:life|people)|complete solitude/.test(text)) rules.push('aislamiento');
  if (/aquatic|ocean|submerged|underwater|flood|drown|dangerous water|strong current/.test(text)) rules.push('agua_traicionera');
  return rules;
}

function inferLighting(level, danger, rules) {
  const text = sourceText(level);
  if (rules.includes('oscuridad_total')) return { darkness: 0.9, vision: 3 };
  if (/\b(?:dim|weak light|low light|poorly lit|faint light|penumbra)\b/.test(text))
    return { darkness: 0.68, vision: 4 };
  if (/\b(?:brightly lit|well-lit|well lit|bright light|sunlight|luminous)\b/.test(text))
    return { darkness: 0.18, vision: 8 };
  return {
    darkness: Math.min(0.72, 0.18 + danger * 0.1),
    vision: Math.max(4, 8 - danger),
  };
}

function routeType(text, hasLevelTarget = false) {
  const value = String(text).toLowerCase();
  if (!hasLevelTarget && /escape|frontrooms|real world|reality/.test(value)) return 'escape';
  if (/fall|drop|hole|pit|abyss|void|noclip/.test(value)) return 'arriesgada';
  if (/rare|small chance|occasionally|random/.test(value)) return 'rara';
  return 'normal';
}

function spanishClass(label) {
  if (!label) return 'Clase no determinada';
  const replacements = [
    [/Threat Index/gi, 'Índice de amenaza'],
    [/Undetermined/gi, 'indeterminada'],
    [/Deadzone/gi, 'zona mortal'],
    [/Environmental/gi, 'ambiental'],
    [/Custom Image/gi, 'personalizada'],
    [/In Progress/gi, 'en desarrollo'],
    [/Secure/gi, 'segura'],
    [/Contested/gi, 'disputada'],
    [/Deteriorating/gi, 'en deterioro'],
    [/Variable/gi, 'variable'],
    [/Error/gi, 'error'],
  ];
  let translated = String(label);
  for (const [pattern, value] of replacements) translated = translated.replace(pattern, value);
  return `Clase ${translated}`;
}

function spanishRouteText(source, target, type) {
  const text = String(source || '').toLowerCase();
  if (type === 'escape' && !target) return 'Una salida permite regresar a la realidad.';
  const destination = target || 'otro nivel';
  let route;
  if (/no.?clip/.test(text)) route = `Hacer no-clip a través de una zona anómala puede llevar a ${destination}.`;
  else if (/fall|drop|hole|pit|abyss|shaft/.test(text)) route = `Caer por una abertura inestable puede llevar a ${destination}.`;
  else if (/elevator|lift\b/.test(text)) route = `Un ascensor conduce a ${destination}.`;
  else if (/stair|ladder/.test(text)) route = `Una escalera conduce a ${destination}.`;
  else if (/tunnel|pipe|sewer/.test(text)) route = `Un túnel conecta con ${destination}.`;
  else if (/door|gate|entrance/.test(text)) route = `Una puerta conduce a ${destination}.`;
  else if (/sleep|dream|wake/.test(text)) route = `Dormir o perder el conocimiento puede llevar a ${destination}.`;
  else if (/walk|wander|follow|travel/.test(text)) route = `Avanzar hasta que cambie el entorno conduce a ${destination}.`;
  else route = `Una ruta documentada conduce a ${destination}.`;
  return type === 'rara' ? `En raras ocasiones, ${route.charAt(0).toLowerCase()}${route.slice(1)}` : route;
}

function spanishDescription(title, biome, danger, rules) {
  const dangerText = [
    'No presenta amenazas constantes conocidas.',
    'El riesgo general es bajo, aunque el entorno sigue siendo inestable.',
    'Exige precaución y recursos básicos para atravesarlo.',
    'Presenta amenazas importantes y una estabilidad limitada.',
    'Es un entorno muy peligroso; permanecer demasiado tiempo puede ser letal.',
    'Es una zona de peligro extremo con muy pocas posibilidades de supervivencia.',
  ];
  const ruleText = {
    oscuridad_total: 'La iluminación es escasa o inexistente.',
    frio: 'Las temperaturas son anormalmente bajas.',
    calor: 'Las temperaturas alcanzan niveles peligrosos.',
    lluvia_corrosiva: 'Hay sustancias corrosivas en el entorno.',
    no_euclidiano: 'La geometría cambia y no respeta las distancias normales.',
    alucinaciones: 'La exposición prolongada puede alterar la percepción.',
    aislamiento: 'El aislamiento afecta a la cordura de los viajeros.',
    agua_traicionera: 'Las zonas inundadas presentan corrientes y riesgos anómalos.',
  };
  const details = rules.map((rule) => ruleText[rule]).filter(Boolean).join(' ');
  return `${title} se manifiesta como ${DESCRIPTIONS[biome] || DESCRIPTIONS.pasillos}. ${dangerText[danger]}${details ? ` ${details}` : ''}`;
}

function styleForBiome(biome) {
  const styles = {
    pasillos: ['papel_rayas', 'moqueta'], garaje: ['hormigon', 'hormigon'],
    tuneles: ['ladrillo', 'piedra'], hospital: ['asilo', 'baldosa'], oficinas: ['azulejo', 'baldosa'],
    exterior: ['brutalismo', 'tierra'], bosque: ['madera', 'hierba'], ciudad: ['ladrillo', 'adoquin'],
    torres: ['metal_futurista', 'panel'], invernadero: ['cristal', 'piedra'],
    acuatico: ['azulejo', 'baldosa'], oceano: ['brutalismo', 'piedra'], desierto: ['brutalismo', 'tierra'],
    nevado: ['hormigon', 'nieve'], espacial: ['nave', 'panel'], cielo: ['cristal', 'blanco'],
    hotel: ['hotel', 'moqueta_cenefa'], centro_comercial: ['cristal', 'baldosa'],
    residencial: ['apartamento', 'tablones'], escuela: ['azulejo', 'baldosa'],
    industrial: ['tuberias', 'rejilla'], fabrica: ['brutalismo', 'hormigon'],
    laboratorio: ['metal_futurista', 'blanco'], alcantarillas: ['tuberias', 'rejilla'],
    estacion: ['ladrillo', 'baldosa_oscura'], tren: ['metal_futurista', 'panel'],
    carretera: ['brutalismo', 'hormigon'], parque: ['madera', 'hierba'], granja: ['madera', 'tierra'],
    pantano: ['madera', 'tierra'], ruinas: ['brutalismo', 'piedra'], surreal: ['neon', 'negro'],
  };
  const [pared, suelo] = styles[biome] || styles.pasillos;
  return { pared, suelo };
}

function particlesForBiome(biome, danger) {
  if (biome === 'nevado') return 'nieve';
  if (biome === 'acuatico' || biome === 'oceano' || biome === 'pantano') return 'vapor';
  if (biome === 'espacial' || biome === 'cielo') return 'estrellas';
  if (biome === 'surreal') return 'glitch';
  if (['bosque', 'parque', 'granja', 'invernadero'].includes(biome)) return 'esporas';
  return danger >= 4 ? 'ceniza' : 'polvo';
}

function parsedRoutes(level) {
  const routes = [];
  for (const exit of level.exits || []) {
    let linked = false;
    for (const target of exit.targets || []) {
      const destino = idByTitle.get(target);
      if (!destino) continue;
      const tipo = routeType(exit.text, true);
      routes.push({ texto: spanishRouteText(exit.text, target, tipo), destino, tipo });
      linked = true;
    }
    if (!linked && routeType(exit.text) === 'escape')
      routes.push({ texto: spanishRouteText(exit.text, null, 'escape'), destino: null, tipo: 'escape' });
  }
  return routes;
}

function makeGenerated(title, level) {
  const id = idByTitle.get(title);
  const bioma = inferBiome(level);
  const peligro = inferDanger(level);
  const reglas = inferRules(level);
  const lighting = inferLighting(level, peligro, reglas);
  const display = (level.displayTitle || title).replace(/\s+/g, ' ').trim() || title;
  const salidas = parsedRoutes(level);
  return {
    id, wikiTitle: title, nombre: display,
    clase: spanishClass(level.class?.label),
    peligro, bioma,
    tam: [72 + (level.pageid % 3) * 8, 54 + (level.pageid % 4) * 6],
    paleta: PALETTES[bioma],
    vision: lighting.vision,
    oscuridad: lighting.darkness,
    descripcion: spanishDescription(title, bioma, peligro, reglas),
    cita: '', reglas, entidades: [],
    objetos: peligro <= 2 ? [{ id: 'agua_almendras', n: [0, 1] }] : [],
    salidas,
    esEscape: salidas.some((route) => route.tipo === 'escape'),
    url: level.url,
    estilo: styleForBiome(bioma),
    particulas: particlesForBiome(bioma, peligro),
    sonido: reglas.includes('oscuridad_total') ? 'oscuridad' : null,
    generado: true,
  };
}

function normalizedText(value) {
  return slug(value).replace(/-/g, ' ');
}

function containsPhrase(text, phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^| )${escaped}(?: |$)`).test(text);
}

function resolveCuratedRoute(route, parsedLevel) {
  if (route.destino === '*aleatoria' || route.destino === '*visitada' ||
      String(route.destino || '').startsWith('*opciones:')) return { ...route };
  if (route.destino && titleById.has(route.destino))
    return { ...route, tipo: route.tipo === 'sellada' ? 'normal' : route.tipo };
  const routeText = normalizedText(route.texto || '');
  const candidates = parsedRoutes(parsedLevel);
  let match = candidates.find((candidate) => {
    const targetTitle = titleById.get(candidate.destino);
    return targetTitle && containsPhrase(routeText, normalizedText(targetTitle));
  });
  if (!match && candidates.length === 1) match = candidates[0];
  const legacyType = route.tipo === 'sellada' || (route.tipo === 'escape' && match?.destino);
  return match ? { ...route, destino: match.destino, tipo: legacyType ? match.tipo : route.tipo } : null;
}

function mergeCurated(base, custom, parsedLevel) {
  const routes = [];
  const seen = new Set();
  for (const raw of custom.salidas || []) {
    const route = resolveCuratedRoute(raw, parsedLevel);
    if (!route) continue;
    const key = `${route.destino || ''}|${route.tipo}|${route.texto}`;
    if (!seen.has(key)) { seen.add(key); routes.push(route); }
  }
  for (const route of base.salidas) {
    const duplicate = routes.some((current) => current.destino === route.destino && current.tipo !== 'escape');
    if (!duplicate) routes.push(route);
  }
  return { ...base, ...custom, id: base.id, wikiTitle: base.wikiTitle, salidas: routes,
    esEscape: custom.esEscape || routes.some((route) => route.tipo === 'escape'), generado: false };
}

const output = {};
for (const [title, parsedLevel] of Object.entries(parsed)) {
  const base = makeGenerated(title, parsedLevel);
  const custom = curated[base.id];
  output[base.id] = custom ? mergeCurated(base, custom, parsedLevel) : base;
}

// Algunas páginas documentan la conexión solo en "Entrances" o en la prosa
// que declara un subnivel. Convertimos esas relaciones en rutas reales para
// que el grafo y el juego no dejen niveles aislados por el formato del artículo.
for (const [title, parsedLevel] of Object.entries(parsed)) {
  const destinationId = idByTitle.get(title);
  const relations = [];
  const outgoingRelations = [];
  for (const entrance of parsedLevel.entrances || []) {
    for (const sourceTitle of entrance.targets || [])
      relations.push({ sourceTitle, text: entrance.text, type: routeType(entrance.text, true) });
  }
  const prose = `${parsedLevel.description || ''} ${parsedLevel.lead || ''}`;
  for (const match of prose.matchAll(/\bsub-?level of (?:the )?(Level [0-9]+(?:\.[0-9]+)*)/gi))
    relations.push({ sourceTitle: match[1], text: 'sublevel', type: 'normal' });
  for (const match of prose.matchAll(/\bsub-?level between (Level [0-9]+(?:\.[0-9]+)*) and (Level [0-9]+(?:\.[0-9]+)*)/gi)) {
    relations.push({ sourceTitle: match[1], text: 'sublevel', type: 'normal' });
    outgoingRelations.push({ destinationTitle: match[2], text: 'sublevel', type: 'normal' });
  }

  for (const relation of relations) {
    const sourceTitle = titleByLower.get(relation.sourceTitle.toLowerCase());
    const sourceId = sourceTitle && idByTitle.get(sourceTitle);
    if (!sourceId || sourceId === destinationId || !output[sourceId]) continue;
    if (output[sourceId].salidas.some((route) => route.destino === destinationId)) continue;
    const texto = relation.text === 'sublevel'
      ? `Una transición hacia un subnivel conduce a ${title}.`
      : spanishRouteText(relation.text, title, relation.type);
    output[sourceId].salidas.push({ texto, destino: destinationId, tipo: relation.type });
  }
  for (const relation of outgoingRelations) {
    const destinationTitle = titleByLower.get(relation.destinationTitle.toLowerCase());
    const targetId = destinationTitle && idByTitle.get(destinationTitle);
    if (!targetId || targetId === destinationId || !output[targetId]) continue;
    if (output[destinationId].salidas.some((route) => route.destino === targetId)) continue;
    output[destinationId].salidas.push({
      texto: `Una transición desde este subnivel conduce a ${destinationTitle}.`,
      destino: targetId,
      tipo: relation.type,
    });
  }
}

// Contratos de fidelidad derivados de categorías explícitas de la wiki. Se
// aplican también a los overrides para que una ficha artesanal antigua no
// pueda convertir un nivel Darkness en una escena sobreexpuesta o un nivel
// Aquatic en terreno seco al reconstruir el catálogo.
for (const [title, parsedLevel] of Object.entries(parsed)) {
  const level = output[idByTitle.get(title)];
  if (!level) continue;
  const categories = new Set(parsedLevel.wikiCategories || []);
  if (categories.has('Darkness')) {
    level.oscuridad = Math.max(0.72, level.oscuridad || 0);
    level.vision = Math.min(5, level.vision || 5);
  }
  if (categories.has('Aquatic')) {
    const text = `${parsedLevel.displayTitle || title} ${parsedLevel.description || ''}`.toLowerCase();
    level.bioma = /ocean|sea\b|seabed|open water|thalassophobia/.test(text) ? 'oceano' : 'acuatico';
    level.reglas ||= [];
    if (!level.reglas.includes('respiracion_acuatica')) level.reglas.push('respiracion_acuatica');
    if (!level.reglas.includes('agua_traicionera')) level.reglas.push('agua_traicionera');
    level.estilo = styleForBiome(level.bioma);
    level.particulas = particlesForBiome(level.bioma, level.peligro);
  }
}

const blocked = [];
for (const [id, level] of Object.entries(output)) {
  for (const route of level.salidas) {
    if (route.tipo === 'sellada' || (route.destino && !output[route.destino] && !route.destino.startsWith('*')))
      blocked.push(`${id} -> ${route.destino || '(sin destino)'}`);
  }
}
if (blocked.length) throw new Error(`Quedan rutas bloqueadas:\n${blocked.join('\n')}`);

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 1) + '\n');
console.log(`Catalogo jugable: ${Object.keys(output).length} niveles (${Object.values(output).filter((x) => !x.generado).length} artesanales).`);
console.log(`Rutas transitables: ${Object.values(output).reduce((n, x) => n + x.salidas.filter((s) => s.destino).length, 0)}.`);
