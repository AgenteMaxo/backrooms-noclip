// Fase 2b — Genera data/game/mapa-piloto.html: mapa INTERACTIVO del grafo del
// piloto. Pasar el ratón por un nivel ilumina sus conexiones (glow); hacer clic
// abre el panel lateral con sus ENTRADAS y SALIDAS, fieles a las mecánicas del
// juego (tipos de salida, riesgo de vacío, caminos sin retorno). Se regenera con:
//   node pipeline/make-map.js

const fs = require('fs');
const path = require('path');

const levels = require(path.join(__dirname, '..', 'data', 'game', 'levels.es.json'));
const OUT = path.join(__dirname, '..', 'data', 'game', 'mapa-piloto.html');

// ---------- disposición: BFS por capas desde level-0 ----------
const depth = { 'level-0': 0 };
const q = ['level-0'];
while (q.length) {
  const u = q.shift();
  for (const s of levels[u].salidas) {
    const v = s.destino;
    if (v && levels[v] && depth[v] === undefined) {
      depth[v] = depth[u] + 1;
      q.push(v);
    }
  }
}
for (const id of Object.keys(levels)) if (depth[id] === undefined) depth[id] = 3;

const cols = {};
for (const [id, d] of Object.entries(depth)) (cols[d] ??= []).push(id);
const maxD = Math.max(...Object.keys(cols).map(Number));

const NW = 200, NH = 68, GX = 150, GY = 26;
const pos = {};
let maxRows = 0;
for (let d = 0; d <= maxD; d++) {
  const list = (cols[d] ?? []).sort((a, b) => levels[a].peligro - levels[b].peligro);
  maxRows = Math.max(maxRows, list.length);
  list.forEach((id, i) => {
    pos[id] = { x: 40 + d * (NW + GX), y: 40 + i * (NH + GY) };
  });
}
const W = 40 * 2 + (maxD + 1) * (NW + GX);
const H = 80 + maxRows * (NH + GY);

const PELIGRO = ['#3fae6a', '#8bb944', '#d9a531', '#e0742c', '#d94a35', '#a12744'];
const colorPeligro = (p) => PELIGRO[Math.max(0, Math.min(5, p))];

// mismas reglas que el juego (game.js→esSinRetorno): caídas irreversibles
const esSinRetorno = (s) =>
  s.sinRetorno === true || s.tipo === 'void' ||
  /agujero|caes |caer |caída|desplom|abismo|pozo|trampilla|no.?clip|desmay|despiert/i.test(s.texto || '');

// mismas regex que el juego (mapgen.js→mecanicaDe): mecánicas de salida derivadas
const mecanicaDe = (s) => {
  if (s.mecanica) return s.mecanica;
  const t = (s.texto || '').toLowerCase();
  if (/(romp|quebr|abre)[^.]*(suelo|piso)|suelo (falso|débil|agrietado)/.test(t)) return 'romper_suelo';
  if (/(romp|derrib|golpea|atraviesa|agriet)[^.]*(pared|muro)|pared (falsa|débil|agrietada)/.test(t)) return 'romper';
  if (/caminar sin rumbo|camina[r]? (durante|hasta|lejos)|andar (durante|hasta|sin)|deambul|vagar? (por|durante|hasta)|durante horas|durante días|kilómetros/.test(t)) return 'caminata';
  return null;
};

const MEC_NOMBRE = {
  romper: 'pared agrietada — ESPACIO para romperla (dado; la tubería ayuda)',
  romper_suelo: 'suelo agrietado — ESPACIO para romperlo (dado; pisotón duele)',
  caminata: 'caminata — se cruza solo tras cientos de pasos reales',
  manila: 'Sala Manila — permanencia de 3-5 minutos reales dentro de la sala',
};
const RITUAL_NOMBRE = {
  nave: 'nave espacial de juguete sobre un pedestal',
  reloj: 'reloj digital 88:88 colgado de la pared',
  vending: 'máquina expendedora (botones «9» y «8»)',
  boton: 'panel de control con botón ESCAPE',
  edificio: 'edificio idéntico a los de la realidad',
  emergencia: 'puerta roja con rótulo EXIT y luz de emergencia',
};

