// Controles: detección de dispositivo (teclado+ratón, Xbox, PlayStation) y
// generación de glifos pixel-art para los avisos/atajos del HUD. Los dibujos
// se cachean como dataURL y se inyectan como <img class="icono"> (mismo estilo
// que ui/icons.js). No depende de Three.js: va antes de ui.js/main.js.
(function () {
  const S = 12, P = 3;            // 36×36 px (12 celdas × 3)
  const cache = {};               // clave -> dataURL

  function newCanvas() { const c = document.createElement('canvas'); c.width = c.height = S * P; return c; }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function text(ctx, t, color, font) {
    ctx.fillStyle = color; ctx.font = font || 'bold 16px "Courier New",monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t, 18, 19);
  }
  function face(ctx, color, letter) {
    ctx.clearRect(0, 0, 36, 36);
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(18, 18, 15, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke();
    text(ctx, letter, '#fff');
  }
  function pill(ctx, t, fill) {
    ctx.clearRect(0, 0, 36, 36);
    ctx.fillStyle = fill || '#3a3a40'; rr(ctx, 3, 11, 30, 14, 4); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#111'; rr(ctx, 3, 11, 30, 14, 4); ctx.stroke();
    text(ctx, t, '#fff', 'bold 11px "Courier New",monospace');
  }
  function stick(ctx, t) {
    ctx.clearRect(0, 0, 36, 36);
    ctx.fillStyle = '#2a2a30'; ctx.beginPath(); ctx.arc(18, 18, 13, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#5a5a62'; ctx.stroke();
    ctx.fillStyle = '#cfcfd6'; ctx.beginPath(); ctx.arc(18, 18, 7, 0, Math.PI * 2); ctx.fill();
    text(ctx, t, '#fff', 'bold 11px "Courier New",monospace');
  }
  function dpad(ctx, v) {
    ctx.clearRect(0, 0, 36, 36);
    ctx.fillStyle = '#3a3a40';
    const w = 7;
    rr(ctx, 18 - w / 2, 4, w, 28, 2); ctx.fill();
    rr(ctx, 4, 18 - w / 2, 28, w, 2); ctx.fill();
    ctx.fillStyle = '#e7c20b';
    if (v === 'dup') rr(ctx, 18 - w / 2, 4, w, 14, 2);
    else if (v === 'ddn') rr(ctx, 18 - w / 2, 18, w, 14, 2);
    else if (v === 'dlf') rr(ctx, 4, 18 - w / 2, 14, w, 2);
    else if (v === 'drt') rr(ctx, 18, 18 - w / 2, 14, w, 2);
    ctx.fill();
  }
  function smallRect(ctx, start) {
    ctx.clearRect(0, 0, 36, 36);
    ctx.fillStyle = '#3a3a40'; rr(ctx, 8, 14, 20, 8, 3); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#111'; rr(ctx, 8, 14, 20, 8, 3); ctx.stroke();
    ctx.fillStyle = '#fff';
    if (start) { rr(ctx, 11, 16, 14, 1.6, 0.8); ctx.fill(); rr(ctx, 11, 20, 14, 1.6, 0.8); ctx.fill(); }
    else { rr(ctx, 11, 18, 14, 1.6, 0.8); ctx.fill(); }
  }
  function key(ctx, label) {
    ctx.clearRect(0, 0, 36, 36);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; rr(ctx, 4, 6, 28, 28, 6); ctx.fill();
    ctx.fillStyle = '#d8d2c2'; rr(ctx, 3, 3, 28, 28, 6); ctx.fill();
    ctx.fillStyle = '#efe9da'; rr(ctx, 3, 3, 28, 11, 6); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#2b271f'; rr(ctx, 3, 3, 28, 28, 6); ctx.stroke();
    const big = ('' + label).length > 1;
    text(ctx, label, '#1c1812', (big ? 'bold 12px' : 'bold 17px') + ' "Courier New",monospace');
  }
  function psCross(ctx) {
    ctx.clearRect(0, 0, 36, 36); ctx.fillStyle = '#d8332f';
    rr(ctx, 15, 5, 6, 26, 1.5); ctx.fill(); rr(ctx, 5, 15, 26, 6, 1.5); ctx.fill();
  }
  function psCircle(ctx) {
    ctx.clearRect(0, 0, 36, 36); ctx.lineWidth = 5; ctx.strokeStyle = '#d8332f';
    ctx.beginPath(); ctx.arc(18, 18, 11, 0, Math.PI * 2); ctx.stroke();
  }
  function psSquare(ctx) {
    ctx.clearRect(0, 0, 36, 36); ctx.lineWidth = 5; ctx.strokeStyle = '#4aa6e6';
    rr(ctx, 7, 7, 22, 22, 2); ctx.stroke();
  }
  function psTri(ctx) {
    ctx.clearRect(0, 0, 36, 36); ctx.lineWidth = 5; ctx.strokeStyle = '#5fc24a';
    ctx.beginPath(); ctx.moveTo(18, 5); ctx.lineTo(30, 29); ctx.lineTo(6, 29); ctx.closePath(); ctx.stroke();
  }
  function gen(ctx, idx) {
    ctx.clearRect(0, 0, 36, 36);
    ctx.fillStyle = '#5a5a62'; ctx.beginPath(); ctx.arc(18, 18, 14, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#222'; ctx.stroke();
    text(ctx, '' + idx, '#fff', 'bold 13px "Courier New",monospace');
  }
  function kbIcon(ctx) {
    ctx.clearRect(0, 0, 36, 36);
    ctx.fillStyle = '#d8d2c2'; rr(ctx, 3, 9, 30, 19, 4); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#2b271f'; rr(ctx, 3, 9, 30, 19, 4); ctx.stroke();
    ctx.fillStyle = '#2b271f';
    for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) rr(ctx, 6 + c * 5.6, 13 + r * 6, 4, 4, 1); ctx.fill();
  }

  // ---- mapas acción -> tecla / botón estándar ----
  const KEYMAP = { interact: 'Space', wait: 'KeyX', light: 'KeyF', handL: 'KeyQ', handR: 'KeyE',
    backpack: 'KeyB', menu: 'Escape', map: 'KeyM', log: 'KeyL', codex: 'KeyC', journal: 'KeyJ', chat: 'KeyT',
    moveF: 'KeyW', moveB: 'KeyS', moveL: 'KeyA', moveR: 'KeyD' };
  const KLABEL = { k_space: 'Esp', k_x: 'X', k_f: 'F', k_q: 'Q', k_e: 'E', k_b: 'B', k_esc: 'Esc',
    k_m: 'M', k_l: 'L', k_c: 'C', k_j: 'J', k_t: 'T', k_w: 'W', k_s: 'S', k_a: 'A', k_d: 'D' };
  const XB = { 0: 'xb_a', 1: 'xb_b', 2: 'xb_x', 3: 'xb_y', 4: 'xb_lb', 5: 'xb_rb', 6: 'xb_lt', 7: 'xb_rt',
    8: 'xb_sel', 9: 'xb_str', 10: 'xb_l3', 11: 'xb_r3', 12: 'xb_dup', 13: 'xb_ddn', 14: 'xb_dlf', 15: 'xb_drt' };
  const PS = { 0: 'ps_cross', 1: 'ps_circle', 2: 'ps_square', 3: 'ps_triangle', 4: 'ps_l1', 5: 'ps_r1',
    6: 'ps_l2', 7: 'ps_r2', 8: 'ps_sel', 9: 'ps_str', 10: 'ps_l3', 11: 'ps_r3', 12: 'ps_dup', 13: 'ps_ddn', 14: 'ps_dlf', 15: 'ps_drt' };
  const XB_NAME = { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'View', 9: 'Menú', 10: 'L3', 11: 'R3', 12: '↑', 13: '↓', 14: '←', 15: '→' };
  const PS_NAME = { 0: '✕', 1: '○', 2: '□', 3: '△', 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2', 8: 'Share', 9: 'Opciones', 10: 'L3', 11: 'R3', 12: '↑', 13: '↓', 14: '←', 15: '→' };
  const NAME = { keyboard: 'Teclado + Ratón', xbox: 'Mando Xbox', playstation: 'Mando PlayStation', generic: 'Mando' };

  function paint(ctx, type, v, idx) {
    if (type === 'keyboard') return key(ctx, KLABEL[v] || '?');
    if (type === 'xbox') {
      switch (v) {
        case 'xb_a': return face(ctx, '#1f9e3a', 'A');
        case 'xb_b': return face(ctx, '#cf2f2f', 'B');
        case 'xb_x': return face(ctx, '#1f5fcf', 'X');
        case 'xb_y': return face(ctx, '#e7c20b', 'Y');
        case 'xb_lb': return pill(ctx, 'LB');
        case 'xb_rb': return pill(ctx, 'RB');
        case 'xb_lt': return pill(ctx, 'LT', '#2a2a30');
        case 'xb_rt': return pill(ctx, 'RT', '#2a2a30');
        case 'xb_sel': return smallRect(ctx, false);
        case 'xb_str': return smallRect(ctx, true);
        case 'xb_l3': return stick(ctx, 'L3');
        case 'xb_r3': return stick(ctx, 'R3');
        default: return dpad(ctx, v);
      }
    }
    if (type === 'playstation') {
      switch (v) {
        case 'ps_cross': return psCross(ctx);
        case 'ps_circle': return psCircle(ctx);
        case 'ps_square': return psSquare(ctx);
        case 'ps_triangle': return psTri(ctx);
        case 'ps_l1': case 'ps_r1': case 'ps_l2': case 'ps_r2':
          return pill(ctx, v === 'ps_l1' ? 'L1' : v === 'ps_r1' ? 'R1' : v === 'ps_l2' ? 'L2' : 'R2', '#2a2a30');
        case 'ps_sel': return smallRect(ctx, false);
        case 'ps_str': return smallRect(ctx, true);
        case 'ps_l3': return stick(ctx, 'L3');
        case 'ps_r3': return stick(ctx, 'R3');
        default: return dpad(ctx, v);
      }
    }
    return gen(ctx, idx); // generic
  }

  function glyphUrl(type, variant, idx) {
    const k = type + ':' + variant + ':' + (idx == null ? '' : idx);
    if (cache[k]) return cache[k];
    const c = newCanvas(); const ctx = c.getContext('2d');
    paint(ctx, type, variant, idx);
    const url = c.toDataURL();
    cache[k] = url; return url;
  }
  function imgEl(type, variant, idx, size) {
    const im = document.createElement('img');
    im.className = 'icono icono-ctrl';
    im.src = glyphUrl(type, variant, idx);
    im.alt = '';
    im.style.width = im.style.height = (size || 16) + 'px';
    im.style.imageRendering = 'pixelated';
    return im;
  }
  function padMap(type) { return type === 'xbox' ? XB : PS; }
  function padName(type) { return type === 'xbox' ? XB_NAME : PS_NAME; }


  // ---- estado del dispositivo activo ----
  let cur = 'keyboard';
  let padType = 'xbox';
  let padConnected = false;
  const listeners = [];
  function detectType(id) {
    if (!id) return 'generic';
    const s = ('' + id).toLowerCase();
    if (/xbox|microsoft|controller \(xbox/.test(s)) return 'xbox';
    if (/dualsense|dualshock|playstation|wireless controller|ps3|ps4|ps5|sony/.test(s)) return 'playstation';
    return 'generic';
  }
  function emit() { for (const fn of listeners) { try { fn(cur); } catch (e) {} } }
  function setDevice(d) { if (d !== cur) { cur = d; emit(); } }

  window.Controllers = {
    detectType,
    current() { return cur; },
    onChange(fn) { if (typeof fn === 'function') listeners.push(fn); },
    setDevice,
    setGamepad(gp) {
      if (!gp) return;
      padConnected = true;
      padType = detectType(gp.id);
      if (cur !== padType) { cur = padType; emit(); }
    },
    clearGamepad() { padConnected = false; setDevice('keyboard'); },
    activeGamepadType() { return padConnected ? padType : 'xbox'; },
    deviceName() { return NAME[cur] || 'Mando'; },
    // glifo para una acción dada (según el dispositivo activo o el forzado)
    glyphImgFor(action, size, typeOverride) {
      const type = typeOverride || cur;
      if (type === 'keyboard') {
        const v = 'k_' + (KEYMAP[action] || 'Space').toLowerCase();
        return imgEl('keyboard', v, null, size);
      }
      if (type === 'generic') {
        const idx = window.OPTS?.gamepadMap?.[action] ?? 0;
        return imgEl('generic', 'gen', idx, size);
      }
      const idx = window.OPTS?.gamepadMap?.[action] ?? 0;
      const v = padMap(type)[idx] || (type === 'xbox' ? 'xb_a' : 'ps_cross');
      return imgEl(type, v, idx, size);
    },
    handGlyph(m, size) { return this.glyphImgFor(m === 0 ? 'handL' : 'handR', size); },
    // glifo de un botón concreto del mando (para la lista de Configurar Mando)
    buttonGlyph(idx, size, typeOverride) {
      const type = typeOverride || this.activeGamepadType();
      if (type === 'generic' || type === 'keyboard') return imgEl('generic', 'gen', idx, size);
      const v = padMap(type)[idx] || (type === 'xbox' ? 'xb_a' : 'ps_cross');
      return imgEl(type, v, idx, size);
    },
    buttonName(idx, typeOverride) {
      const type = typeOverride || this.activeGamepadType();
      if (type === 'keyboard') return 'Tecla';
      return (padName(type)[idx]) || ('B' + idx);
    },
    handKeyText(m) {
      const type = cur;
      if (type === 'keyboard') return m === 0 ? 'Q' : 'E';
      const idx = window.OPTS?.gamepadMap?.[m === 0 ? 'handL' : 'handR'] ?? 0;
      return this.buttonName(idx);
    },
    deviceGlyphImg(size) {
      if (cur === 'keyboard') return imgEl('keyboard', 'k_w', null, size);
      return imgEl(cur, cur === 'xbox' ? 'xb_a' : 'ps_cross', null, size);
    },
  };
})();

