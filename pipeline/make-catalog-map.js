// Genera data/game/mapa.html: explorador navegable del catalogo completo.
'use strict';

const fs = require('fs');
const path = require('path');

const levels = require(path.join(__dirname, '..', 'data', 'game', 'levels.es.json'));
const OUT = path.join(__dirname, '..', 'data', 'game', 'mapa.html');
const DANGER = ['#55b978', '#8ebe55', '#d3b54c', '#df8a3c', '#df5945', '#b83a58'];

const esSinRetorno = (route) =>
  route.sinRetorno === true || route.tipo === 'void' ||
  /agujero|caes |caer |caída|caida|desplom|abismo|pozo|trampilla|no.?clip|desmay|despiert/i.test(route.texto || '');

const mecanicaDe = (route) => {
  if (route.mecanica) return route.mecanica;
  const text = (route.texto || '').toLowerCase();
  if (/(romp|quebr|abre)[^.]*(suelo|piso)|suelo (falso|débil|agrietado)/.test(text)) return 'romper_suelo';
  if (/(romp|derrib|golpea|atraviesa|agriet)[^.]*(pared|muro)|pared (falsa|débil|agrietada)/.test(text)) return 'romper';
  if (/caminar sin rumbo|camina[r]? (durante|hasta|lejos)|andar (durante|hasta|sin)|deambul|vagar? (por|durante|hasta)|durante horas|durante días|kilómetros/.test(text)) return 'caminata';
  return null;
};

const MEC_NAME = {
  romper: 'Pared agrietada: ESPACIO para romperla; la tubería ayuda.',
  romper_suelo: 'Suelo agrietado: ESPACIO para romperlo; el pisotón causa daño.',
  caminata: 'Caminata: se cruza automáticamente tras recorrer la distancia requerida.',
  manila: 'Sala Manila: permanencia de 3–5 minutos reales dentro de la sala.',
};
const RITUAL_NAME = {
  nave: 'Nave espacial de juguete sobre un pedestal.',
  reloj: 'Reloj digital 88:88 colgado de una pared.',
  vending: 'Máquina expendedora: botones «9» y «8».',
  boton: 'Panel de control con botón ESCAPE.',
  edificio: 'Edificio idéntico a los de la realidad.',
  emergencia: 'Puerta roja con rótulo EXIT y luz de emergencia.',
};
const PENDING_RE = /desmay|despert|despiert|consciencia|dormir|beber |comer |resbal|manipul|experiment|interactu|montaña rusa|subir dos tramos|permanecer|tropezar|tiembla|condiciones desconocidas|tocar |pulsar /i;

function routeState(route) {
  const mechanic = mecanicaDe(route);
  if (mechanic) return { state: 'mechanic', label: MEC_NAME[mechanic] || mechanic };
  if (route.ritual) return { state: 'ritual', label: RITUAL_NAME[route.ritual] || route.ritual };
  if (route.tipo === 'llave') return { state: 'mechanic', label: 'Puerta de acero: exige una Llave de Nivel de un solo uso.' };
  if (route.riesgoVoid > 0) return { state: 'dice', label: null };
  if (!['void', 'escape', 'sellada'].includes(route.tipo) && PENDING_RE.test(route.texto || ''))
    return { state: 'pending', label: null };
  return { state: 'standard', label: null };
}

function optionDestinations(route) {
  const destination = String(route.destino || '');
  if (!destination.startsWith('*opciones:')) return [];
  return destination.slice('*opciones:'.length).split(',').filter((id) => levels[id]);
}

