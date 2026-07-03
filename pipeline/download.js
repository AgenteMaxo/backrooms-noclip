// Fase 0 — Descarga la wiki de Backrooms (backrooms.fandom.com) en local via API MediaWiki.
// Uso: node pipeline/download.js
// Guarda cada página en data/raw/<pageid>.json y un índice en data/raw/_index.json.
// Re-ejecutable: se salta las páginas ya descargadas.

const fs = require('fs');
const path = require('path');

const API = 'https://backrooms.fandom.com/api.php';
const UA = 'BackroomsRoguelikeDataPipeline/1.0 (proyecto personal; contacto: maximus3blog@gmail.com)';
const RAW_DIR = path.join(__dirname, '..', 'data', 'raw');
const CATEGORIES = ['Levels', 'Entities', 'Objects', 'Phenomena', 'Groups'];
const DELAY_MS = 350;
const BATCH = 50; // máximo de páginas por petición de contenido

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const url = API + '?' + new URLSearchParams({ format: 'json', ...params });
  for (let intento = 1; intento <= 5; intento++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (intento === 5) throw e;
      console.warn(`  reintento ${intento} (${e.message})...`);
      await sleep(2000 * intento);
    }
  }
}

// Lista todos los miembros ns=0 de una categoría (paginado con cmcontinue).
async function listCategory(cat) {
  const members = [];
  let cont = {};
  do {
    const data = await api({
      action: 'query',
      list: 'categorymembers',
      cmtitle: `Category:${cat}`,
      cmnamespace: '0',
      cmlimit: '500',
      ...cont,
    });
    members.push(...(data.query?.categorymembers ?? []));
    cont = data.continue ? { cmcontinue: data.continue.cmcontinue } : null;
    await sleep(DELAY_MS);
  } while (cont);
  return members;
}

// Descarga el wikitext de un lote de pageids.
async function fetchBatch(pageids) {
  const data = await api({
    action: 'query',
    prop: 'revisions',
    rvprop: 'content|timestamp',
    rvslots: 'main',
    pageids: pageids.join('|'),
  });
  return Object.values(data.query?.pages ?? {});
}

async function main() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const index = {}; // pageid -> { title, categories: [] }

  for (const cat of CATEGORIES) {
    process.stdout.write(`Listando Category:${cat}... `);
    let members;
    try {
      members = await listCategory(cat);
    } catch (e) {
      console.warn(`no disponible (${e.message}), se omite.`);
      continue;
    }
    console.log(`${members.length} páginas`);
    for (const m of members) {
      if (!index[m.pageid]) index[m.pageid] = { title: m.title, categories: [] };
      index[m.pageid].categories.push(cat);
    }
  }

  const pending = Object.keys(index).filter(
    (id) => !fs.existsSync(path.join(RAW_DIR, `${id}.json`))
  );
  const total = Object.keys(index).length;
  console.log(`\nTotal: ${total} páginas únicas; pendientes de descargar: ${pending.length}`);

  let done = 0;
  for (let i = 0; i < pending.length; i += BATCH) {
    const lote = pending.slice(i, i + BATCH);
    const pages = await fetchBatch(lote);
    for (const p of pages) {
      const rev = p.revisions?.[0];
      const wikitext = rev?.slots?.main?.['*'] ?? rev?.['*'] ?? null;
      if (wikitext == null) {
        console.warn(`  sin contenido: ${p.title} (${p.pageid})`);
        continue;
      }
      fs.writeFileSync(
        path.join(RAW_DIR, `${p.pageid}.json`),
        JSON.stringify(
          {
            pageid: p.pageid,
            title: p.title,
            categories: index[p.pageid]?.categories ?? [],
            timestamp: rev.timestamp,
            wikitext,
          },
          null,
          1
        )
      );
      done++;
    }
    process.stdout.write(`  descargadas ${Math.min(i + BATCH, pending.length)}/${pending.length}\r`);
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(path.join(RAW_DIR, '_index.json'), JSON.stringify(index, null, 1));
  console.log(`\nHecho. ${done} páginas nuevas guardadas en data/raw/. Índice: _index.json`);
}

main().catch((e) => {
  console.error('ERROR FATAL:', e);
  process.exit(1);
});
