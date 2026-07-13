// Minimapa: dibuja SOLO lo explorado (se actualiza cuando el nivel cambia,
// porque forgetExplored borra la memoria). Clic o tecla N para ampliar.
// Con el detector (Object 30) en el inventario, muestra entidades cercanas.
(function () {
  const small = document.getElementById('minimap');
  const bigWrap = document.getElementById('minimap-big');
  const big = document.getElementById('minimap-big-canvas');
  const btnClear = document.getElementById('minimap-clear');

  // Anotaciones manuales del jugador ("X" roja, clic derecho sobre el
  // minimapa ampliado). Viven solo en memoria mientras dura la sesión —
  // una entrada por nivel (clave world.level.id) para no mezclarlas al
  // cambiar de nivel; se conservan si vuelves a ese nivel más tarde.
  // NOTA: en un nivel `infinito` (Level 0) la rejilla es una ventana
  // deslizante — game.js llama a Minimap.desplazarMarcas() en cada
  // desplazarVentana() con el mismo shiftX/shiftY que aplica a jugador,
  // entidades e items, para que las marcas sigan ancladas al sitio del
  // mundo que señalaban (y se descarten si ese sitio queda fuera de la
  // nueva ventana).
  const marcasPorNivel = new Map();
  function marcasDe(levelId) {
    let arr = marcasPorNivel.get(levelId);
    if (!arr) { arr = []; marcasPorNivel.set(levelId, arr); }
    return arr;
  }

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

    // (las salidas NO se muestran: hay que encontrarlas explorando)

    // entidades (con el detector)
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

    // jugador (pulso)
    const p = world.player;
    const pulso = 1.5 + Math.sin(t / 300) * 0.8;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ox + p.x * S + S / 2, oy + p.y * S + S / 2, Math.max(2, S / 2 + pulso), 0, 7);
    ctx.fill();
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
      if (window.Sfx) Sfx.play('ui');
    });
  }

  if (btnClear) {
    btnClear.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (lastWorld && lastWorld.level) marcasDe(lastWorld.level.id).length = 0;
      if (window.Sfx) Sfx.play('ui');
    });
  }

  // llamado desde desplazarVentana() (game.js) con el mismo shift que se
  // aplica a jugador/entidades/items: las marcas se mueven con el mundo y
  // las que quedan fuera de la nueva ventana se descartan (ya no señalan
  // nada visible).
  function desplazarMarcas(levelId, shiftX, shiftY, w, h) {
    const arr = marcasPorNivel.get(levelId);
    if (!arr || !arr.length) return;
    const dentro = [];
    for (const m of arr) {
      m.x -= shiftX; m.y -= shiftY;
      if (m.x >= 0 && m.y >= 0 && m.x < w && m.y < h) dentro.push(m);
    }
    marcasPorNivel.set(levelId, dentro);
  }

  window.Minimap = {
    frame(world, t) {
      if (!world.level || !world.map) return;
      lastWorld = world;
      // v15: no hay minimapa en pantalla — el mapa solo existe al pulsar M
      if (small) render(small, world, t);
      if (bigVisible) render(big, world, t);
    },
    toggleBig,
    desplazarMarcas,
    get visible() { return bigVisible; },
  };
})();
