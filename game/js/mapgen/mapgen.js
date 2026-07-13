// Generación procedural de mapas por arquetipo de bioma.
// Tiles: 0 suelo · 1 pared · 2 vacío (abismo) · 3 agua · 4 suelo decorado
(function () {
  const T = { SUELO: 0, PARED: 1, VACIO: 2, AGUA: 3, DECOR: 4 };

  function grid(w, h, fill) {
    return { w, h, t: new Uint8Array(w * h).fill(fill) };
  }
  const at = (g, x, y) => (x < 0 || y < 0 || x >= g.w || y >= g.h ? T.PARED : g.t[y * g.w + x]);
  const set = (g, x, y, v) => { if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.t[y * g.w + x] = v; };
  const walkable = (v) => v === T.SUELO || v === T.DECOR;

  // ---------- arquetipos ----------

  // Laberinto denso con salas abiertas (Level 0, 27, 130, 483...)
  // v11: se genera a 1/3 de resolución y se escala ×3 → pasillos de 3 huecos
  // (cabe un mueble de 1 tile y quedan 2 libres).
  function genPasillos(w, h, rng, opts = {}) {
    const hw = Math.ceil(w / 3), hh = Math.ceil(h / 3);
    const small = grid(hw, hh, T.PARED);
    const cw = Math.floor((hw - 1) / 2), ch = Math.floor((hh - 1) / 2);
    const seen = new Set();
    const stack = [[0, 0]];
    seen.add('0,0');
    set(small, 1, 1, T.SUELO);
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const dirs = rng.shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]]);
      let moved = false;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch || seen.has(nx + ',' + ny)) continue;
        seen.add(nx + ',' + ny);
        set(small, cx * 2 + 1 + dx, cy * 2 + 1 + dy, T.SUELO);
        set(small, nx * 2 + 1, ny * 2 + 1, T.SUELO);
        stack.push([nx, ny]);
        moved = true;
        break;
      }
      if (!moved) stack.pop();
    }
    // escala ×3 al tamaño real, con borde exterior de pared
    const g = grid(w, h, T.PARED);
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++)
        g.t[y * w + x] = small.t[((y / 3) | 0) * hw + ((x / 3) | 0)];
    // abre salas y atajos para que respire
    const salas = opts.salas ?? 8;
    const minW = opts.salaMinW ?? 3, maxW = opts.salaMaxW ?? 6;
    const minH = opts.salaMinH ?? 3, maxH = opts.salaMaxH ?? 5;
    const separacion = opts.separacionSalas ?? 0;
    const rects = [];
    for (let creadas = 0, intentos = 0; creadas < salas && intentos < salas * 16; intentos++) {
      const rw = rng.int(minW, maxW), rh = rng.int(minH, maxH);
      const rx = rng.int(1, w - rw - 2), ry = rng.int(1, h - rh - 2);
      const piezas = [{ x: rx, y: ry, w: rw, h: rh }];
      // Level 0: algunas salas reciben un anexo desplazado. Solo se ABRE suelo,
      // nunca se cierran corredores existentes, por lo que no rompe conectividad.
      if (opts.irregulares && rng.chance(0.55)) {
        const aw = rng.int(2, Math.max(2, Math.floor(rw * 0.7)));
        const ah = rng.int(2, Math.max(2, Math.floor(rh * 0.7)));
        const ax = Math.max(1, Math.min(w - aw - 2,
          rx + rng.pick([-Math.floor(aw * 0.6), rw - Math.floor(aw * 0.4)])));
        const ay = Math.max(1, Math.min(h - ah - 2,
          ry + rng.int(0, Math.max(0, rh - ah))));
        piezas.push({ x: ax, y: ay, w: aw, h: ah });
      }
      const x0 = Math.min(...piezas.map((r) => r.x));
      const y0 = Math.min(...piezas.map((r) => r.y));
      const x1 = Math.max(...piezas.map((r) => r.x + r.w));
      const y1 = Math.max(...piezas.map((r) => r.y + r.h));
      const union = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      const solapa = rects.some((r) =>
        union.x < r.x + r.w + separacion && union.x + union.w + separacion > r.x &&
        union.y < r.y + r.h + separacion && union.y + union.h + separacion > r.y);
      if (solapa) continue;
      for (const p of piezas)
        for (let y = p.y; y < p.y + p.h; y++)
          for (let x = p.x; x < p.x + p.w; x++) set(g, x, y, T.SUELO);
      rects.push(union);
      creadas++;
    }
    for (let i = 0; i < (opts.atajos ?? w); i++) {
      const x = rng.int(2, w - 3), y = rng.int(2, h - 3);
      if (at(g, x, y) === T.PARED &&
        ((walkable(at(g, x - 1, y)) && walkable(at(g, x + 1, y))) ||
         (walkable(at(g, x, y - 1)) && walkable(at(g, x, y + 1)))))
        if (rng.chance(0.4)) set(g, x, y, T.SUELO);
    }
    return { grid: g, rects };
  }

  // Espacio abierto con pilares (Level 1)
  function genGaraje(w, h, rng) {
    const g = grid(w, h, T.SUELO);
    for (let x = 0; x < w; x++) { set(g, x, 0, T.PARED); set(g, x, h - 1, T.PARED); }
    for (let y = 0; y < h; y++) { set(g, 0, y, T.PARED); set(g, w - 1, y, T.PARED); }
    for (let y = 4; y < h - 4; y += rng.int(5, 7))
      for (let x = 4; x < w - 4; x += rng.int(5, 7)) {
        set(g, x, y, T.PARED); set(g, x + 1, y, T.PARED);
        set(g, x, y + 1, T.PARED); set(g, x + 1, y + 1, T.PARED);
      }
    // muros parciales y coches (decoración sólida)
    for (let i = 0; i < 10; i++) {
      const x = rng.int(4, w - 8), y = rng.int(4, h - 5), len = rng.int(3, 7);
      if (rng.chance(0.5)) for (let j = 0; j < len; j++) set(g, x + j, y, T.PARED);
      else for (let j = 0; j < len; j++) set(g, x, y + j, T.PARED);
    }
    for (let i = 0; i < 26; i++) set(g, rng.int(2, w - 3), rng.int(2, h - 3), T.DECOR);
    return g;
  }

  // Túneles serpenteantes (Level 2, 268, The Hub, L13) — v11: a 1/3 de
  // resolución escalado ×3 → túneles de 3 de ancho.
  function genTuneles(w, h, rng, opts = {}) {
    const hw = Math.ceil(w / 3), hh = Math.ceil(h / 3);
    const small = grid(hw, hh, T.PARED);
    let x = rng.int(2, hw - 3), y = rng.int(2, hh - 3);
    const walkers = opts.walkers ?? 5;
    for (let k = 0; k < walkers; k++) {
      let wx = x, wy = y, dir = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
      for (let i = 0; i < hw * 4; i++) {
        set(small, wx, wy, T.SUELO);
        if (rng.chance(0.22)) dir = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
        wx = Math.max(1, Math.min(hw - 2, wx + dir[0]));
        wy = Math.max(1, Math.min(hh - 2, wy + dir[1]));
      }
      const floors = collectFloors(small);
      const p = rng.pick(floors); x = p[0]; y = p[1];
    }
    const g = grid(w, h, T.PARED);
    for (let yy = 1; yy < h - 1; yy++)
      for (let xx = 1; xx < w - 1; xx++)
        g.t[yy * w + xx] = small.t[((yy / 3) | 0) * hw + ((xx / 3) | 0)];
    return g;
  }

  // Ala de hospital (Level 14, 16, 188): varias alas horizontales APILADAS
  // (según la altura disponible) unidas por un pasillo vertical, con
  // habitaciones UNIFORMES en "peine" a ambos lados de cada ala (alguna más
  // grande: quirófano/almacén) — más rígido y repetitivo que el BSP orgánico
  // de oficinas, como la planta real de un edificio. El ala central aloja el
  // puesto de enfermería, donde confluye el pasillo vertical.
  function genHospital(w, h, rng) {
    const g = grid(w, h, T.PARED);
    const room = (x, y, rw, rh) => {
      for (let yy = Math.max(1, y); yy < Math.min(h - 1, y + rh); yy++)
        for (let xx = Math.max(1, x); xx < Math.min(w - 1, x + rw); xx++) set(g, xx, yy, T.SUELO);
    };
    const roomW = 5, roomH = 5, paso = roomW + 2;

    // reparte N alas horizontales en el alto disponible (cada una necesita
    // sitio para una fila de habitaciones arriba y otra abajo)
    const yMin = roomH + 3, yMax = h - roomH - 4;
    const nBandas = Math.max(2, Math.min(4, Math.floor((yMax - yMin) / (roomH * 2 + 5)) + 1));
    const bandas = [];
    for (let i = 0; i < nBandas; i++)
      bandas.push(Math.round(yMin + (nBandas === 1 ? 0 : (i * (yMax - yMin)) / (nBandas - 1))));

    const midX = Math.floor(w / 2);
    room(midX - 1, 2, 2, h - 4); // pasillo vertical, de punta a punta
    for (const y of bandas) room(2, y - 1, w - 4, 2); // cada ala horizontal

    const hubBanda = bandas[Math.floor(bandas.length / 2)];
    const hubW = Math.min(w - 10, rng.int(8, 11)), hubH = Math.min(roomH * 2 + 1, rng.int(7, 9));
    const hubX = midX - Math.floor(hubW / 2), hubY = hubBanda - Math.floor(hubH / 2);
    room(hubX, hubY, hubW, hubH); // puesto de enfermería

    const peineH = (y, x0, x1) => {
      for (let x = x0; x + roomW <= x1; x += paso) {
        const rw = rng.chance(0.2) ? roomW + 3 : roomW; // de vez en cuando, quirófano
        const puerta = x + Math.floor(rw / 2);
        if (y - 3 - roomH > 1) { room(x, y - 3 - roomH, rw, roomH); set(g, puerta, y - 2, T.SUELO); }
        if (y + 2 + roomH < h - 1) { room(x, y + 2, rw, roomH); set(g, puerta, y + 1, T.SUELO); }
      }
    };
    for (const y of bandas) {
      if (y === hubBanda) {
        peineH(y, 4, hubX - 2);
        peineH(y, hubX + hubW + 2, w - roomW - 2);
      } else {
        peineH(y, 4, midX - 3);
        peineH(y, midX + 3, w - roomW - 2);
      }
    }
    return g;
  }

  // Habitaciones BSP + corredores (oficinas, hoteles)
  function genOficinas(w, h, rng) {
    const g = grid(w, h, T.PARED);
    const rooms = [];
    function split(x, y, rw, rh, depth) {
      if (depth <= 0 || (rw < 12 && rh < 12)) {
        const pw = rng.int(Math.max(4, rw - 6), rw - 2);
        const ph = rng.int(Math.max(3, rh - 6), rh - 2);
        const px = x + rng.int(1, Math.max(1, rw - pw - 1));
        const py = y + rng.int(1, Math.max(1, rh - ph - 1));
        rooms.push({ x: px, y: py, w: pw, h: ph });
        for (let yy = py; yy < py + ph; yy++)
          for (let xx = px; xx < px + pw; xx++) set(g, xx, yy, T.SUELO);
        return;
      }
      if (rw > rh) {
        const cut = rng.int(Math.floor(rw * 0.35), Math.floor(rw * 0.65));
        split(x, y, cut, rh, depth - 1);
        split(x + cut, y, rw - cut, rh, depth - 1);
      } else {
        const cut = rng.int(Math.floor(rh * 0.35), Math.floor(rh * 0.65));
        split(x, y, rw, cut, depth - 1);
        split(x, y + cut, rw, rh - cut, depth - 1);
      }
    }
    split(1, 1, w - 2, h - 2, 4);
    // conecta habitaciones consecutivas con pasillos en L de 2 de ancho (v11)
    for (let i = 1; i < rooms.length; i++) {
      const a = rooms[i - 1], b = rooms[i];
      let x1 = Math.floor(a.x + a.w / 2), y1 = Math.floor(a.y + a.h / 2);
      const x2 = Math.floor(b.x + b.w / 2), y2 = Math.floor(b.y + b.h / 2);
      while (x1 !== x2) { set(g, x1, y1, T.SUELO); set(g, x1, y1 + 1, T.SUELO); x1 += Math.sign(x2 - x1); }
      while (y1 !== y2) { set(g, x1, y1, T.SUELO); set(g, x1 + 1, y1, T.SUELO); y1 += Math.sign(y2 - y1); }
    }
    return g;
  }

  // Autómata celular: cuevas / exteriores (Level 6, 144, 909, 996)
  function genExterior(w, h, rng, opts = {}) {
    const g = grid(w, h, T.PARED);
    const density = opts.density ?? 0.44;
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++)
        if (!rng.chance(density)) set(g, x, y, T.SUELO);
    for (let it = 0; it < 4; it++) {
      const nt = new Uint8Array(g.t);
      for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
          let walls = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              if (at(g, x + dx, y + dy) === T.PARED) walls++;
          nt[y * g.w + x] = walls >= 5 ? T.PARED : T.SUELO;
        }
      g.t = nt;
    }
    return g;
  }

  // Bosque: claros + arboledas + lagos (Level 45, 186, 626)
  function genBosque(w, h, rng, opts = {}) {
    const g = genExterior(w, h, rng, { density: 0.36 });
    if (opts.lagos) {
      for (let i = 0; i < opts.lagos; i++) {
        const cx = rng.int(6, w - 7), cy = rng.int(6, h - 7), r = rng.int(2, 4);
        for (let y = cy - r; y <= cy + r; y++)
          for (let x = cx - r; x <= cx + r; x++)
            if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && at(g, x, y) === T.SUELO)
              set(g, x, y, T.AGUA);
      }
    }
    for (let i = 0; i < 30; i++) set(g, rng.int(2, w - 3), rng.int(2, h - 3), T.DECOR);
    return g;
  }

  // Invernadero flotante (Level 13): corredores lineales de cristal SOBRE EL
  // VACÍO — «afloat amongst an empty, obscure sky». Nada de laberinto.
  function genInvernadero(w, h, rng) {
    const g = grid(w, h, T.VACIO);
    const carve = (x, y, ancho) => {
      for (let dy = 0; dy < ancho; dy++)
        for (let dx = 0; dx < ancho; dx++)
          set(g, x + dx, y + dy, T.SUELO);
    };
    // corredor principal serpenteante: segmentos rectos largos con quiebros
    let x = 4, y = rng.int(Math.floor(h / 3), Math.floor((h * 2) / 3));
    let dirY = 0;
    const hitos = [[x, y]];
    while (x < w - 8) {
      const largo = rng.int(8, 16);
      for (let i = 0; i < largo && x < w - 5; i++) { carve(x, y, 3); x++; }
      hitos.push([x, y]);
      // quiebro vertical
      dirY = rng.pick([-1, 1]);
      const salto = rng.int(4, 9);
      for (let i = 0; i < salto; i++) {
        const ny = y + dirY;
        if (ny < 3 || ny > h - 7) break;
        y = ny;
        carve(x, y, 3);
      }
      hitos.push([x, y]);
    }
    // pasarelas laterales cortas con mirador
    for (const [hx, hy] of rng.shuffle(hitos).slice(0, 4)) {
      const dir = rng.pick([-1, 1]);
      const largo = rng.int(4, 7);
      for (let i = 1; i <= largo; i++) {
        const ny = hy + dir * i;
        if (ny < 3 || ny > h - 6) break;
        carve(hx, ny, 2);
      }
    }
    // salas-jardín con vegetación
    for (let i = 0; i < 3; i++) {
      const [hx, hy] = rng.pick(hitos);
      const rw = rng.int(6, 9), rh = rng.int(5, 8);
      const rx = Math.max(2, Math.min(w - rw - 2, hx - 2));
      const ry = Math.max(2, Math.min(h - rh - 2, hy - 2));
      for (let yy = ry; yy < ry + rh; yy++)
        for (let xx = rx; xx < rx + rw; xx++)
          set(g, xx, yy, rng.chance(0.18) ? T.DECOR : T.SUELO);
    }
    // paredes de cristal: todo borde del suelo que da al vacío
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        if (at(g, xx, yy) !== T.VACIO) continue;
        const vecinoSuelo = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
          walkable(at(g, xx + dx, yy + dy)));
        if (vecinoSuelo) set(g, xx, yy, T.PARED);
      }
    return g;
  }

  // Ciudad: manzanas sólidas y calles (Level 306, 995)
  function genCiudad(w, h, rng) {
    const g = grid(w, h, T.SUELO);
    for (let x = 0; x < w; x++) { set(g, x, 0, T.PARED); set(g, x, h - 1, T.PARED); }
    for (let y = 0; y < h; y++) { set(g, 0, y, T.PARED); set(g, w - 1, y, T.PARED); }
    let y = 3;
    while (y < h - 6) {
      let x = 3;
      const bh = rng.int(4, 7);
      while (x < w - 6) {
        const bw = rng.int(4, 8);
        if (rng.chance(0.85))
          for (let yy = y; yy < Math.min(y + bh, h - 3); yy++)
            for (let xx = x; xx < Math.min(x + bw, w - 3); xx++) set(g, xx, yy, T.PARED);
        x += bw + rng.int(2, 3);
      }
      y += bh + rng.int(2, 3);
    }
    for (let i = 0; i < 24; i++) {
      const x = rng.int(2, w - 3), yy = rng.int(2, h - 3);
      if (at(g, x, yy) === T.SUELO) set(g, x, yy, T.DECOR);
    }
    return g;
  }

  // Torres: plataformas sobre el vacío unidas por vigas (Level 385)
  function genTorres(w, h, rng) {
    const g = grid(w, h, T.VACIO);
    const plats = [];
    const n = rng.int(9, 12);
    for (let i = 0; i < n; i++) {
      const pw = rng.int(5, 9), ph = rng.int(4, 7);
      const px = rng.int(2, w - pw - 3), py = rng.int(2, h - ph - 3);
      plats.push({ x: px, y: py, w: pw, h: ph });
      for (let y = py; y < py + ph; y++)
        for (let x = px; x < px + pw; x++) set(g, x, y, T.SUELO);
    }
    for (let i = 1; i < plats.length; i++) {
      const a = plats[i - 1], b = plats[i];
      let x1 = Math.floor(a.x + a.w / 2), y1 = Math.floor(a.y + a.h / 2);
      const x2 = Math.floor(b.x + b.w / 2), y2 = Math.floor(b.y + b.h / 2);
      while (x1 !== x2) { if (at(g, x1, y1) === T.VACIO) set(g, x1, y1, T.DECOR); x1 += Math.sign(x2 - x1); }
      while (y1 !== y2) { if (at(g, x1, y1) === T.VACIO) set(g, x1, y1, T.DECOR); y1 += Math.sign(y2 - y1); }
    }
    return g;
  }

  // ---------- utilidades comunes ----------

  function collectFloors(g) {
    const out = [];
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++)
        if (walkable(at(g, x, y))) out.push([x, y]);
    return out;
  }

  // conserva solo el mayor componente conexo de suelo
  function keepLargest(g) {
    const compOf = new Int32Array(g.w * g.h).fill(-1);
    let best = -1, bestSize = 0, comp = 0;
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        if (!walkable(at(g, x, y)) || compOf[y * g.w + x] !== -1) continue;
        let size = 0;
        const q = [[x, y]];
        compOf[y * g.w + x] = comp;
        while (q.length) {
          const [cx, cy] = q.pop();
          size++;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
            if (walkable(at(g, nx, ny)) && compOf[ny * g.w + nx] === -1) {
              compOf[ny * g.w + nx] = comp;
              q.push([nx, ny]);
            }
          }
        }
        if (size > bestSize) { bestSize = size; best = comp; }
        comp++;
      }
    for (let i = 0; i < g.t.length; i++)
      if (walkable(g.t[i]) && compOf[i] !== best)
        g.t[i] = T.PARED;
    return g;
  }

  // distancias BFS desde un punto (para colocar salidas lejos del spawn)
  function bfsDist(g, sx, sy) {
    const d = new Int32Array(g.w * g.h).fill(-1);
    d[sy * g.w + sx] = 0;
    const q = [[sx, sy]];
    let head = 0;
    while (head < q.length) {
      const [cx, cy] = q[head++];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
        if (walkable(at(g, nx, ny)) && d[ny * g.w + nx] === -1) {
          d[ny * g.w + nx] = d[cy * g.w + cx] + 1;
          q.push([nx, ny]);
        }
      }
    }
    return d;
  }

  const GENS = {
    pasillos: (w, h, rng, lv) => {
      const { grid: g, rects } = lv.id === 'level-0'
        ? genPasillos(w, h, rng, {
            salas: 16, salaMinW: 4, salaMaxW: 14,
            salaMinH: 3, salaMaxH: 10, irregulares: true,
            separacionSalas: 3,
            atajos: Math.floor(w * 1.35),
          })
        : genPasillos(w, h, rng);
      g._rects = rects;
      return g;
    },
    garaje: (w, h, rng) => genGaraje(w, h, rng),
    tuneles: (w, h, rng) => genTuneles(w, h, rng, { ancho: true }),
    hospital: (w, h, rng) => genHospital(w, h, rng),
    oficinas: (w, h, rng) => genOficinas(w, h, rng),
    exterior: (w, h, rng) => genExterior(w, h, rng),
    bosque: (w, h, rng, lv) => genBosque(w, h, rng, { lagos: (lv.reglas || []).includes('agua_traicionera') ? 5 : 2 }),
    ciudad: (w, h, rng) => genCiudad(w, h, rng),
    torres: (w, h, rng) => genTorres(w, h, rng),
    invernadero: (w, h, rng) => genInvernadero(w, h, rng),
  };

  // mecánicas de salida derivadas del texto de la wiki (v20): las salidas no
  // son solo puertas — romper paredes agrietadas, caminar hasta perderte…
  function mecanicaDe(s) {
    if (s.mecanica) return s.mecanica;
    const t = (s.texto || '').toLowerCase();
    if (/(romp|quebr|abre)[^.]*(suelo|piso)|suelo (falso|débil|agrietado)/.test(t)) return 'romper_suelo';
    if (/(romp|derrib|golpea|atraviesa|agriet)[^.]*(pared|muro)|pared (falsa|débil|agrietada)/.test(t)) return 'romper';
    if (/caminar sin rumbo|camina[r]? (durante|hasta|lejos)|andar (durante|hasta|sin)|deambul|vagar? (por|durante|hasta)|durante horas|durante días|kilómetros/.test(t)) return 'caminata';
    return null;
  }

  // Las caminatas largas son reproducibles por semilla, pero no idénticas en
  // cada partida. Solo cuentan desplazamientos reales, nunca turnos en espera.
  function walkingGoal(levelDef, runSeed, entry = 1, attempt = 0) {
    const range = levelDef.pasosCaminata || [800, 1200];
    const a = Math.max(1, Math.floor(range[0]));
    const b = Math.max(a, Math.floor(range[1]));
    return RNG.create(`${runSeed}::${levelDef.id}::caminata::${entry}::${attempt}`).int(a, b);
  }

  // Permanencia en la Sala Manila: minutos reales, no turnos ni pasos. `seedKey`
  // ya incluye partida/nivel/instancia — cada nueva estancia en la sala (attempt)
  // vuelve a tirar dentro del rango declarado en la propia salida.
  function manilaGoal(salidaDef, seedKey, attempt = 0) {
    const range = salidaDef.permanenciaS || [180, 300];
    const a = Math.max(1, Math.floor(range[0]));
    const b = Math.max(a, Math.floor(range[1]));
    return RNG.create(`${seedKey}::manila::${attempt}`).int(a, b);
  }

  // ---------- generación completa de un nivel ----------
  function generate(levelDef, rng) {
    let [w, h] = levelDef.tam;
    // v20: los niveles con varias salidas CRECEN — que te sientas perdido de
    // verdad y cada salida quede en su propio rincón del nivel
    const nSal = (levelDef.salidas || []).length;
    // Un nivel infinito conserva el tamaño declarado: es una VENTANA móvil,
    // no un único mapa gigante. Level 0 permanece en 150×150.
    const esc = levelDef.infinito ? 1 : nSal >= 5 ? 1.45 : nSal >= 3 ? 1.25 : 1;
    if (esc > 1) {
      w = Math.min(190, Math.round(w * esc));
      h = Math.min(190, Math.round(h * esc));
    }
    const gen = GENS[levelDef.bioma] ?? GENS.pasillos;
    let g = gen(w, h, rng, levelDef);
    keepLargest(g);
    let floors = collectFloors(g);
    if (floors.length < 60) { // mapa degenerado: reintenta con variante
      const r = genPasillos(w, h, rng, { salas: 10 });
      g = r.grid; g._rects = r.rects;
      keepLargest(g);
      floors = collectFloors(g);
    }

    const spawn = rng.pick(floors);
    const dist = bfsDist(g, spawn[0], spawn[1]);
    const reach = floors.filter(([x, y]) => dist[y * g.w + x] > 0);
    const far = reach.slice().sort((a, b) => dist[b[1] * g.w + b[0]] - dist[a[1] * g.w + a[0]]);

    // salidas (v20): REPARTIDAS por el nivel — cada una elige el punto que
    // maximiza su distancia mínima al spawn Y a las salidas ya colocadas.
    // Se acabaron los racimos de puertas juntas.
    const exits = [];
    const caminatas = []; // salidas SIN casilla: se cruzan caminando mucho
    const usable = [];
    let manilaSalida = null; // salida SIN casilla: se cruza por PERMANENCIA en map.manila
    for (const source of levelDef.salidas || []) {
      if (source.tipo === 'void') continue;
      // Cada aparición tiene estado propio: romper una grieta no abre todas
      // las copias de esa salida en un nivel infinito.
      const s = { ...source, _mec: mecanicaDe(source), _abierta: false };
      if (s.prob !== undefined && !rng.chance(s.prob)) continue;
      if (s._mec === 'caminata') { caminatas.push(s); continue; }
      if (s._mec === 'manila') { manilaSalida = s; continue; }
      usable.push(s);
    }

    // Sala Manila (Level 0): sala rara y tranquila, aparece con probabilidad
    // baja y lejos del spawn — su presencia habilita la mecánica de permanencia
    let manila = null;
    if (manilaSalida && g._rects && g._rects.length && rng.chance(0.2)) {
      const candidatas = g._rects.filter((r) =>
        Math.hypot((r.x + r.w / 2) - spawn[0], (r.y + r.h / 2) - spawn[1]) > 12);
      if (candidatas.length) manila = rng.pick(candidatas);
    }
    // pool ANCHO: toda casilla a más del 45% de la distancia máxima al spawn —
    // cubre regiones opuestas del nivel, no solo el rincón más profundo
    const maxDist = far.length ? dist[far[0][1] * g.w + far[0][0]] : 0;
    const farPool = reach.filter(([x, y]) => dist[y * g.w + x] >= Math.max(12, maxDist * 0.45));
    const conPared = farPool.filter(([x, y]) => at(g, x, y - 1) === T.PARED);
    const sinPared = farPool.filter(([x, y]) => at(g, x, y - 1) !== T.PARED);
    // puertas/grietas EXIGEN pared al norte; trampillas/escaleras van libres
    const esDeSuelo = (s) => s._mec !== 'romper' &&
      /suelo|caer|agujero|fosa|hoyo|trampilla|pozo|precipicio|fall|escalera|ascensor|elevador/i.test(s.texto || '');
    const puestas = [];
    const keyCasilla = (p) => p[1] * g.w + p[0];
    const elegir = (pool) => {
      let best = null, bestScore = -1;
      for (const p of pool) {
        if (puestas.some((q) => Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) < 3)) continue;
        let score = dist[p[1] * g.w + p[0]]; // lejos del spawn…
        for (const q of puestas)             // …y lejos de las otras salidas
          score = Math.min(score, Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]));
        if (score > bestScore) { bestScore = score; best = p; }
      }
      return best;
    };
    for (const s of usable) {
      const pool = esDeSuelo(s)
        ? (sinPared.length ? sinPared : conPared)
        : (conPared.length ? conPared : sinPared);
      const p = elegir(pool);
      if (p) { puestas.push(p); exits.push({ x: p[0], y: p[1], def: s }); }
    }
    const ocupadas = new Set(exits.map((e) => e.y * g.w + e.x));
    const libre = (p) => p && !ocupadas.has(keyCasilla(p));
    const reservar = (p) => { ocupadas.add(keyCasilla(p)); return p; };
    const elegirLibre = (pool) => {
      const libres = pool.filter(libre);
      return libres.length ? rng.pick(libres) : null;
    };

    // objetos
    const items = [];
    for (const o of levelDef.objetos || []) {
      const n = rng.int(o.n[0], o.n[1]);
      for (let i = 0; i < n; i++) {
        const p = elegirLibre(reach);
        if (!p) continue;
        reservar(p);
        items.push({ x: p[0], y: p[1], id: o.id });
      }
    }

    // props decorativos y contenedores registrables por bioma
    const PROPS_BIOMA = {
      pasillos: ['cable'], garaje: ['cono', 'bidon'], tuneles: ['bidon', 'cable'],
      hospital: ['camilla', 'silla'], oficinas: ['silla', 'caja'],
      bosque: ['seta', 'roca_p'], exterior: ['roca_p'], ciudad: ['farola'], torres: ['caja'],
      invernadero: ['silla', 'caja'],
    };
    const CONT_BIOMA = {
      pasillos: 'taquilla', garaje: 'taquilla', tuneles: 'cofre', hospital: 'nevera',
      oficinas: 'archivador', bosque: 'cofre', exterior: 'cofre', ciudad: 'cofre', torres: 'cofre',
      invernadero: 'cofre',
    };
    const props = [];
    // los muebles "de pared" van físicamente pegados a un muro (pared al norte)
    const PROPS_PARED = new Set(['taquilla', 'archivador', 'nevera', 'reloj', 'camilla', 'farola']);
    const conParedNorte = reach.filter(([x, y]) => at(g, x, y - 1) === T.PARED);
    const sitioPara = (id) => {
      const pool = PROPS_PARED.has(id) && conParedNorte.length ? conParedNorte : reach;
      return elegirLibre(pool);
    };
    const decorativos = PROPS_BIOMA[levelDef.bioma] ?? [];
    if (decorativos.length) {
      const n = rng.int(7, 13);
      for (let i = 0; i < n; i++) {
        const id = rng.pick(decorativos);
        const p = sitioPara(id);
        if (!p) continue;
        reservar(p);
        // las cajas de madera SIEMPRE se pueden registrar (v17): nada de
        // decoración que parece un contenedor y frustra al clicarla
        const esCont = id === 'caja';
        props.push({ x: p[0], y: p[1], id, contenedor: esCont, registrado: esCont ? false : undefined });
      }
    }
    const nCont = rng.int(3, 5);
    for (let i = 0; i < nCont; i++) {
      const id = CONT_BIOMA[levelDef.bioma] ?? 'cofre';
      const p = sitioPara(id);
      if (!p) continue;
      reservar(p);
      props.push({ x: p[0], y: p[1], id, contenedor: true, registrado: false });
    }
    // el reloj es exclusivo de Level 80 — SIEMPRE colgado de una pared
    if (levelDef.id === 'level-80') {
      for (let i = 0; i < 6; i++) {
        const p = sitioPara('reloj');
        if (!p) continue;
        reservar(p);
        props.push({ x: p[0], y: p[1], id: 'reloj', contenedor: false });
      }
    }

    // spawns de entidades (fieles a la ficha del nivel), lejos del jugador
    const entitySpawns = [];
    const midPool = reach.filter(([x, y]) => dist[y * g.w + x] >= 8);
    for (const e of levelDef.entidades || []) {
      if (!rng.chance(e.prob ?? 1)) continue;
      const n = rng.int(e.n[0], e.n[1]);
      for (let i = 0; i < n; i++) {
        const p = rng.pick(midPool.length ? midPool : reach);
        entitySpawns.push({ x: p[0], y: p[1], id: e.id });
      }
    }

    return { w, h, grid: g, spawn, exits, items, entitySpawns, props, dist, caminatas, manila, manilaSalida };
  }

  window.MapGen = { T, generate, walkable, at, bfsDist, mecanicaDe, walkingGoal, manilaGoal };
})();
