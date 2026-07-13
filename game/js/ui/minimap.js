// Minimapa: dibuja SOLO lo explorado (las salidas NO se muestran: hay que
// encontrarlas explorando — decisión de diseño). El jugador es un TRIÁNGULO
// orientado en la dirección que mira; con el detector (Object 30) en el
// inventario se ven entidades cercanas. Las marcas manuales (X roja) se
// guardan en localStorage POR PARTIDA (semilla::nivel) para sobrevivir a
// recargas sin contaminar otras runs. Clic o tecla M/N para ampliar.
(function () {
  const small = document.getElementById('minimap');
  const bigWrap = document.getElementById('minimap-big');
  const big = document.getElementById('minimap-big-canvas');
  const btnClear = document.getElementById('minimap-clear');

  // ---- marcas manuales con persistencia en localStorage ----
  // clave = `${runSeed}::${levelId}`: el mapa de un nivel depende de la
  // semilla de la run (o de la sala online), así que las marcas de una
  // partida no valen para otra.
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
  function claveDe(levelId) {
    return (lastWorld?.runSeed || '') + '::' + levelId;
  }
  function marcasDe(levelId) {
    const k = claveDe(levelId);
    let arr = marcasPorNivel.get(k);
    if (!arr) { arr = []; marcasPorNivel.set(k, arr); }
    return arr;
  }
  cargarMarcas();

  // Mismo cálculo que usa render(): lo comparte con el hit-test de clics
  // para que una marca puesta en (tx,ty) caiga siempre en el mismo sitio,
  // aunque el canvas cambie de tamaño (CSS) entre un clic y el siguiente.
  function transform(canvas, g) {
    const S = Math.max(1, Math.floor(Math.min(canvas.width / g.w, canvas.height / g.h)));
    const ox = Math.floor((canvas.width - g.w * S) / 2);
    const oy = Math.floor((canvas.height - g.h * S) / 2);
    return { S, ox, oy };
  }

  let lastWorld = null;

  function render(canvas, world, t) {
    const ctx = canvas.getContext('2d');
    const g = world.map.grid;
    const { S, ox, oy } = transform(canvas, g);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const p = world.player;

    // terreno explorado
    const T = MapGen.T;
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        const idx = y * g.w + x;
        if (!world.explored[idx]) continue;
        const v = g.t[idx];
        if (v === T.VACIO) continue;
        ctx.fillStyle = v === T.PARED ? 'rgba(190,178,140,0.85)'
          : v === T.AGUA ? 'rgba(70,110,150,0.7)'
          : 'rgba(90,84,66,0.55)';
        ctx.fillRect(ox + x * S, oy + y * S, S, S);
      }

    // (las salidas y los objetos del suelo NO se muestran: hay que
    // encontrarlos explorando — no reintroducirlo sin que lo pida el usuario)

    // entidades cercanas (SOLO con el detector, como siempre)
    if (world.hasItem && world.hasItem('detector')) {
      const parp = Math.sin(t / 200) > 0;
      if (parp) {
        ctx.fillStyle = '#e04040';
        for (const e of world.entities) {
          if (!e.viva) continue;
          if (Math.abs(e.x - world.player.x) + Math.abs(e.y - world.player.y) > 12) continue;
          ctx.fillRect(ox + e.x * S - 1, oy + e.y * S - 1, S + 2, S + 2);
        }
      }
    }

    // anotaciones manuales del jugador (X roja)
    const marcas = marcasPorNivel.get(claveDe(world.level.id));
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

    // jugador — triángulo orientado en la dirección que mira
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

  // clic derecho sobre el minimapa ampliado: pone una X en esa casilla, o la
  // quita si ya había una ahí (evita necesitar un modo "borrar" aparte)
  if (big) {
    big.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!lastWorld || !lastWorld.level || !lastWorld.map) return;
      const g = lastWorld.map.grid;
      const rect = big.getBoundingClientRect();
      // el canvas se escala por CSS (max-width/max-height) — reproyectar el
      // clic a la resolución interna del canvas antes de restar ox/oy
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

  // llamado desde desplazarVentana() (game.js) con el mismo shift que se
  // aplica a jugador/entidades/items: las marcas se mueven con el mundo y
  // las que quedan fuera de la nueva ventana se descartan (ya no señalan
  // nada visible). Se re-guarda para que la persistencia siga anclada bien.
  function desplazarMarcas(levelId, shiftX, shiftY, w, h) {
    const k = claveDe(levelId);
    const arr = marcasPorNivel.get(k);
    if (!arr || !arr.length) return;
    const dentro = [];
    for (const m of arr) {
      m.x -= shiftX; m.y -= shiftY;
      if (m.x >= 0 && m.y >= 0 && m.x < w && m.y < h) dentro.push(m);
    }
    marcasPorNivel.set(k, dentro);
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