// heurística de PENDIENTES: el texto de la wiki describe una acción o condición
// especial (dormir, beber, manipular, desmayarse…) que hoy se comporta como una
// puerta corriente — candidatas a recibir su propia mecánica más adelante
const PENDIENTE_RE = /desmay|despert|despiert|consciencia|dormir|beber |comer |resbal|manipul|experiment|interactu|montaña rusa|subir dos tramos|permanecer|tropezar|tiembla|condiciones desconocidas|tocar |pulsar /i;

// clasifica una salida: qué tiene ya implementado y qué falta por determinar
function estadoDe(s) {
  const mec = mecanicaDe(s);
  if (mec) return { estado: 'mec', etiqueta: MEC_NOMBRE[mec] ?? mec };
  if (s.ritual) return { estado: 'ritual', etiqueta: RITUAL_NOMBRE[s.ritual] ?? s.ritual };
  if (s.tipo === 'llave') return { estado: 'mec', etiqueta: 'puertas de acero — exigen una Llave de Nivel (un uso)' };
  if (s.tipo === 'void' || s.tipo === 'escape' || s.tipo === 'sellada') return { estado: 'tipo', etiqueta: null };
  if (s.riesgoVoid > 0) return { estado: 'dado', etiqueta: null };
  if (PENDIENTE_RE.test(s.texto || '')) return { estado: 'pendiente', etiqueta: null };
  return { estado: 'estandar', etiqueta: null };
}

// destinos reales de una salida (el sentinel *opciones:a,b conecta con VARIOS)
function destinosDe(s) {
  if (!s.destino) return [];
  if (s.destino.startsWith('*opciones:'))
    return s.destino.slice('*opciones:'.length).split(',').filter((id) => levels[id]);
  return levels[s.destino] ? [s.destino] : [];
}

// ---------- datos embebidos para la interacción ----------
const DATA = {};
for (const [id, lv] of Object.entries(levels)) {
  DATA[id] = {
    id,
    wikiTitle: lv.wikiTitle,
    nombre: lv.nombre,
    clase: lv.clase,
    peligro: lv.peligro,
    bioma: lv.bioma,
    esEscape: !!lv.esEscape,
    url: lv.url,
    salidas: (lv.salidas || []).map((s) => {
      const { estado, etiqueta } = estadoDe(s);
      const opciones = s.destino?.startsWith('*opciones:') ? destinosDe(s) : null;
      return {
        texto: s.texto,
        tipo: s.tipo,
        destino: !opciones && s.destino && levels[s.destino] ? s.destino : null,
        destinoNombre: s.destino === '*aleatoria' ? 'un nivel al azar'
          : s.destino === '*visitada' ? 'un nivel ya visitado'
          : opciones ? null
          : (levels[s.destino]?.wikiTitle ?? null),
        opciones, // varios destinos posibles (el azar elige al cruzar)
        riesgoVoid: s.riesgoVoid || 0,
        sinRetorno: esSinRetorno(s),
        estado,
        etiqueta,
      };
    }),
    entradas: [],
  };
}
for (const [id, lv] of Object.entries(levels)) {
  for (const s of lv.salidas || []) {
    for (const destino of destinosDe(s)) {
      DATA[destino].entradas.push({
        desde: id,
        desdeNombre: lv.wikiTitle,
        texto: s.texto,
        tipo: s.tipo,
        sinRetorno: esSinRetorno(s),
      });
    }
  }
}