const data = {};
for (const [id, level] of Object.entries(levels)) {
  data[id] = {
    id,
    title: level.wikiTitle,
    name: level.nombre,
    className: level.clase,
    danger: level.peligro,
    biome: level.bioma,
    description: level.descripcion,
    generated: !!level.generado,
    escape: !!level.esEscape,
    url: level.url,
    exits: (level.salidas || []).map((route) => {
      const status = routeState(route);
      return {
        id: route.id || null,
        text: route.texto,
        type: route.tipo,
        to: route.destino && levels[route.destino] ? route.destino : null,
        special: String(route.destino || '').startsWith('*') ? route.destino : null,
        options: optionDestinations(route),
        toName: levels[route.destino]?.wikiTitle ||
          (route.destino === '*aleatoria' ? 'Nivel aleatorio' : route.destino === '*visitada' ? 'Nivel visitado' : null),
        risk: route.riesgoVoid || 0,
        oneWay: esSinRetorno(route),
        state: status.state,
        label: status.label,
      };
    }),
    entrances: [],
  };
}
for (const [id, level] of Object.entries(data)) {
  for (const route of level.exits) {
    const destinations = route.options.length ? route.options : route.to ? [route.to] : [];
    for (const destination of destinations) data[destination].entrances.push({
      from: id, fromName: level.title, text: route.text, type: route.type,
      oneWay: route.oneWay, options: route.options.length > 0,
      state: route.state, label: route.label, risk: route.risk,
    });
  }
}

