// Fase 1 — Parsea el wikitext crudo de data/raw/ y produce el grafo estructurado:
//   data/parsed/levels.json   (nodos de nivel + aristas de salidas)
//   data/parsed/entities.json
//   data/parsed/objects.json
//   data/parsed/report.txt    (informe de sanidad)
// Uso: node pipeline/parse.js

const fs = require('fs');
const path = require('path');

const RAW_DIR = path.join(__dirname, '..', 'data', 'raw');
const OUT_DIR = path.join(__dirname, '..', 'data', 'parsed');

// ---------- utilidades de wikitext ----------

function decodeEntities(text) {
  return String(text ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function cleanLinkTarget(target) {
  let clean = decodeEntities(target)
    .replace(/^\s*:/, '')
    .split('#')[0]
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  clean = clean.replace(/^level\s+/i, 'Level ');
  const fixed = {
    'the void': 'The Void',
    'the frontrooms': 'The Frontrooms',
    'the hub': 'The Hub',
  };
  return fixed[clean.toLowerCase()] ?? clean;
}

function titleKey(title) {
  return cleanLinkTarget(title).toLocaleLowerCase('en-US');
}

// Elimina plantillas {{...}} (con anidamiento) del texto.
function stripTemplates(text) {
  let out = '';
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith('{{', i)) { depth++; i++; continue; }
    if (text.startsWith('}}', i) && depth > 0) { depth--; i++; continue; }
    if (depth === 0) out += text[i];
  }
  return out;
}

