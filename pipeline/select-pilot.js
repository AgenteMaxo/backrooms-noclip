// Fase 2a — Selecciona los niveles del piloto:
//   BFS desde Level 0 + el camino más corto hasta un nivel de escape.
// Produce data/game/pilot-titles.json con la lista y metadatos de conexión.
// Uso: node pipeline/select-pilot.js

const fs = require('fs');
const path = require('path');

const levels = require(path.join(__dirname, '..', 'data', 'parsed', 'levels.json'));
const OUT = path.join(__dirname, '..', 'data', 'game');
const TARGET_SIZE = 30;

// Niveles cuyo texto de salida menciona escapar a la realidad (verificado en el parseo).
const ESCAPE_LEVELS = ['Level 385', 'Level 150', 'Level 983', 'Level 350'];

// Grafo: título -> títulos destino (solo niveles existentes en el set)
const adj = {};
for (const [t, lv] of Object.entries(levels)) {
  adj[t] = [...new Set(lv.exits.flatMap((e) => e.targets).filter((x) => levels[x]))];
}

function bfs(start) {
  const dist = { [start]: 0 };
  const prev = {};
  const q = [start];
  while (q.length) {
    const u = q.shift();
    for (const v of adj[u] ?? []) {
      if (dist[v] === undefined) {
        dist[v] = dist[u] + 1;
        prev[v] = u;
        q.push(v);
      }
    }
  }
  return { dist, prev };
}

const { dist, prev } = bfs('Level 0');

// Camino más corto hasta el escape alcanzable más cercano
const reachableEscapes = ESCAPE_LEVELS.filter((e) => dist[e] !== undefined).sort(
  (a, b) => dist[a] - dist[b]
);
if (!reachableEscapes.length) throw new Error('Ningún nivel de escape alcanzable desde Level 0');
const escape = reachableEscapes[0];
const escapePath = [];
for (let u = escape; u !== undefined; u = prev[u]) escapePath.unshift(u);

// Piloto: niveles más cercanos a Level 0 (por capas BFS) + camino de escape completo
const byDepth = Object.entries(dist).sort((a, b) => a[1] - b[1]).map(([t]) => t);
const pilot = new Set(escapePath);
for (const t of byDepth) {
  if (pilot.size >= TARGET_SIZE) break;
  pilot.add(t);
}

const result = {
  generated: new Date().toISOString(),
  escapeLevel: escape,
  escapePath,
  titles: [...pilot].map((t) => ({
    title: t,
    depth: dist[t],
    exitsInPilot: (adj[t] ?? []).filter((x) => pilot.has(x)),
    exitsOutside: (adj[t] ?? []).filter((x) => !pilot.has(x)),
    class: levels[t].class,
    cats: levels[t].wikiCategories,
  })),
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'pilot-titles.json'), JSON.stringify(result, null, 1));

console.log(`Escape elegido: ${escape} (distancia ${dist[escape]})`);
console.log(`Camino: ${escapePath.join(' → ')}`);
console.log(`Piloto: ${pilot.size} niveles`);
for (const t of result.titles)
  console.log(
    ` d${t.depth} ${t.title.padEnd(28)} salidas dentro: ${t.exitsInPilot.length}, fuera: ${t.exitsOutside.length}`
  );
