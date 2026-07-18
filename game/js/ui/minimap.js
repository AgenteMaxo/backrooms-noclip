// Cartografía del errante: minimapa fijo al norte + mapa completo navegable.
// Solo muestra terreno explorado; las salidas siguen ocultas por decisión de diseño.
(function () {
  'use strict';

  const shell = document.getElementById('minimap-shell');
  const small = document.getElementById('minimap');
  const btnSmallOut = document.getElementById('minimap-zoom-out');
  const btnSmallIn = document.getElementById('minimap-zoom-in');
  const bigWrap = document.getElementById('minimap-big');
  const big = document.getElementById('minimap-big-canvas');
  const bigViewport = document.getElementById('minimap-big-viewport');
  const btnClose = document.getElementById('minimap-close');
  const btnMark = document.getElementById('minimap-mark');
  const btnClear = document.getElementById('minimap-clear');
  const levelLabel = document.getElementById('minimap-level');
  const progressLabel = document.getElementById('minimap-progress');

  if (!small || !bigWrap || !big) {
    window.Minimap = {
      frame() {},
      toggleBig() {},
      desplazarMarcas() {},
      get visible() { return false; },
    };
    return;
  }

  const MARCA_KEY = 'backrooms-minimap-marcas';
  const ZOOM_KEY = 'backrooms-minimap-zoom';
  const marcasPorNivel = new Map();
  let lastWorld = null;
  let bigVisible = false;
  let markMode = false;
  let smallZoom = Number(localStorage.getItem(ZOOM_KEY)) || 1;
  let bigZoom = 1;
  let bigPanX = 0;
  let bigPanY = 0;
  let drag = null;
  const activePointers = new Map();
  let pinch = null;
  let lastTap = 0;
  let lastBigTransform = null;

  smallZoom = Math.max(0.7, Math.min(2.2, smallZoom));

  function cargarMarcas() {
    try {
      const raw = localStorage.getItem(MARCA_KEY);
      if (!raw) return;
      for (const [k, arr] of Object.entries(JSON.parse(raw))) {
        if (Array.isArray(arr)) marcasPorNivel.set(k, arr);
      }
    } catch (_) {}
  }

  function guardarMarcas() {
    try {
      const out = {};
      for (const [k, arr] of marcasPorNivel) if (arr.length) out[k] = arr;
      localStorage.setItem(MARCA_KEY, JSON.stringify(out));
    } catch (_) {}
  }

  function claveDe(levelId) {
    return (lastWorld?.runSeed || '') + '::' + levelId;
  }

  function marcasDe(levelId) {
    const k = claveDe(levelId);
    let arr = marcasPorNivel.get(k);
    if (!arr) {
      arr = [];
      marcasPorNivel.set(k, arr);
    }
    return arr;
  }

  function terrenoColor(v) {
    const T = MapGen.T;
    if (v === T.PARED) return 'rgba(205,193,151,.92)';
    if (v === T.AGUA) return 'rgba(70,116,158,.78)';
    if (v === T.DECOR) return 'rgba(124,112,78,.78)';
    return 'rgba(93,86,65,.67)';
  }

  function exploredBounds(world) {
    const g = world.map.grid;
    let minX = g.w, minY = g.h, maxX = -1, maxY = -1, count = 0;
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const i = y * g.w + x;
        if (!world.explored[i]) continue;
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (!count) {
      minX = maxX = Math.floor(world.player.x);
      minY = maxY = Math.floor(world.player.y);
    }
    const pad = 3;
    return {
      minX: Math.max(0, minX - pad),
      minY: Math.max(0, minY - pad),
      maxX: Math.min(g.w - 1, maxX + pad),
      maxY: Math.min(g.h - 1, maxY + pad),
      count,
    };
  }

  function smallTransform(world) {
    const p = world.player;
    const radius = 18 / smallZoom;
    const span = radius * 2;
    const S = Math.max(2, Math.min(small.width, small.height) / span);
    return {
      S,
      ox: small.width / 2 - p.x * S,
      oy: small.height / 2 - p.y * S,
      minX: Math.floor(p.x - radius - 1),
      maxX: Math.ceil(p.x + radius + 1),
      minY: Math.floor(p.y - radius - 1),
      maxY: Math.ceil(p.y + radius + 1),
    };
  }

  function bigTransform(world) {
    const b = exploredBounds(world);
    const cols = Math.max(1, b.maxX - b.minX + 1);
    const rows = Math.max(1, b.maxY - b.minY + 1);
    const base = Math.min((big.width - 56) / cols, (big.height - 56) / rows);
    const S = Math.max(1.2, base * bigZoom);
    const mapW = cols * S;
    const mapH = rows * S;
    return {
      ...b,
      S,
      ox: (big.width - mapW) / 2 - b.minX * S + bigPanX,
      oy: (big.height - mapH) / 2 - b.minY * S + bigPanY,
    };
  }

  function drawMarker(ctx, x, y, S, n) {
    const r = Math.max(4, Math.min(10, S * .46));
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#c65046';
    ctx.strokeStyle = '#f0dd9b';
    ctx.lineWidth = Math.max(1, r * .16);
    ctx.beginPath();
    ctx.arc(0, -r * .25, r * .72, 0, Math.PI * 2);
    ctx.moveTo(-r * .42, r * .22);
    ctx.lineTo(0, r * 1.08);
    ctx.lineTo(r * .42, r * .22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff5d0';
    ctx.font = `bold ${Math.max(7, r * .72)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 0, -r * .28);
    ctx.restore();
  }

  function drawPlayer(ctx, world, tr, t) {
    const p = world.player;
    const ang = world.online
      ? -(Math.PI / 2) + (p.rot || 0)
      : ((p.rot ?? 2) - 1) * Math.PI / 2;
    const x = tr.ox + p.x * tr.S + tr.S / 2;
    const y = tr.oy + p.y * tr.S + tr.S / 2;
    const len = Math.max(5, Math.min(13, tr.S * .8));
    const base = len * .58;
    const pulse = 1 + Math.sin(t / 300) * .08;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = '#fff4c4';
    ctx.strokeStyle = '#17140c';
    ctx.lineWidth = Math.max(1.2, len * .14);
    ctx.beginPath();
    ctx.moveTo(0, -len * pulse);
    ctx.lineTo(-base, base * pulse);
    ctx.lineTo(base, base * pulse);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function render(canvas, world, t, mode) {
    const ctx = canvas.getContext('2d');
    const g = world.map.grid;
    const tr = mode === 'small' ? smallTransform(world) : bigTransform(world);
    if (mode === 'big') lastBigTransform = tr;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#090804';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const minX = Math.max(0, tr.minX);
    const minY = Math.max(0, tr.minY);
    const maxX = Math.min(g.w - 1, tr.maxX);
    const maxY = Math.min(g.h - 1, tr.maxY);
    const T = MapGen.T;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const i = y * g.w + x;
        if (!world.explored[i]) continue;
        const v = g.t[i];
        if (v === T.VACIO) continue;
        ctx.fillStyle = terrenoColor(v);
        const px = tr.ox + x * tr.S;
        const py = tr.oy + y * tr.S;
        ctx.fillRect(px, py, Math.ceil(tr.S + .4), Math.ceil(tr.S + .4));
        if (mode === 'big' && tr.S >= 6) {
          ctx.strokeStyle = 'rgba(15,13,8,.16)';
          ctx.lineWidth = 1;
          ctx.strokeRect(px, py, tr.S, tr.S);
        }
      }
    }

    if (world.hasItem && world.hasItem('detector') && Math.sin(t / 200) > 0) {
      ctx.fillStyle = '#e05046';
      for (const e of world.entities) {
        if (!e.viva) continue;
        if (Math.abs(e.x - world.player.x) + Math.abs(e.y - world.player.y) > 12) continue;
        const r = Math.max(2, tr.S * .38);
        ctx.beginPath();
        ctx.arc(tr.ox + (e.x + .5) * tr.S, tr.oy + (e.y + .5) * tr.S, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const marcas = marcasPorNivel.get(claveDe(world.level.id));
    if (marcas?.length) {
      marcas.forEach((m, i) => {
        drawMarker(ctx, tr.ox + (m.x + .5) * tr.S, tr.oy + (m.y + .5) * tr.S, tr.S, i + 1);
      });
    }

    drawPlayer(ctx, world, tr, t);

    if (mode === 'small') {
      ctx.strokeStyle = 'rgba(226,207,129,.42)';
      ctx.lineWidth = 1;
      ctx.strokeRect(.5, .5, canvas.width - 1, canvas.height - 1);
    }
  }

  function updateMeta(world) {
    if (levelLabel) levelLabel.textContent = world.level?.nombre || world.level?.wikiTitle || 'Mapa';
    if (progressLabel) {
      const b = exploredBounds(world);
      const total = Math.max(1, world.map.grid.w * world.map.grid.h);
      const pct = Math.min(100, Math.round((b.count / total) * 100));
      progressLabel.textContent = `${pct}% cartografiado · ${b.count} casillas`;
    }
  }

  function toggleBig(force) {
    bigVisible = force !== undefined ? !!force : !bigVisible;
    bigWrap.style.display = bigVisible ? 'flex' : 'none';
    bigWrap.setAttribute('aria-hidden', bigVisible ? 'false' : 'true');
    document.body.classList.toggle('mapa-abierto', bigVisible);
    if (bigVisible) {
      bigZoom = 1;
      bigPanX = 0;
      bigPanY = 0;
      markMode = false;
      btnMark?.classList.remove('activo');
      if (lastWorld) {
        updateMeta(lastWorld);
        render(big, lastWorld, performance.now(), 'big');
      }
    }
    if (window.Sfx) Sfx.play('ui');
  }

  function setSmallZoom(next) {
    smallZoom = Math.max(.7, Math.min(2.2, next));
    try { localStorage.setItem(ZOOM_KEY, String(smallZoom)); } catch (_) {}
    shell?.setAttribute('data-zoom', smallZoom.toFixed(2));
    if (lastWorld) render(small, lastWorld, performance.now(), 'small');
  }

  function mapCellFromEvent(ev) {
    if (!lastWorld || !lastBigTransform) return null;
    const rect = big.getBoundingClientRect();
    const px = (ev.clientX - rect.left) * (big.width / rect.width);
    const py = (ev.clientY - rect.top) * (big.height / rect.height);
    const tr = lastBigTransform;
    const x = Math.floor((px - tr.ox) / tr.S);
    const y = Math.floor((py - tr.oy) / tr.S);
    const g = lastWorld.map.grid;
    if (x < 0 || y < 0 || x >= g.w || y >= g.h) return null;
    return { x, y };
  }

  function toggleMarkAt(ev) {
    const cell = mapCellFromEvent(ev);
    if (!cell || !lastWorld?.level) return;
    const marcas = marcasDe(lastWorld.level.id);
    const i = marcas.findIndex((m) => m.x === cell.x && m.y === cell.y);
    if (i >= 0) marcas.splice(i, 1);
    else marcas.push(cell);
    guardarMarcas();
    render(big, lastWorld, performance.now(), 'big');
    if (window.Sfx) Sfx.play('ui');
  }

  cargarMarcas();
  setSmallZoom(smallZoom);

  btnSmallOut?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    setSmallZoom(smallZoom / 1.2);
  });
  btnSmallIn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    setSmallZoom(smallZoom * 1.2);
  });

  small.addEventListener('dblclick', (ev) => {
    ev.preventDefault();
    toggleBig(true);
  });
  small.addEventListener('pointerup', (ev) => {
    if (ev.pointerType === 'mouse') return;
    const now = performance.now();
    if (now - lastTap < 340) toggleBig(true);
    lastTap = now;
  });

  btnClose?.addEventListener('click', () => toggleBig(false));
  bigWrap.addEventListener('click', (ev) => {
    if (ev.target === bigWrap) toggleBig(false);
  });

  btnMark?.addEventListener('click', () => {
    markMode = !markMode;
    btnMark.classList.toggle('activo', markMode);
    bigViewport?.classList.toggle('modo-marca', markMode);
    if (window.Sfx) Sfx.play('ui');
  });

  btnClear?.addEventListener('click', () => {
    if (!lastWorld?.level) return;
    marcasDe(lastWorld.level.id).length = 0;
    guardarMarcas();
    render(big, lastWorld, performance.now(), 'big');
    if (window.Sfx) Sfx.play('ui');
  });

  big.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    toggleMarkAt(ev);
  });

  big.addEventListener('click', (ev) => {
    if (!markMode || drag?.moved) return;
    toggleMarkAt(ev);
  });

  big.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const rect = big.getBoundingClientRect();
    const cx = (ev.clientX - rect.left) * (big.width / rect.width);
    const cy = (ev.clientY - rect.top) * (big.height / rect.height);
    const before = lastBigTransform;
    if (!before) return;
    const wx = (cx - before.ox) / before.S;
    const wy = (cy - before.oy) / before.S;
    bigZoom = Math.max(.55, Math.min(8, bigZoom * (ev.deltaY < 0 ? 1.15 : 1 / 1.15)));
    const after = bigTransform(lastWorld);
    bigPanX += cx - (after.ox + wx * after.S);
    bigPanY += cy - (after.oy + wy * after.S);
    render(big, lastWorld, performance.now(), 'big');
  }, { passive: false });

  function pointerCanvasPoint(clientX, clientY) {
    const rect = big.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (big.width / rect.width),
      y: (clientY - rect.top) * (big.height / rect.height),
    };
  }

  function currentPinch() {
    const pts = [...activePointers.values()];
    if (pts.length < 2) return null;
    const a = pointerCanvasPoint(pts[0].x, pts[0].y);
    const b = pointerCanvasPoint(pts[1].x, pts[1].y);
    return {
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
    };
  }

  big.addEventListener('pointerdown', (ev) => {
    if (markMode) return;
    big.setPointerCapture(ev.pointerId);
    activePointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (activePointers.size === 1) {
      drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, moved: false };
      pinch = null;
    } else if (activePointers.size === 2 && lastWorld && lastBigTransform) {
      const now = currentPinch();
      if (!now) return;
      pinch = {
        dist: now.dist,
        startZoom: bigZoom,
        startPanX: bigPanX,
        startPanY: bigPanY,
        worldX: (now.cx - lastBigTransform.ox) / lastBigTransform.S,
        worldY: (now.cy - lastBigTransform.oy) / lastBigTransform.S,
      };
      drag = null;
    }
  });

  big.addEventListener('pointermove', (ev) => {
    if (!activePointers.has(ev.pointerId) || !lastWorld) return;
    activePointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (activePointers.size >= 2 && pinch) {
      const now = currentPinch();
      if (!now) return;
      bigZoom = Math.max(.55, Math.min(8, pinch.startZoom * now.dist / pinch.dist));
      bigPanX = pinch.startPanX;
      bigPanY = pinch.startPanY;
      const after = bigTransform(lastWorld);
      bigPanX = pinch.startPanX + now.cx - (after.ox + pinch.worldX * after.S);
      bigPanY = pinch.startPanY + now.cy - (after.oy + pinch.worldY * after.S);
      render(big, lastWorld, performance.now(), 'big');
      return;
    }

    if (!drag || drag.id !== ev.pointerId) return;
    const rect = big.getBoundingClientRect();
    const sx = big.width / rect.width;
    const sy = big.height / rect.height;
    const dx = (ev.clientX - drag.x) * sx;
    const dy = (ev.clientY - drag.y) * sy;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    bigPanX += dx;
    bigPanY += dy;
    drag.x = ev.clientX;
    drag.y = ev.clientY;
    render(big, lastWorld, performance.now(), 'big');
  });

  function endDrag(ev) {
    activePointers.delete(ev.pointerId);
    if (drag?.id === ev.pointerId) drag = null;
    pinch = null;
    if (activePointers.size === 1) {
      const [id, p] = activePointers.entries().next().value;
      drag = { id, x: p.x, y: p.y, moved: true };
    }
  }
  big.addEventListener('pointerup', endDrag);
  big.addEventListener('pointercancel', endDrag);

  function desplazarMarcas(levelId, shiftX, shiftY, w, h) {
    const k = claveDe(levelId);
    const arr = marcasPorNivel.get(k);
    if (!arr?.length) return;
    const dentro = [];
    for (const m of arr) {
      const x = m.x - shiftX;
      const y = m.y - shiftY;
      if (x >= 0 && y >= 0 && x < w && y < h) dentro.push({ x, y });
    }
    marcasPorNivel.set(k, dentro);
    guardarMarcas();
  }

  window.Minimap = {
    frame(world, t) {
      if (!world.level || !world.map) return;
      lastWorld = world;
      render(small, world, t, 'small');
      if (bigVisible) {
        updateMeta(world);
        render(big, world, t, 'big');
      }
    },
    toggleBig,
    desplazarMarcas,
    get visible() { return bigVisible; },
  };
})();