// Convierte wikitext a texto plano legible.
function plainText(wt) {
  let t = String(wt ?? '');
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<(style|script|gallery)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  t = t.replace(/^\s*\{\|[\s\S]*?^\s*\|\}\s*$/gm, ''); // tablas wiki
  t = t.replace(/<ref[^>]*\/>/g, '');
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  t = stripTemplates(t);
  t = t.replace(/\[\[File:[^\]]*\]\]/gi, '');
  t = t.replace(/\[\[Category:[^\]]*\]\]/gi, '');
  t = t.replace(/\[\[[a-z-]{2,6}:[^\]]*\]\]/g, ''); // interwiki
  t = t.replace(/\[\[([^|\]]*)\|([^\]]*)\]\]/g, '$2'); // [[destino|texto]] -> texto
  t = t.replace(/\[\[([^\]]*)\]\]/g, '$1'); // [[destino]] -> destino
  t = t.replace(/\[https?:\/\/\S+ ([^\]]*)\]/g, '$1');
  t = t.replace(/'''?/g, '');
  t = t.replace(/<[^>]+>/g, '');
  t = t.replace(/__\w+__/g, '');
  t = t.replace(/^[=]+.*[=]+$/gm, '');
  t = decodeEntities(t);
  t = t.replace(/[ \t]+\n/g, '\n');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

// Extrae enlaces internos [[Título]] o [[Título|texto]] (sin File:/Category:/interwiki).
function links(wt) {
  const out = [];
  const re = /\[\[([^|\]#]+)(?:#[^|\]]*)?(?:\|[^\]]*)?\]\]/g;
  let m;
  while ((m = re.exec(wt))) {
    const target = cleanLinkTarget(m[1]);
    if (/^(File|Category|User|Template|Special|Help|MediaWiki|Module|Talk|[a-z-]{2,6}):/i.test(target)) continue;
    out.push(target);
  }
  return out;
}

// Divide el wikitext en secciones por encabezados ==...== (cualquier nivel).
function sections(wt) {
  const out = {};
  const re = /^(={2,6})(.+?)\1\s*$/gm;
  const heads = [];
  let m;
  while ((m = re.exec(wt))) heads.push({ name: m[2].trim(), start: m.index, end: m.index + m[0].length });
  out['_lead'] = wt.slice(0, heads.length ? heads[0].start : wt.length);
  for (let i = 0; i < heads.length; i++) {
    const body = wt.slice(heads[i].end, i + 1 < heads.length ? heads[i + 1].start : wt.length);
    // normaliza el nombre: quita negritas, enlaces, html, símbolos decorativos y espacios
    const key = normalizeHeading(heads[i].name);
    out[key] = (out[key] ?? '') + body;
  }
  return out;
}

function normalizeHeading(text) {
  return plainText(text)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extrae los parámetros de la primera plantilla cuyo nombre empiece por `prefix`.
function templateParams(wt, prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('\\{\\{\\s*' + escaped + '(?=[\\s_|}])', 'i');
  const m = re.exec(wt);
  if (!m) return null;
  // recorta la plantilla completa respetando anidamiento
  let depth = 0, end = -1;
  for (let i = m.index; i < wt.length - 1; i++) {
    if (wt.startsWith('{{', i)) { depth++; i++; }
    else if (wt.startsWith('}}', i)) {
      depth--;
      if (depth === 0) { end = i + 2; break; }
      i++;
    }
  }
  if (end < 0) return null;
  const inner = wt.slice(m.index + 2, end - 2);
  const params = {};
  let positional = 0;
  // divide por | ignorando anidamiento de [[ ]] y {{ }}
  let buf = '', d = 0, parts = [];
  for (let i = 0; i < inner.length; i++) {
    if (inner.startsWith('{{', i) || inner.startsWith('[[', i)) {
      d++; buf += inner.slice(i, i + 2); i++; continue;
    }
    if (inner.startsWith('}}', i) || inner.startsWith(']]', i)) {
      d--; buf += inner.slice(i, i + 2); i++; continue;
    }
    if (inner[i] === '|' && d <= 0) { parts.push(buf); buf = ''; continue; }
    buf += inner[i];
  }
  parts.push(buf);
  params['_name'] = parts.shift().trim();
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq > -1) params[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim();
    else params[String(++positional)] = p.trim();
  }
  params._start = m.index;
  params._end = end;
  return params;
}

function cleanParam(value) {
  if (value == null || value === '') return null;
  const text = plainText(String(value)).replace(/\s+/g, ' ').trim();
  return text || null;
}

function parseClass(wt) {
  let cls = templateParams(wt, 'Class');
  let alt = false;
  if (!cls) {
    cls = templateParams(wt, 'Alt Class') || templateParams(wt, 'Alt_Class');
    alt = !!cls;
  }
  if (!cls) return null;
  const template = cls._name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const suffix = template.replace(alt ? /^alt class\s*/i : /^class\s*/i, '').trim();
  const custom = cleanParam(cls.class);
  const positional = cleanParam(cls['1']);
  const label = custom || positional || (alt ? 'Threat Index' : suffix) || null;
  const numericMatch = String(label ?? '').match(/^([0-5])(?:\s*e\b|\b)/i);
  return {
    template,
    label,
    numeric: numericMatch ? numericMatch[1] : null,
    environmental: /^[0-5]\s*e\b/i.test(String(label ?? '')),
    safety: cleanParam(cls.safety),
    security: cleanParam(cls.security),
    entityLevel: cleanParam(cls.entity ?? cls.ent ?? cls['entity count'] ?? cls.p3),
    exitLevel: cleanParam(cls.ext ?? cls.p1),
    environmentLevel: cleanParam(cls.env ?? cls.p2),
    color: cleanParam(cls.color),
  };
}

// Convierte viñetas partidas en varias líneas en entradas lógicas.
function routeLines(sectionWt) {
  const out = [];
  let current = '';
  for (const raw of String(sectionWt ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) {
      if (current) out.push(current);
      current = '';
      continue;
    }
    if (/^[*#]+/.test(line)) {
      if (current) out.push(current);
      current = line;
    } else if (current && /^[*#]+/.test(current) && /^\s+/.test(raw) && !/^={2,6}/.test(line)) {
      current += ' ' + line;
    } else {
      if (current) out.push(current);
      current = line;
    }
  }
  if (current) out.push(current);
  return out;
}

// Extrae la lista de salidas/entradas: viñetas (o párrafos) con sus enlaces.
function routeList(sectionWt) {
  if (!sectionWt) return [];
  const out = [];
  for (const line of routeLines(sectionWt)) {
    const l = line.trim();
    if (!l) continue;
    const isBullet = /^[*#]+/.test(l);
    const targets = links(l);
    if (!targets.length) continue;
    const text = plainText(l.replace(/^[*#:]+\s*/, '')).replace(/\s+/g, ' ').trim();
    if (!isBullet && !/level|exit|enter|lead|no-?clip|door|wander/i.test(text)) continue;
    out.push({ text, targets });
  }
  return out;
}

const ROUTE_HEADINGS = {
  entrances: new Set(['entrance', 'entrances', 'ways in', 'entry', 'entries']),
  exits: new Set(['exit', 'exits', 'ways out', 'leaving', 'departures']),
};

function routeHeadingKind(line) {
  const key = normalizeHeading(line);
  for (const [kind, names] of Object.entries(ROUTE_HEADINGS))
    if (names.has(key)) return kind;
  return null;
}

function sectionForRoutes(secs, kind) {
  for (const name of ROUTE_HEADINGS[kind]) if (secs[name]) return secs[name];
  for (const [key, body] of Object.entries(secs)) {
    if (key === '_lead' || /\band\b/.test(key)) continue;
    if (kind === 'entrances' && /^(entrances?|entries|ways in)\b/.test(key)) return body;
    if (kind === 'exits' && /^(exits?|ways out|leaving|departures)\b/.test(key)) return body;
  }
  return '';
}

// Fallback: busca un "pseudo-encabezado" (p. ej. <span>'''Exits'''</span>)
// incluso dentro de una sección combinada "Entrances and Exits".
function pseudoSection(wt, kind) {
  const lines = wt.split('\n');
  const start = lines.findIndex((l) =>
    l.length < 400 && !/^[*#]/.test(l.trim()) && routeHeadingKind(l) === kind
  );
  if (start < 0) return '';
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i].trim();
    if (/^={2,6}[^=]/.test(l) || (routeHeadingKind(l) && routeHeadingKind(l) !== kind)) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

function routeSection(wt, secs, kind) {
  return sectionForRoutes(secs, kind) || pseudoSection(wt, kind);
}

function combinedRouteSections(secs) {
  const found = Object.entries(secs).find(([key]) =>
    /\bentr(?:ance|ances|y|ies)\b/.test(key) && /\bexits?\b/.test(key)
  );
  if (!found) return { entrances: '', exits: '' };

  const buckets = { entrances: [], exits: [] };
  let mode = null;
  const withSentences = found[1].replace(/([.!?])\s+(?=[A-Z])/g, '$1\n');
  for (const raw of withSentences.split('\n')) {
    const text = plainText(raw).toLowerCase();
    const entranceAt = text.search(/\b(?:entrance|enter|entry|access)\b/);
    const exitAt = text.search(/\b(?:exit|leave|leaving|departure)\b/);
    if (entranceAt >= 0 || exitAt >= 0)
      mode = exitAt >= 0 && (entranceAt < 0 || exitAt < entranceAt) ? 'exits' : 'entrances';
    if (mode) buckets[mode].push(raw);
  }
  return { entrances: buckets.entrances.join('\n'), exits: buckets.exits.join('\n') };
}

function firstImage(wt) {
  const m = /\{\{Blurimage\|file=([^|}]+)/i.exec(wt) || /\[\[File:([^|\]]+)/i.exec(wt);
  return m ? m[1].trim() : null;
}

// ---------- parseo principal ----------

function parsePage(page) {
  const wt = page.wikitext;
  const secs = sections(wt);
  const dt = /\{\{DISPLAYTITLE:\s*([^}]+)\}\}/i.exec(wt);
  const wikiCats = [...wt.matchAll(/\[\[Category:([^\]|]+)/g)].map((m) => m[1].trim());

  const descriptionWt = secs.description ?? secs.overview ?? secs['general description'] ?? secs._lead ?? '';
  const entitiesWt = secs.entities ?? secs.entity ?? secs['entity presence'] ?? '';
  const combinedRoutes = combinedRouteSections(secs);
  const exitsWt = routeSection(wt, secs, 'exits') || combinedRoutes.exits;
  const entrancesWt = routeSection(wt, secs, 'entrances') || combinedRoutes.entrances;
  const redirect = /^\s*#redirect\s*\[\[([^\]|#]+)/im.exec(wt);

  const parsed = {
    pageid: page.pageid,
    title: page.title,
    displayTitle: dt ? plainText(dt[1]).trim() : page.title,
    apiCategories: page.categories,
    wikiCategories: wikiCats,
    class: parseClass(wt),
    description: plainText(descriptionWt),
    lead: plainText(secs['_lead'] ?? ''),
    entityLinks: [...new Set(links(entitiesWt))],
    allLinks: [...new Set(links(wt))],
    entrances: routeList(entrancesWt),
    exits: routeList(exitsWt),
    image: firstImage(wt),
    url: 'https://backrooms.fandom.com/wiki/' + encodeURIComponent(page.title.replace(/ /g, '_')),
  };
  if (redirect) parsed.redirectTo = cleanLinkTarget(redirect[1]);
  return parsed;
}

function buildTitleResolver(pages) {
  const resolver = new Map();
  for (const page of pages) resolver.set(titleKey(page.title), page.title);
  for (const page of pages) {
    const redirect = /^\s*#redirect\s*\[\[([^\]|#]+)/im.exec(page.wikitext ?? '');
    if (!redirect) continue;
    const target = resolver.get(titleKey(redirect[1])) ?? cleanLinkTarget(redirect[1]);
    resolver.set(titleKey(page.title), target);
  }
  return resolver;
}

function resolvePageLinks(page, resolver) {
  const resolve = (target) => resolver.get(titleKey(target)) ?? cleanLinkTarget(target);
  page.allLinks = [...new Set(page.allLinks.map(resolve))];
  page.entityLinks = [...new Set(page.entityLinks.map(resolve))];
  for (const route of [...page.entrances, ...page.exits])
    route.targets = [...new Set(route.targets.map(resolve))];
  if (page.redirectTo) page.redirectTo = resolve(page.redirectTo);
  return page;
}

function classifyPage(page, parsed, collections) {
  const cats = page.categories ?? [];
  let classified = false;
  if (cats.includes('Levels')) { collections.levels[page.title] = parsed; classified = true; }
  if (cats.includes('Entities')) { collections.entities[page.title] = parsed; classified = true; }
  if (cats.includes('Objects')) { collections.objects[page.title] = parsed; classified = true; }
  if (cats.includes('Groups') || cats.includes('Phenomena') || !classified)
    collections.others[page.title] = parsed;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = fs.readdirSync(RAW_DIR).filter((f) => /^\d+\.json$/.test(f));
  const levels = {}, entities = {}, objects = {}, others = {};
  const collections = { levels, entities, objects, others };
  const pages = files.map((f) => JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), 'utf8')));
  const resolver = buildTitleResolver(pages);

  for (const page of pages)
    classifyPage(page, resolvePageLinks(parsePage(page), resolver), collections);

  // Informe de sanidad
  const titles = new Set(Object.keys(levels));
  let sinSalidas = [], enlacesRotos = 0, aristas = 0, sinClase = 0, sinDescripcion = 0;
  const destinosRotos = new Map();
  for (const [t, lv] of Object.entries(levels)) {
    if (!lv.exits.length) sinSalidas.push(t);
    if (!lv.class) sinClase++;
    if (!lv.description) sinDescripcion++;
    for (const ex of lv.exits)
      for (const target of ex.targets) {
        aristas++;
        if (!titles.has(target)) {
          enlacesRotos++;
          destinosRotos.set(target, (destinosRotos.get(target) ?? 0) + 1);
        }
      }
  }
  const clases = {};
  for (const lv of Object.values(levels)) {
    const c = lv.class?.label ?? (lv.class ? 'Threat Index' : 'desconocida');
    clases[c] = (clases[c] ?? 0) + 1;
  }
  const multiCategoria = pages.filter((p) => (p.categories ?? []).length > 1).length;
  const topRotos = [...destinosRotos]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([t, n]) => `${t} (${n})`).join(' | ');

  const report = [
    `Páginas únicas procesadas: ${pages.length} (multicategoría: ${multiCategoria})`,
    `Niveles: ${Object.keys(levels).length}`,
    `Entidades: ${Object.keys(entities).length}`,
    `Objetos: ${Object.keys(objects).length}`,
    `Fenómenos/grupos/otras: ${Object.keys(others).length}`,
    `Aristas de salida totales: ${aristas} (destinos fuera del set de niveles: ${enlacesRotos})`,
    `  destinos externos más citados: ${topRotos || 'ninguno'}`,
    `Niveles sin salidas parseadas: ${sinSalidas.length}`,
    `  ej.: ${sinSalidas.slice(0, 15).join(' | ')}`,
    `Niveles sin clase parseada: ${sinClase}`,
    `Niveles sin descripción parseada: ${sinDescripcion}`,
    `Distribución de clases: ${JSON.stringify(clases, null, 1)}`,
  ].join('\n');

  fs.writeFileSync(path.join(OUT_DIR, 'levels.json'), JSON.stringify(levels, null, 1));
  fs.writeFileSync(path.join(OUT_DIR, 'entities.json'), JSON.stringify(entities, null, 1));
  fs.writeFileSync(path.join(OUT_DIR, 'objects.json'), JSON.stringify(objects, null, 1));
  fs.writeFileSync(path.join(OUT_DIR, 'others.json'), JSON.stringify(others, null, 1));
  fs.writeFileSync(path.join(OUT_DIR, 'report.txt'), report + '\n');
  console.log(report);
}

if (require.main === module) main();

module.exports = {
  cleanLinkTarget,
  titleKey,
  plainText,
  links,
  sections,
  templateParams,
  parseClass,
  routeList,
  routeSection,
  parsePage,
  buildTitleResolver,
  resolvePageLinks,
  classifyPage,
  main,
};
