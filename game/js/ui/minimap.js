// Minimapa MEJORADO (v28): dibuja el terreno explorado con icónos de
// SALIDAS (color según tipo), OBJETOS en el suelo, ENTIDADES (por
// hostilidad), marcas manuales (X roja) y el jugador como TRIÁNGULO
// orientado. Las marcas se guardan en localStorage para que sobrevivan
// a recargas. Clic o tecla M/N para ampliar.
(function () {
  const small = document.getElementById('minimap');
  const bigWrap = document.getElementById('minimap-big');
  const big = document.getElementById('minimap-big-canvas');
  const btnClear = document.getElementById('minimap-clear');

  // ---- marcas manuales con persistencia en localStorage ----
  const MARCA_KEY = 'backrooms-minimap-marcas';
  const marcasPorNivel = new Map();
  function cargarMarcas() {
    try {
      const raw = localStorage.getItem(MARCA_KEY);
      if (raw) for (const [k, arr] of Object.entries(JSON.parse(raw)))
        marcasPorNivel.set(k, arr);
    } catch (e) {}
  }
  function guardarMarcas() {
    try {
      const o = {};
      for (const [k, arr] of marcasPorNivel) if (arr.length) o[k] = arr;
      localStorage.setItem(MARCA_KEY, JSON.stringify(o));
    } catch (e) {}
  }
  function marcasDe(levelId) {
    let arr = marcasPorNivel.get(levelId);
    if (!arr) { arr = []; marcasPorNivel.set(levelId, arr); }
    return arr;
  }
  cargarMarcas();

  // ---- transformación mundo → canvas ----
  function transform(canvas, g) {
    const S = Math.max(1, Math.floor(Math.min(canvas.width / g.w, canvas.height / g.h)));
    const ox = Math.floor((canvas.width - g.w * S) / 2);
    const oy = Math.floor((canvas.height - g.h * S) / 2);
    return { S, ox, oy };
  }

  // colores de la hostilidad de una entidad
  function hostility(e) {
    const d = e.def;
    if (d.comportamiento === 'cazador' || d.aggro > 6) return '#e33';
    if (d.aggro > 2 || d.miedo > 5) return '#eb3';
    if (d.dano > 0) return '#e73';
    return '#5b5';
  }

  // color de una salida según su tipo
  const EXIT_COLORS = {
    normal: '#4ad', rara: '#a6a', arriesgada: '#e82',
    caminata: '#4cc', emergencia: '#f44', retorno: '#eb4',
  };

  let lastWorld = null;
  let lastT = 0;

  function render(canvas, world, t) {
    const ctx = canvas.getContext('2d');
    const g = world.map.grid;
    const { S, ox, oy } = transform(canvas, g);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const p = world.player;

    // 1. TERRENO explorado
    const T = MapGen.T;
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        const idx = y * g.w + x;
        if (!world.explored[idx]) continue;
        const v = g.t[idx];
        if (v === T.VACIO) continue;
        if (v === T.PARED) ctx.fillStyle = 'rgba(190,178,140,0.85)';
        else if (v === T.AGUA) ctx.fillStyle = 'rgba(70,110,150,0.7)';
        else ctx.fillStyle = 'rgba(90,84,66,0.55)';
        ctx.fillRect(ox + x * S, oy + y * S, S, S);
      }

    // 2. SALIDAS en tiles explorados (diamante coloreado + label)
    if (S >= 4 && world.map.exits) {
      for (const ex of world.map.exits) {
        const idx = ex.y * g.w + ex.x;
        if (!world.explored[idx] || g.t[idx] === T.PARED) continue;
        const cx = ox + ex.x * S + S / 2, cy = oy + ex.y * S + S / 2;
        const color = EXIT_COLORS[ex.def?.tipo] || '#eee';
        ctx.fillStyle = color;
        const r = Math.max(2, S * 0.38);
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r, cy);
        ctx.lineTo(cx, cy + r);
        ctx.lineTo(cx - r, cy);
        ctx.closePath();
        ctx.fill();
        if (S >= 8 && ex.def) {
          const short = (ex.def.destinoNombre || ex.def.destino || '').replace(/^Level\s+/i, 'L');
          ctx.fillStyle = '#d8d2c2';
          ctx.font = '9px monospace';
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText(short, cx, cy - r - 1);
        }
      }
    }

    // 3. OBJETOS en el suelo (en tiles explorados + visibles)
    if (S >= 3 && world.map.items) {
      for (const it of world.map.items) {
        if (it.taken) continue;
        const idx = it.y * g.w + it.x;
        if (!world.explored[idx] || world.light[idx] < 0.04) continue;
        ctx.fillStyle = '#8cf';
        ctx.fillRect(ox + it.x * S + 2, oy + it.y * S + 2,
                     Math.max(2, S - 4), Math.max(2, S - 4));
      }
    }

    // 4. ENTIDADES — siempre en tiles explorados; detector extiende rango
    const conDetector = world.hasItem && world.hasItem('detector');
    const rangoEnt = conDetector ? 18 : 6;
    if (world.entities && S >= 3) {
      const parp = Math.sin(t / 200) > 0;
      for (const e of world.entities) {
        if (!e.viva) continue;
        const dist = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
        if (dist > rangoEnt) continue;
        const idx = Math.round(e.y) * g.w + Math.round(e.x);
        if (!conDetector && !world.explored[idx]) continue;
        if (!parp && Math.random() > 0.7) continue;
        const cx = ox + e.x * S + S / 2, cy = oy + e.y * S + S / 2;
        ctx.fillStyle = hostility(e);
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(1.5, S * 0.35), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 5. MARCAS manuales (X roja)
    const marcas = marcasPorNivel.get(world.level.id);
    if (marcas && marcas.length) {
      ctx.strokeStyle = '#ff2828';
      ctx.lineWidth = Math.max(2, S * 0.3);
      ctx.lineCap = 'round';
      const r = Math.max(3, S * 0.42);
      for (const m of marcas) {
        const cx = ox + m.x * S + S / 2, cy = oy + m.y * S + S / 2;
        ctx.beginPath();
        ctx.moveTo(cx - r, cy - r);
        ctx.lineTo(cx + r, cy + r);
        ctx.moveTo(cx + r, cy - r);
        ctx.lineTo(cx - r, cy + r);
        ctx.stroke();
      }
    }

    // 6. JUGADOR — triángulo orientado en la dirección que mira
    const ang = world.online
      ? -(Math.PI / 2) + (p.rot || 0)
      : ((p.rot ?? 2) - 1) * Math.PI / 2;
    const pxC = ox + p.x * S + S / 2, pyC = oy + p.y * S + S / 2;
    const trLen = Math.max(3, S * 0.75);
    const trBase = trLen * 0.55;
    const pulso = 1 + Math.sin(t / 280) * 0.15;
    ctx.save();
    ctx.translate(pxC, pyC);
    ctx.rotate(ang);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -trLen * pulso);
    ctx.lineTo(-trBase, trBase * pulso);
    ctx.lineTo(trBase, trBase * pulso);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  let bigVisible = false;
  function toggleBig(force) {
    bigVisible = force !== undefined ? force : !bigVisible;
    bigWrap.style.display = bigVisible ? 'flex' : 'none';
    if (window.Sfx) Sfx.play('ui');
  }

  if (small) small.addEventListener('click', () => toggleBig(true));
  bigWrap.addEventListener('click', () => toggleBig(false));

  // clic derecho sobre el minimapa ampliado: pone/quita una X (con guardado)
  if (big) {
    big.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!lastWorld || !lastWorld.level || !lastWorld.map) return;
      const g = lastWorld.map.grid;
      const rect = big.getBoundingClientRect();
      const px = (ev.clientX - rect.left) * (big.width / rect.width);
      const py = (ev.clientY - rect.top) * (big.height / rect.height);
      const { S, ox, oy } = transform(big, g);
      const tx = Math.floor((px - ox) / S);
      const ty = Math.floor((py - oy) / S);
      if (tx < 0 || ty < 0 || tx >= g.w || ty >= g.h) return;
      const marcas = marcasDe(lastWorld.level.id);
      const i = marcas.findIndex((m) => m.x === tx && m.y === ty);
      if (i >= 0) marcas.splice(i, 1); else marcas.push({ x: tx, y: ty });
      guardarMarcas();
      if (window.Sfx) Sfx.play('ui');
    });
  }

  if (btnClear) {
    btnClear.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (lastWorld && lastWorld.level) {
        marcasDe(lastWorld.level.id).length = 0;
        guardarMarcas();
      }
      if (window.Sfx) Sfx.play('ui');
    });
  }

  // desplazarMarcas: para niveles infinitos; guarda persistencia
  function desplazarMarcas(levelId, shiftX, shiftY, w, h) {
    const arr = marcasPorNivel.get(levelId);
    if (!arr || !arr.length) return;
    const dentro = [];
    for (const m of arr) {
      m.x -= shiftX; m.y -= shiftY;
      if (m.x >= 0 && m.y >= 0 && m.x < w && m.y < h) dentro.push(m);
    }
    marcasPorNivel.set(levelId, dentro);
    guardarMarcas();
  }

  window.Minimap = {
    frame(world, t) {
      if (!world.level || !world.map) return;
      lastWorld = world;
      if (small) render(small, world, t);
      if (bigVisible) render(big, world, t);
    },
    toggleBig,
    desplazarMarcas,
    get visible() { return bigVisible; },
  };
})();
