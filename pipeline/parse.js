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
  let t = wt;
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
  t = t.replace(/^[=]+.*[=]+$/gm, '');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

// Extrae enlaces internos [[Título]] o [[Título|texto]] (sin File:/Category:/interwiki).
function links(wt) {
  const out = [];
  const re = /\[\[([^|\]#]+)(?:#[^|\]]*)?(?:\|[^\]]*)?\]\]/g;
  let m;
  while ((m = re.exec(wt))) {
    const target = m[1].trim();
    if (/^(File|Category|User|Template|[a-z-]{2,6}):/i.test(target)) continue;
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
    const key = plainText(heads[i].name).toLowerCase().replace(/[^a-z&\s]/g, ' ').replace(/\s+/g, ' ').trim();
    out[key] = (out[key] ?? '') + body;
  }
  return out;
}

// Extrae los parámetros de la primera plantilla cuyo nombre empiece por `prefix`.
function templateParams(wt, prefix) {
  const re = new RegExp('\\{\\{\\s*' + prefix + '[^|}]*', 'i');
  const m = re.exec(wt);
  if (!m) return null;
  // recorta la plantilla completa respetando anidamiento
  let depth = 0, end = m.index;
  for (let i = m.index; i < wt.length - 1; i++) {
    if (wt.startsWith('{{', i)) { depth++; i++; }
    else if (wt.startsWith('}}', i)) { depth--; i++; if (depth === 0) { end = i + 1; break; } }
  }
  const inner = wt.slice(m.index + 2, end - 1);
  const params = {};
  let positional = 0;
  // divide por | ignorando anidamiento de [[ ]] y {{ }}
  let buf = '', d = 0, parts = [];
  for (let i = 0; i < inner.length; i++) {
    if (inner.startsWith('{{', i) || inner.startsWith('[[', i)) { d++; buf += inner[i]; continue; }
    if (inner.startsWith('}}', i) || inner.startsWith(']]', i)) { d--; buf += inner[i]; continue; }
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
  return params;
}

// Extrae la lista de salidas/entradas: viñetas (o párrafos) con sus enlaces.
function routeList(sectionWt) {
  if (!sectionWt) return [];
  const out = [];
  const lines = sectionWt.split('\n');
  for (const line of lines) {
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

// Fallback: busca una línea "pseudo-encabezado" cuyo texto plano sea `word`
// (p. ej. <span ...>'''Exits'''</span>) y devuelve las viñetas que la siguen.
function pseudoSection(wt, word) {
  const lines = wt.split('\n');
  const isMarker = (l, w) => {
    const p = plainText(l).replace(/[^a-z ]/gi, '').trim().toLowerCase();
    return p === w || p === w + ':';
  };
  const start = lines.findIndex((l) => l.length < 400 && !/^[*#]/.test(l.trim()) && isMarker(l, word));
  if (start < 0) return '';
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) { if (out.length) break; else continue; }
    if (/^[*#]/.test(l)) out.push(l);
    else if (out.length) break;
    else if (isMarker(l, 'entrances') || isMarker(l, 'exits')) break;
    else out.push(l); // texto introductorio antes de las viñetas
  }
  return out.join('\n');
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
  const cls = templateParams(wt, 'Class');
  const wikiCats = [...wt.matchAll(/\[\[Category:([^\]|]+)/g)].map((m) => m[1].trim());

  const descriptionWt = secs['description'] ?? secs['_lead'] ?? '';
  const entitiesWt = secs['entities'] ?? secs['entity'] ?? '';
  const exitsWt = secs['exits'] || pseudoSection(wt, 'exits');
  const entrancesWt = secs['entrances'] || pseudoSection(wt, 'entrances');

  return {
    pageid: page.pageid,
    title: page.title,
    displayTitle: dt ? plainText(dt[1]).trim() : page.title,
    apiCategories: page.categories,
    wikiCategories: wikiCats,
    class: cls
      ? {
          template: cls['_name'],
          numeric: cls['1'] ?? null,
          security: cls['security'] ?? null,
          entityLevel: cls['entity'] ?? cls['entity count'] ?? null,
          color: cls['color'] ?? null,
        }
      : null,
    description: plainText(descriptionWt),
    lead: plainText(secs['_lead'] ?? ''),
    entityLinks: [...new Set(links(entitiesWt))],
    allLinks: [...new Set(links(wt))],
    entrances: routeList(entrancesWt),
    exits: routeList(exitsWt),
    image: firstImage(wt),
    url: 'https://backrooms.fandom.com/wiki/' + encodeURIComponent(page.title.replace(/ /g, '_')),
  };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = fs.readdirSync(RAW_DIR).filter((f) => /^\d+\.json$/.test(f));
  const levels = {}, entities = {}, objects = {}, others = {};

  for (const f of files) {
    const page = JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), 'utf8'));
    const parsed = parsePage(page);
    const cats = page.categories ?? [];
    if (cats.includes('Levels')) levels[page.title] = parsed;
    else if (cats.includes('Entities')) entities[page.title] = parsed;
    else if (cats.includes('Objects')) objects[page.title] = parsed;
    else others[page.title] = parsed;
  }

  // Informe de sanidad
  const titles = new Set(Object.keys(levels));
  let sinSalidas = [], enlacesRotos = 0, aristas = 0;
  for (const [t, lv] of Object.entries(levels)) {
    if (!lv.exits.length) sinSalidas.push(t);
    for (const ex of lv.exits)
      for (const target of ex.targets) {
        aristas++;
        if (!titles.has(target)) enlacesRotos++;
      }
  }
  const clases = {};
  for (const lv of Object.values(levels)) {
    const c = lv.class?.security ?? lv.class?.numeric ?? 'desconocida';
    clases[c] = (clases[c] ?? 0) + 1;
  }

  const report = [
    `Niveles: ${Object.keys(levels).length}`,
    `Entidades: ${Object.keys(entities).length}`,
    `Objetos: ${Object.keys(objects).length}`,
    `Otras páginas: ${Object.keys(others).length}`,
    `Aristas de salida totales: ${aristas} (destinos fuera del set de niveles: ${enlacesRotos})`,
    `Niveles sin salidas parseadas: ${sinSalidas.length}`,
    `  ej.: ${sinSalidas.slice(0, 15).join(' | ')}`,
    `Distribución de clases: ${JSON.stringify(clases, null, 1)}`,
  ].join('\n');

  fs.writeFileSync(path.join(OUT_DIR, 'levels.json'), JSON.stringify(levels, null, 1));
  fs.writeFileSync(path.join(OUT_DIR, 'entities.json'), JSON.stringify(entities, null, 1));
  fs.writeFileSync(path.join(OUT_DIR, 'objects.json'), JSON.stringify(objects, null, 1));
  fs.writeFileSync(path.join(OUT_DIR, 'others.json'), JSON.stringify(others, null, 1));
  fs.writeFileSync(path.join(OUT_DIR, 'report.txt'), report);
  console.log(report);
}

main();