// ---------- SVG: aristas + nodos con atributos data-* ----------
let edges = '';
for (const [id, lv] of Object.entries(levels)) {
  const p = pos[id];
  for (const s of lv.salidas || []) {
    for (const destino of destinosDe(s)) {
    const t = pos[destino];
    const x1 = p.x + NW, y1 = p.y + NH / 2, x2 = t.x, y2 = t.y + NH / 2;
    const back = t.x <= p.x;
    const mx = back ? Math.max(x1, x2 + NW) + 70 : (x1 + x2) / 2;
    const clase = `arista t-${s.tipo}${back ? ' vuelta' : ''}`;
    const d = back
      ? `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2 + NW} ${y2}`
      : `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
    edges += `<path class="${clase}" data-from="${id}" data-to="${destino}" d="${d}" marker-end="url(#${back ? 'ab' : 'af'})"/>\n`;
    }
  }
}

let nodes = '';
for (const [id, lv] of Object.entries(levels)) {
  const p = pos[id];
  const esc = lv.esEscape;
  const sub = (lv.nombre.split('«')[1] ?? '').replace('»', '') || lv.clase.split('·')[0].trim();
  // badges de mecánicas: ⚙N = salidas con mecánica especial YA implementada;
  // ❓N = salidas cuyo texto pide una acción especial aún por determinar
  const estados = (lv.salidas || []).map((s) => estadoDe(s).estado);
  const nEsp = estados.filter((e) => e === 'mec' || e === 'ritual' || e === 'dado').length;
  const nPend = estados.filter((e) => e === 'pendiente').length;
  let badges = '';
  if (nEsp) badges += `<text class="badge-ok" x="${NW - 10}" y="22" text-anchor="end">⚙${nEsp}</text>`;
  if (nPend) badges += `<text class="badge-pend" x="${NW - 10}" y="${nEsp ? 40 : 22}" text-anchor="end">❓${nPend}</text>`;
  nodes += `<g class="nodo${esc ? ' escape' : ''}" data-id="${id}" transform="translate(${p.x},${p.y})">
    <rect width="${NW}" height="${NH}" rx="9" stroke="${esc ? '#4ade80' : colorPeligro(lv.peligro)}"/>
    <text class="tt" x="12" y="24">${lv.wikiTitle}${esc ? ' ⭐' : ''}</text>
    <text class="ts" x="12" y="42">${sub}</text>
    <text class="tp" x="12" y="58" fill="${colorPeligro(lv.peligro)}">Peligro ${lv.peligro}/5 · ${lv.bioma}</text>
    ${badges}
  </g>\n`;
}

const leyendaPeligro = [0, 1, 2, 3, 4, 5]
  .map((pn) => `<span><i class="dot" style="background:${colorPeligro(pn)}"></i>Peligro ${pn}</span>`).join('');

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Mapa del piloto — Backrooms</title>
<style>
 :root{
  --amarillo:#d9c66e; --amarillo-osc:#8a7a3d; --hueso:#efe8d0; --gris:#9a9482;
  --panel:#14120d; --borde:#3a352a; --fondo:#0a0906;
 }
 *{box-sizing:border-box}
 body{background:var(--fondo);color:var(--hueso);margin:0;height:100vh;display:flex;flex-direction:column;
  font-family:'Cascadia Mono','Consolas',monospace}
 header{padding:14px 22px 10px;border-bottom:1px solid var(--borde);background:#0d0b07}
 h1{font-size:17px;margin:0 0 4px;color:var(--amarillo);letter-spacing:1px}
 header p{color:var(--gris);margin:0 0 8px;font-size:12px}
 .leg{display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;color:var(--gris);align-items:center}
 .leg span{display:inline-flex;align-items:center;gap:5px}
 .dot{width:11px;height:11px;border-radius:3px;display:inline-block}
 .raya{width:26px;height:0;border-top:2px solid #8a8a9a;display:inline-block}
 .raya.d{border-top-style:dashed}
 .raya.v{border-top-color:#b08a4a}
 #buscar{margin-left:auto;background:#0a0906;border:1px solid var(--borde);color:var(--amarillo);
  font-family:inherit;font-size:12px;padding:5px 10px;width:210px}
 main{flex:1;display:flex;min-height:0}
 .wrap{flex:1;overflow:auto;background:
  radial-gradient(ellipse at 30% 20%, #12100a 0%, #0a0906 70%)}
 aside{width:390px;border-left:1px solid var(--borde);background:var(--panel);
  overflow:auto;padding:18px 20px;flex-shrink:0}
 aside .vacio{color:#6a6455;font-size:13px;line-height:1.6;margin-top:12px}
 aside h2{font-size:16px;color:var(--amarillo);margin:0 0 2px}
 aside .sub{color:var(--gris);font-size:12px;margin:0 0 10px}
 aside h3{font-size:12px;color:var(--gris);letter-spacing:2px;margin:16px 0 6px;
  border-bottom:1px solid var(--borde);padding-bottom:4px}
 .via{background:#0f0e0a;border:1px solid var(--borde);border-left:3px solid #8a8a9a;
  padding:7px 10px;margin-bottom:6px;font-size:12.5px;line-height:1.45}
 .via .dest{color:var(--amarillo);cursor:pointer;text-decoration:underline dotted}
 .via .dest:hover{color:#ffe9a0}
 .via .nota{color:#c88a5a;font-size:11.5px;display:block;margin-top:2px}
 .chip{display:inline-block;font-size:10px;padding:1px 7px;border-radius:8px;margin-left:6px;
  vertical-align:1px;letter-spacing:1px}
 .c-normal{background:#2a2a34;color:#b8b2c8}
 .c-rara{background:#1d2a3a;color:#7ab8e8}
 .c-arriesgada{background:#3a230f;color:#f0a860}
 .c-llave{background:#3a3212;color:#e8d060}
 .c-void{background:#26123a;color:#c090f0}
 .c-escape{background:#123a22;color:#4ade80}
 .c-sellada{background:#222;color:#777;text-decoration:line-through}
 .peligro-badge{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:6px;vertical-align:-1px}
 aside a{color:#7a90a8;font-size:12px}
 .retorno{background:#12100a;border:1px dashed var(--amarillo-osc);color:#b8ad8a;
  padding:7px 10px;font-size:11.5px;line-height:1.45;margin-top:10px}
 /* ------- SVG ------- */
 svg{display:block}
 .arista{fill:none;stroke:#8a8a9a;stroke-opacity:.45;stroke-width:1.6;transition:all .15s}
 .arista.vuelta{stroke:#b08a4a;stroke-opacity:.5}
 .t-rara,.t-arriesgada,.t-llave,.t-void{stroke-dasharray:6 4}
 .t-escape{stroke:#4ade80}
 .arista.lit{stroke:#ffd970;stroke-opacity:1;stroke-width:2.8;
  filter:drop-shadow(0 0 5px rgba(255,217,112,.9))}
 .arista.dim{stroke-opacity:.07}
 .nodo{cursor:pointer}
 .nodo rect{fill:#16141c;stroke-width:2;transition:all .15s}
 .nodo.escape rect{fill:#14261c}
 .nodo .tt{fill:#f0ead6;font-size:14px;font-weight:700}
 .nodo .ts{fill:#b8b2a0;font-size:11px}
 .nodo .tp{font-size:10px;font-weight:600}
 .nodo .badge-ok{fill:#7ade80;font-size:12px;font-weight:700}
 .nodo .badge-pend{fill:#e8b060;font-size:12px;font-weight:700}
 .nodo:hover rect,.nodo.lit rect{filter:drop-shadow(0 0 8px rgba(255,217,112,.7));stroke-width:3}
 .nodo.sel rect{stroke:#ffd970!important;stroke-width:3.5;
  filter:drop-shadow(0 0 12px rgba(255,217,112,.9))}
 .nodo.dim{opacity:.22}
 .nodo.buscado rect{filter:drop-shadow(0 0 10px rgba(122,222,128,.9));stroke:#4ade80!important}
</style>
</head>
<body>
<header>
 <h1>🚪 MAPA DEL PILOTO — Backrooms roguelike</h1>
 <p>Pasa el ratón por un nivel para iluminar sus conexiones · haz CLIC para ver cómo se entra y cómo se sale de él.
 Los badges de cada nivel cuentan sus salidas: ⚙ con mecánica especial ya implementada · ❓ con mecánica aún por determinar.</p>
 <div class="leg">
  ${leyendaPeligro}
  <span><i class="raya"></i>salida normal</span>
  <span><i class="raya d"></i>rara / arriesgada / llave</span>
  <span><i class="raya v"></i>camino de vuelta</span>
  <span>⭐ escape</span>
  <span style="color:#7ade80">⚙ mecánica especial implementada</span>
  <span style="color:#e8b060">❓ mecánica por determinar</span>
  <input id="buscar" type="text" placeholder="buscar nivel… (ej: poolrooms)" spellcheck="false">
 </div>
</header>
<main>
 <div class="wrap">
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
   <defs>
    <marker id="af" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#8a8a9a"/></marker>
    <marker id="ab" markerWidth="9" markerHeight="9" refX="1" refY="4.5" orient="auto"><path d="M9,0 L0,4.5 L9,9 z" fill="#b08a4a"/></marker>
   </defs>
   ${edges}
   ${nodes}
  </svg>
 </div>
 <aside id="panel">
  <p class="vacio">Haz clic en cualquier nivel del mapa para leer su expediente:
  por dónde se ENTRA, por dónde se SALE, y qué riesgos tiene cada camino —
  tal y como funcionan dentro del juego.</p>
 </aside>
</main>
<script>
const DATA = ${JSON.stringify(DATA)};
const PELIGRO = ${JSON.stringify(PELIGRO)};
const TIPO_NOMBRE = { normal:'normal', rara:'rara', arriesgada:'arriesgada', llave:'requiere llave',
  void:'vacío', escape:'ESCAPE', sellada:'sellada (fuera del piloto)', retorno:'retorno' };

const aristas = [...document.querySelectorAll('.arista')];
const nodos = [...document.querySelectorAll('.nodo')];
let seleccion = null;

function resaltar(id) {
  const con = new Set([id]);
  for (const a of aristas) {
    const toca = a.dataset.from === id || a.dataset.to === id;
    a.classList.toggle('lit', toca);
    a.classList.toggle('dim', !toca);
    if (toca) { con.add(a.dataset.from); con.add(a.dataset.to); }
  }
  for (const n of nodos) {
    const esta = con.has(n.dataset.id);
    n.classList.toggle('lit', esta && n.dataset.id !== id);
    n.classList.toggle('dim', !esta);
  }
}
function limpiar() {
  if (seleccion) { resaltar(seleccion); return; }
  for (const a of aristas) a.classList.remove('lit', 'dim');
  for (const n of nodos) n.classList.remove('lit', 'dim');
}

function chip(tipo) {
  return '<span class="chip c-' + tipo + '">' + (TIPO_NOMBRE[tipo] ?? tipo) + '</span>';
}
function mostrarPanel(id) {
  const d = DATA[id];
  const panel = document.getElementById('panel');
  const salidas = d.salidas.map((s) => {
    let dest;
    if (s.opciones) {
      dest = '→ ' + s.opciones.map((o) =>
        '<span class="dest" data-ir="' + o + '">' + (DATA[o]?.wikiTitle ?? o) + '</span>'
      ).join(' o ') + ' (el azar elige al cruzar)';
    } else if (s.destinoNombre) {
      dest = s.destino
        ? '→ <span class="dest" data-ir="' + s.destino + '">' + s.destinoNombre + '</span>'
        : '→ ' + s.destinoNombre;
    } else {
      dest = s.tipo === 'escape' ? '→ LA REALIDAD' : '→ nivel sin cartografiar';
    }
    let notas = '';
    if (s.estado === 'mec' || s.estado === 'ritual')
      notas += '<span class="nota" style="color:#7ade80">⚙ mecánica implementada: ' + s.etiqueta + '</span>';
    if (s.estado === 'pendiente')
      notas += '<span class="nota" style="color:#e8b060">❓ mecánica POR DETERMINAR: el texto describe una acción especial que hoy funciona como una puerta corriente</span>';
    if (s.tipo === 'arriesgada' && s.riesgoVoid > 0)
      notas += '<span class="nota">⚠ camino inestable: ' + Math.round(s.riesgoVoid * 100) + '% de caer al Vacío (dado implementado; el trébol ayuda)</span>';
    if (s.tipo === 'llave') notas += '<span class="nota">🗝 solo se abre con una Llave de Nivel (un uso)</span>';
    if (s.sinRetorno) notas += '<span class="nota">⛔ SIN RETORNO: es una caída — nadie escala eso</span>';
    if (s.tipo === 'sellada') notas += '<span class="nota">⌀ lleva fuera de los niveles del piloto (cordura −2 al intentarlo)</span>';
    if (s.tipo === 'escape') notas += '<span class="nota">⭐ VICTORIA: cruzar aquí termina la partida con éxito</span>';
    return '<div class="via">«' + s.texto + '»' + chip(s.tipo) + '<br>' + dest + notas + '</div>';
  }).join('') || '<div class="via">Sin salidas catalogadas.</div>';

  const entradas = d.entradas.map((e) =>
    '<div class="via">desde <span class="dest" data-ir="' + e.desde + '">' + e.desdeNombre + '</span>' +
    chip(e.tipo) + '<br>«' + e.texto + '»' +
    (e.sinRetorno ? '<span class="nota">⛔ al llegar así NO se abre puerta de vuelta (fue una caída)</span>' : '') +
    '</div>'
  ).join('') || '<div class="via">Nadie llega aquí desde el piloto (nivel de arranque u oculto).</div>';

  panel.innerHTML =
    '<h2><span class="peligro-badge" style="background:' + PELIGRO[d.peligro] + '"></span>' +
    d.wikiTitle + (d.esEscape ? ' ⭐' : '') + '</h2>' +
    '<p class="sub">' + d.nombre + '<br>' + d.clase + ' · Peligro ' + d.peligro + '/5 · bioma: ' + d.bioma + '</p>' +
    '<h3>CÓMO SE ENTRA (' + d.entradas.length + ')</h3>' + entradas +
    '<h3>CÓMO SE SALE (' + d.salidas.length + ')</h3>' + salidas +
    '<div class="retorno">↩ Además, EN PARTIDA: al entrar desde otro nivel queda abierta una puerta de ' +
    'RETORNO en tu punto de aparición (el mundo es persistente) — salvo que llegaras por una caída.</div>' +
    (d.url ? '<p style="margin-top:10px"><a href="' + d.url + '" target="_blank" rel="noopener">ficha original en la wiki ↗</a></p>' : '');

  for (const el of panel.querySelectorAll('[data-ir]'))
    el.addEventListener('click', () => seleccionar(el.dataset.ir, true));
}

function seleccionar(id, centrar) {
  seleccion = id;
  for (const n of nodos) n.classList.toggle('sel', n.dataset.id === id);
  resaltar(id);
  mostrarPanel(id);
  if (centrar) {
    const n = nodos.find((x) => x.dataset.id === id);
    if (n) n.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }
}

for (const n of nodos) {
  n.addEventListener('mouseenter', () => resaltar(n.dataset.id));
  n.addEventListener('mouseleave', limpiar);
  n.addEventListener('click', (ev) => { ev.stopPropagation(); seleccionar(n.dataset.id, false); });
}
document.querySelector('svg').addEventListener('click', () => {
  seleccion = null;
  for (const n of nodos) n.classList.remove('sel');
  limpiar();
  document.getElementById('panel').innerHTML =
    '<p class="vacio">Haz clic en cualquier nivel del mapa para leer su expediente.</p>';
});

// buscador: resalta los niveles cuyo nombre encaje
const buscar = document.getElementById('buscar');
buscar.addEventListener('input', () => {
  const t = buscar.value.trim().toLowerCase();
  for (const n of nodos) {
    const d = DATA[n.dataset.id];
    const hit = t && (d.wikiTitle.toLowerCase().includes(t) || d.nombre.toLowerCase().includes(t) ||
      d.bioma.toLowerCase().includes(t));
    n.classList.toggle('buscado', !!hit);
  }
});
</script>
</body>
</html>`;

fs.writeFileSync(OUT, html);
console.log('Mapa generado:', OUT, `(${Object.keys(levels).length} niveles)`);