const serialized = JSON.stringify(data).replace(/</g, '\\u003c');
const counts = {
  levels: Object.keys(data).length,
  routes: Object.values(data).reduce((sum, level) => sum + level.exits.filter((route) => route.to || route.special).length, 0),
  handcrafted: Object.values(data).filter((level) => !level.generated).length,
  escapes: Object.values(data).filter((level) => level.escape).length,
};

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mapa de niveles | Backrooms No-Clip</title>
<style>
@font-face{font-family:VT323;src:url('../../game/assets/fonts/VT323-Regular.ttf') format('truetype');font-display:swap}
:root{--bg:#090a08;--surface:#11130f;--surface2:#171a15;--line:#30352b;--text:#e5e4d7;--muted:#929789;--yellow:#d9c768;--focus:#f0db73;--green:#55b978;--danger:#df5945}
*{box-sizing:border-box}html,body{height:100%}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 Consolas,'Cascadia Mono',monospace;overflow:hidden}
button,input,select{font:inherit}button{color:inherit}.shell{height:100%;display:grid;grid-template-rows:64px minmax(0,1fr)}
header{display:flex;align-items:center;gap:22px;padding:10px 18px;border-bottom:1px solid var(--line);background:#0d0f0b}
.brand{min-width:230px}.brand strong{display:block;color:var(--yellow);font:25px/1 VT323,monospace;letter-spacing:0}.brand span{color:var(--muted);font-size:11px}
.stats{display:flex;gap:20px;margin-left:auto}.stat b{display:block;color:var(--text);font-size:15px}.stat span{color:var(--muted);font-size:10px;text-transform:uppercase}.stat.seed b{color:var(--yellow)}
main{display:grid;grid-template-columns:280px minmax(360px,1fr) 390px;min-height:0}
.directory,.detail{background:var(--surface);min-width:0;min-height:0;display:flex;flex-direction:column}.directory{border-right:1px solid var(--line)}.detail{border-left:1px solid var(--line)}
.tools{padding:12px;border-bottom:1px solid var(--line);display:grid;gap:8px}.search{width:100%;height:36px;background:#090a08;border:1px solid #41473a;color:var(--text);padding:0 10px;outline:none}.search:focus{border-color:var(--focus)}
.filters{display:grid;grid-template-columns:1fr 1fr;gap:7px}.filters select{min-width:0;height:32px;background:var(--surface2);border:1px solid var(--line);color:var(--text);padding:0 6px}
.result-count{color:var(--muted);font-size:11px}.level-list{overflow:auto;min-height:0}.level-row{width:100%;min-height:53px;overflow:hidden;border:0;border-bottom:1px solid #252920;background:transparent;text-align:left;padding:8px 11px;display:grid;grid-template-columns:5px minmax(0,1fr) auto;gap:9px;align-items:center;cursor:pointer}.level-row:hover{background:#1a1d17}.level-row.active{background:#25291f}.level-row .bar{width:5px;height:33px;background:var(--risk)}.level-row b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.level-row small{color:var(--muted);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.level-row em{font-style:normal;color:var(--muted);font-size:10px;text-align:right}.level-row .ok{color:#7ade80}.level-row .pending{color:#e8b060}.empty{color:var(--muted);padding:18px}
.graph{position:relative;min-width:0;min-height:0;background:#0b0c09}.graph-head{position:absolute;z-index:2;left:14px;top:12px;padding:6px 9px;border:1px solid var(--line);background:rgba(13,15,11,.94);color:var(--muted);font-size:11px}.graph svg{width:100%;height:100%;display:block}.edge{fill:none;stroke:#596054;stroke-width:1.4}.edge.risky{stroke:#a67a48;stroke-dasharray:5 4}.edge.incoming{stroke:#536c72}.node{cursor:pointer}.node rect{fill:#171a15;stroke:var(--risk);stroke-width:2}.node:hover rect{fill:#22271e;stroke-width:3}.node.center rect{fill:#29291d;stroke:var(--yellow);stroke-width:3}.node text{fill:var(--text);font:12px Consolas,monospace;pointer-events:none}.node .meta{fill:var(--muted);font-size:10px}.overflow text{fill:var(--muted);font:11px Consolas,monospace}
.detail-scroll{min-width:0;overflow:auto;overflow-x:hidden;padding:17px 18px}.level-title{margin:0;color:var(--yellow);font:28px/1 VT323,monospace;letter-spacing:0}.subtitle{margin:2px 0 10px;color:var(--muted);font-size:12px}.badges{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:13px}.badge{border:1px solid var(--line);background:var(--surface2);padding:2px 7px;font-size:10px}.badge.risk{border-color:var(--risk);color:var(--risk)}.description{margin:0;color:#c8cabd;line-height:1.58;white-space:pre-line;overflow-wrap:anywhere}.section-title{margin:19px 0 7px;padding-bottom:5px;border-bottom:1px solid var(--line);color:var(--muted);font-size:11px;text-transform:uppercase}.route{padding:8px 0 9px;border-bottom:1px solid #252920}.route p{margin:0 0 5px;color:#bfc2b4;overflow-wrap:anywhere}.route-line{display:flex;flex-wrap:wrap;align-items:center;gap:7px}.route button{max-width:100%;overflow-wrap:anywhere;border:0;background:transparent;color:var(--yellow);padding:0;cursor:pointer;text-align:left}.route button:hover{text-decoration:underline}.type{font-size:9px;text-transform:uppercase;border:1px solid var(--line);padding:1px 5px;color:var(--muted)}.warning{color:#d99057;font-size:10px;margin-top:3px}.warning.ok{color:#7ade80}.warning.pending{color:#e8b060}.route-options{color:var(--muted);font-size:10px;margin-top:4px}.wiki-link{display:inline-block;margin-top:17px;color:#9db5c6;text-decoration:none}.wiki-link:hover{text-decoration:underline}
@media(max-width:1000px){main{grid-template-columns:240px minmax(0,1fr)}.graph{display:none}.detail{position:static;width:auto;box-shadow:none;border-left:1px solid var(--line)}.stats .stat:nth-child(-n+2){display:none}}
@media(max-width:680px){.shell{grid-template-rows:57px minmax(0,1fr)}header{padding:8px 11px}.brand{min-width:0}.brand span,.stats{display:none}main{grid-template-columns:132px minmax(0,1fr)}.directory{font-size:12px}.tools{padding:8px}.filters{grid-template-columns:1fr}.detail-scroll{padding:14px 11px}.level-title{font-size:24px}.level-row{padding:7px 6px}.level-row em{display:none}}
</style>
</head>
<body>
<div class="shell">
 <header>
  <div class="brand"><strong>MAPA BACKROOMS</strong><span>Catálogo jugable conectado a Fandom</span></div>
  <div class="stats">
   <div class="stat"><b>${counts.levels}</b><span>niveles</span></div>
   <div class="stat"><b>${counts.routes}</b><span>rutas</span></div>
   <div class="stat"><b>${counts.handcrafted}</b><span>artesanales</span></div>
   <div class="stat"><b>${counts.escapes}</b><span>escapes</span></div>
   <div class="stat seed"><b id="daily-day">--</b><span>semilla diaria</span></div>
  </div>
 </header>
 <main>
  <nav class="directory" aria-label="Directorio de niveles">
   <div class="tools">
    <input id="search" class="search" type="search" placeholder="Buscar nivel" autocomplete="off">
    <div class="filters">
     <select id="danger" aria-label="Filtrar por peligro"><option value="">Todo peligro</option><option value="0">Peligro 0</option><option value="1">Peligro 1</option><option value="2">Peligro 2</option><option value="3">Peligro 3</option><option value="4">Peligro 4</option><option value="5">Peligro 5</option></select>
     <select id="biome" aria-label="Filtrar por bioma"><option value="">Todo bioma</option></select>
    </div>
    <span id="result-count" class="result-count"></span>
   </div>
   <div id="level-list" class="level-list"></div>
  </nav>
  <section class="graph" aria-label="Conexiones del nivel seleccionado">
   <div class="graph-head">Entradas a la izquierda · salidas a la derecha</div>
   <svg id="graph" viewBox="0 0 900 700" preserveAspectRatio="xMidYMid meet"></svg>
  </section>
  <aside class="detail"><div id="detail" class="detail-scroll"></div></aside>
 </main>
</div>
<script src="../../game/js/engine/daily-seed.js"></script>
<script src="../../game/js/engine/route-seed.js"></script>
<script>
const DATA=${serialized};
const DANGER=${JSON.stringify(DANGER)};
const TYPE={normal:'normal',rara:'rara',arriesgada:'arriesgada',llave:'llave',void:'vacío',escape:'escape'};
const ids=Object.keys(DATA).sort((a,b)=>DATA[a].title.localeCompare(DATA[b].title,undefined,{numeric:true}));
let dailySeed=DailySeed.seed();
let selected=DATA['level-0']?'level-0':ids[0];
const esc=(s)=>String(s??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list=document.getElementById('level-list');
const detail=document.getElementById('detail');
const graph=document.getElementById('graph');
const search=document.getElementById('search');
const danger=document.getElementById('danger');
const biome=document.getElementById('biome');
const resultCount=document.getElementById('result-count');
const dailyDay=document.getElementById('daily-day');

function resolveExit(sourceId,route){
 if(route.to||!route.special)return route;
 if(route.options&&route.options.length){
  const to=RouteSeed.pick(dailySeed,sourceId,route,route.options);
  return {...route,to,toName:DATA[to].title,rotating:true,optionRoute:true};
 }
 if(route.special==='*aleatoria'){
  const candidates=Object.keys(DATA).filter(id=>id!==sourceId).sort();
  const to=RouteSeed.pick(dailySeed,sourceId,route,candidates);
  return {...route,to,toName:DATA[to].title,rotating:true};
 }
 return {...route,playerDependent:true};
}
function resolvedExits(id){return DATA[id].exits.map(route=>resolveExit(id,route))}
function effectiveEntrances(targetId){
 const result=DATA[targetId].entrances.slice();
 for(const sourceId of ids)for(const route of resolvedExits(sourceId)){
  if(route.special&&(!route.options||!route.options.length)&&route.to===targetId)result.push({from:sourceId,fromName:DATA[sourceId].title,text:route.text,type:route.type,oneWay:route.oneWay,rotating:route.rotating,state:route.state,label:route.label,risk:route.risk});
 }
 return result;
}
function updateDailyCycle(){
 dailyDay.textContent=DailySeed.dayKey();
 dailyDay.title=dailySeed+' | cambia a las 00:00 de Europe/Madrid';
}

for(const value of [...new Set(ids.map(id=>DATA[id].biome))].sort()) biome.insertAdjacentHTML('beforeend','<option>'+esc(value)+'</option>');

function filteredIds(){
 const q=search.value.trim().toLocaleLowerCase();
 return ids.filter(id=>{const l=DATA[id];return(!q||l.title.toLocaleLowerCase().includes(q)||l.name.toLocaleLowerCase().includes(q)||l.description.toLocaleLowerCase().includes(q))&&(!danger.value||String(l.danger)===danger.value)&&(!biome.value||l.biome===biome.value)});
}
function renderList(){
 const visible=filteredIds();resultCount.textContent=visible.length+' de '+ids.length;
 list.innerHTML=visible.map(id=>{const l=DATA[id],ok=l.exits.filter(x=>['mechanic','ritual','dice'].includes(x.state)).length,pending=l.exits.filter(x=>x.state==='pending').length,status=(ok?'<span class="ok">⚙'+ok+'</span> ':'')+(pending?'<span class="pending">❓'+pending+'</span>':'');return '<button class="level-row '+(id===selected?'active':'')+'" data-id="'+id+'" style="--risk:'+DANGER[l.danger]+'"><span class="bar"></span><span><b>'+esc(l.title)+'</b><small>'+esc(l.name)+'</small></span><em>'+resolvedExits(id).filter(x=>x.to).length+' sal.<br>'+status+'</em></button>'}).join('')||'<p class="empty">Sin coincidencias.</p>';
 for(const row of list.querySelectorAll('[data-id]'))row.onclick=()=>select(row.dataset.id);
}
function routeHtml(route,direction){
 const target=direction==='out'?route.to:route.from;
 const targetName=direction==='out'?route.toName:route.fromName;
 const arrow=direction==='out'?'Hacia':'Desde';
 const link=target?'<button data-go="'+target+'">'+esc(targetName)+'</button>':'<span>'+esc(targetName||'La realidad')+'</span>';
 const warnings=[];
 if(route.state==='mechanic'||route.state==='ritual')warnings.push('<div class="warning ok">⚙ Mecánica implementada: '+esc(route.label)+'</div>');
 if(route.state==='pending')warnings.push('<div class="warning pending">❓ Mecánica por determinar: actualmente funciona como una puerta corriente.</div>');
 if(route.rotating)warnings.push('<div class="warning">Destino fijado por la semilla de hoy; cambia a las 00:00.</div>');
 if(route.playerDependent)warnings.push('<div class="warning">El destino depende de los niveles visitados por el jugador.</div>');
 if(route.risk)warnings.push('<div class="warning">Riesgo de Vacío: '+Math.round(route.risk*100)+'% (el trébol ayuda).</div>');
 if(route.oneWay)warnings.push('<div class="warning">Ruta sin retorno natural.</div>');
 const options=direction==='out'&&route.options&&route.options.length?'<div class="route-options">Posibles destinos: '+route.options.map(id=>'<button data-go="'+id+'">'+esc(DATA[id].title)+'</button>').join(' o ')+'</div>':'';
 return '<div class="route"><p>'+esc(route.text)+'</p><div class="route-line"><span class="type">'+esc(TYPE[route.type]||route.type)+'</span> <span>'+arrow+':</span> '+link+'</div>'+options+warnings.join('')+'</div>';
}
function renderDetail(){
 const l=DATA[selected],incoming=effectiveEntrances(selected),outgoing=resolvedExits(selected);
 detail.innerHTML='<h1 class="level-title">'+esc(l.title)+(l.escape?' · ESCAPE':'')+'</h1><p class="subtitle">'+esc(l.name)+'</p><div class="badges"><span class="badge risk" style="--risk:'+DANGER[l.danger]+'">Peligro '+l.danger+'/5</span><span class="badge">'+esc(l.biome)+'</span><span class="badge">'+esc(l.className)+'</span><span class="badge">'+(l.generated?'Ficha procedural':'Ficha artesanal')+'</span></div><p class="description">'+esc(l.description)+'</p><h2 class="section-title">Entradas · '+incoming.length+'</h2>'+((incoming.map(x=>routeHtml(x,'in')).join(''))||'<p class="empty">Sin entradas documentadas ni rutas diarias hacia esta sala.</p>')+'<h2 class="section-title">Salidas · '+outgoing.length+'</h2>'+((outgoing.map(x=>routeHtml(x,'out')).join(''))||'<p class="empty">Sin salidas documentadas. Al llegar, el camino de entrada permanece abierto para retroceder.</p>')+(l.url?'<a class="wiki-link" href="'+esc(l.url)+'" target="_blank" rel="noopener">Abrir ficha original en Fandom</a>':'');
 for(const button of detail.querySelectorAll('[data-go]'))button.onclick=()=>select(button.dataset.go);
}
function node(id,x,y,kind){const l=DATA[id];const w=kind==='center'?190:160,h=kind==='center'?58:48,ok=l.exits.filter(r=>['mechanic','ritual','dice'].includes(r.state)).length,pending=l.exits.filter(r=>r.state==='pending').length,status=(ok?' · ⚙'+ok:'')+(pending?' · ❓'+pending:'');return '<g class="node '+kind+'" data-id="'+id+'" style="--risk:'+DANGER[l.danger]+'" transform="translate('+(x-w/2)+','+(y-h/2)+')"><rect width="'+w+'" height="'+h+'" rx="4"/><text x="10" y="20">'+esc(l.title.length>22?l.title.slice(0,21)+'…':l.title)+'</text><text class="meta" x="10" y="'+(kind==='center'?41:37)+'">Peligro '+l.danger+' · '+esc(l.biome)+status+'</text></g>'}
function renderGraph(){
 const l=DATA[selected];const allIncoming=effectiveEntrances(selected),allOutgoing=resolvedExits(selected).filter(x=>x.to);const incoming=[...new Map(allIncoming.map(x=>[x.from,x])).values()].slice(0,12);const outgoing=[...new Map(allOutgoing.map(x=>[x.to,x])).values()].slice(0,12);let edges='';let nodes=node(selected,450,350,'center');
 const place=(arr,x,kind)=>arr.map((route,i)=>{const y=(i+1)*700/(arr.length+1);const id=kind==='incoming'?route.from:route.to;const start=kind==='incoming'?[x+80,y]:[545,350];const end=kind==='incoming'?[355,350]:[x-80,y];edges+='<path class="edge '+kind+(route.type==='arriesgada'||route.type==='rara'?' risky':'')+'" d="M '+start[0]+' '+start[1]+' C '+(kind==='incoming'?250:650)+' '+start[1]+', '+(kind==='incoming'?250:650)+' '+end[1]+', '+end[0]+' '+end[1]+'"/>';return node(id,x,y,kind)}).join('');
 nodes+=place(incoming,120,'incoming')+place(outgoing,780,'outgoing');
 const extraIn=Math.max(0,allIncoming.length-incoming.length),extraOut=Math.max(0,allOutgoing.length-outgoing.length);if(extraIn)nodes+='<g class="overflow"><text x="35" y="685">+'+extraIn+' entradas en el expediente</text></g>';if(extraOut)nodes+='<g class="overflow"><text x="705" y="685">+'+extraOut+' salidas en el expediente</text></g>';
 graph.innerHTML='<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#596054"/></marker></defs><g marker-end="url(#arrow)">'+edges+'</g>'+nodes;
 for(const el of graph.querySelectorAll('[data-id]'))el.onclick=()=>select(el.dataset.id);
}
function select(id){if(!DATA[id])return;selected=id;renderList();renderDetail();renderGraph();history.replaceState(null,'','#'+encodeURIComponent(id));const active=list.querySelector('.active');if(active)active.scrollIntoView({block:'nearest'});}
for(const input of [search,danger,biome])input.addEventListener('input',renderList);
const initial=decodeURIComponent(location.hash.slice(1));if(DATA[initial])selected=initial;
updateDailyCycle();
select(selected);
setInterval(()=>{const next=DailySeed.seed();if(next===dailySeed)return;dailySeed=next;updateDailyCycle();select(selected)},30000);
</script>
</body>
</html>`;

fs.writeFileSync(OUT, html);
console.log(`Mapa generado: ${OUT} (${counts.levels} niveles, ${counts.routes} rutas).`);
