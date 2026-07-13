// Render cenital v3: paredes finas con autotiling y cara frontal, sprites
// pixel-art, props, efectos de combate y oscuridad estilo Darkwood.
(function () {
  const { T } = MapGen;
  let TILE, canvas, ctx, W, H, grain;

  function init(c) {
    TILE = Tiles.TILE;
    canvas = c;
    ctx = c.getContext('2d');
    W = c.width; H = c.height;
    grain = document.createElement('canvas');
    grain.width = 256; grain.height = 256;
    const gctx = grain.getContext('2d');
    const img = gctx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 22;
    }
    gctx.putImageData(img, 0, 0);
  }

  // ---------- entidades ----------
  // (x, y) = esquina superior izquierda de una caja de 48px; el sprite se centra
  function drawEntity(e, x, y, lit, t) {
    const def = e.def;
    const cx = x + 24, cy = y + 24;
    const frame = Math.floor(t / 280) % Sprites.frameCount(def.glyph);
    const sprite = Sprites.get(def.glyph, frame);

    // Smiler: solo ojos y sonrisa brillando en la oscuridad
    if (def.glyph === 'smiler' && !sprite) {
      ctx.save();
      const glow = lit < 0.45 ? 1 : 0.25;
      ctx.globalAlpha = Math.max(0.15, glow);
      ctx.shadowColor = def.color; ctx.shadowBlur = 14 * glow;
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.arc(cx - 8, cy - 6, 3.2, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 8, cy - 6, 3.2, 0, 7); ctx.fill();
      ctx.strokeStyle = def.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy + 2, 11, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      ctx.restore();
      return;
    }
    // emboscada sin revelar: bulto apenas visible
    if (!e.revelada && def.comportamiento === 'emboscada') {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.ellipse(cx, cy + 8, 13, 8, 0, 0, 7); ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0.25, Math.min(1, lit + 0.25));
    const filtros = [];
    if (e._hitT && t - e._hitT < 170) filtros.push('brightness(2.4)');
    if (e.paralizada > 0) filtros.push('hue-rotate(160deg) saturate(1.6) brightness(1.25)');
    if (filtros.length) ctx.filter = filtros.join(' ');
    if (sprite) {
      ctx.drawImage(sprite, Math.round(cx - 24), Math.round(cy - 28));
      ctx.restore();
      return;
    }

    // criaturas amorfas: dibujo vectorial mejorado
    const bob = Math.sin(t / 300 + e.uid) * 1.8;
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4;
    switch (def.glyph) {
      case 'clump':
        ctx.fillStyle = def.color;
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2 + t / 650;
          ctx.beginPath();
          ctx.ellipse(cx + Math.cos(a) * 8, cy + Math.sin(a) * 7, 7, 3.6, a, 0, 7);
          ctx.fill();
        }
        ctx.fillStyle = Tiles.shade(def.color, 0.7);
        ctx.beginPath(); ctx.arc(cx, cy, 6.5, 0, 7); ctx.fill();
        break;
      case 'window':
        ctx.fillStyle = Tiles.shade(def.color, 0.5);
        ctx.fillRect(cx - 11, cy - 14, 22, 28);
        ctx.fillStyle = def.color;
        ctx.fillRect(cx - 8.5, cy - 11.5, 17, 23);
        ctx.strokeStyle = Tiles.shade(def.color, 0.4); ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(cx, cy - 11); ctx.lineTo(cx, cy + 11);
        ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath(); ctx.moveTo(cx - 7, cy + 9); ctx.lineTo(cx - 1, cy - 10); ctx.lineTo(cx + 3, cy - 10); ctx.lineTo(cx - 3, cy + 9); ctx.closePath(); ctx.fill();
        break;
      case 'spine':
        ctx.strokeStyle = def.color; ctx.lineWidth = 2.4;
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(cx - 8 + i * 4, cy + 11);
          ctx.quadraticCurveTo(cx - 10 + i * 6 + bob, cy - 7, cx - 3 + i * 4, cy - 13);
          ctx.stroke();
        }
        ctx.fillStyle = Tiles.shade(def.color, 1.15);
        ctx.beginPath(); ctx.ellipse(cx, cy - 1, 5, 7, 0.3, 0, 7); ctx.fill();
        break;
      case 'silverslime': {
        const puls = 1 + Math.sin(t / 400 + e.uid) * 0.12;
        ctx.fillStyle = def.color;
        ctx.beginPath(); ctx.ellipse(cx, cy + 9, 14 * puls, 6.5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.ellipse(cx - 4, cy + 7, 4, 2, -0.3, 0, 7); ctx.fill();
        ctx.fillStyle = Tiles.shade(def.color, 0.75);
        ctx.beginPath(); ctx.ellipse(cx + 5, cy + 11, 3.5, 1.6, 0.3, 0, 7); ctx.fill();
        break;
      }
      case 'aranea':
        ctx.strokeStyle = def.color; ctx.lineWidth = 2.8;
        for (const s of [-1, 1]) {
          const leg = Math.sin(t / 160 + s) * 2;
          ctx.beginPath(); ctx.moveTo(cx, cy - 2); ctx.lineTo(cx + 14 * s, cy - 13 + leg); ctx.lineTo(cx + 19 * s, cy + 9); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx, cy + 1); ctx.lineTo(cx + 12 * s, cy + 5 - leg); ctx.lineTo(cx + 15 * s, cy + 14); ctx.stroke();
        }
        ctx.fillStyle = def.color;
        ctx.beginPath(); ctx.ellipse(cx, cy - 2, 8.5, 6, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#e8e0d0';
        ctx.beginPath(); ctx.ellipse(cx, cy - 5, 5, 3.6, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#181818';
        ctx.fillRect(cx - 3, cy - 6, 1.8, 1.8); ctx.fillRect(cx + 1.4, cy - 6, 1.8, 1.8);
        break;
      case 'predatorydoor':
        ctx.fillStyle = Tiles.shade(def.color, 0.75);
        ctx.fillRect(cx - 10, cy - 16, 20, 32);
        ctx.fillStyle = def.color;
        ctx.fillRect(cx - 7.5, cy - 13.5, 15, 27);
        ctx.strokeStyle = Tiles.shade(def.color, 0.55);
        ctx.strokeRect(cx - 5, cy - 10.5, 10, 9);
        ctx.strokeRect(cx - 5, cy + 1, 10, 9);
        ctx.fillStyle = '#e0c040';
        ctx.beginPath(); ctx.arc(cx + 4.5, cy + 1, 1.8, 0, 7); ctx.fill();
        break;
      case 'cell': {
        const iris = def.color;
        ctx.fillStyle = 'rgba(230,240,235,0.92)';
        ctx.beginPath(); ctx.arc(cx, cy + bob, 11, 0, 7); ctx.fill();
        ctx.fillStyle = iris;
        ctx.beginPath(); ctx.arc(cx + 1, cy + bob, 6, 0, 7); ctx.fill();
        ctx.fillStyle = '#101010';
        ctx.beginPath(); ctx.arc(cx + 1, cy + bob, 2.8, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.arc(cx - 3.5, cy + bob - 4, 2, 0, 7); ctx.fill();
        break;
      }
      default:
        ctx.fillStyle = def.color;
        ctx.beginPath(); ctx.arc(cx, cy, 9, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer(px, py, t, world) {
    const p = world.player;
    const dir = p.dir || 'down';
    let spriteId = dir === 'side' ? 'player_side' : 'player_' + dir;
    if (p.salud < 35 && Sprites.tiene && Sprites.tiene(spriteId + '_herido')) spriteId += '_herido';
    const frame = world.moving ? Math.floor(t / 150) % Sprites.frameCount(spriteId) : 0;
    const img = Sprites.get(spriteId, frame);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(px + 24, py + 40, 11, 4, 0, 0, 7); ctx.fill();
    if (p._hitT && t - p._hitT < 170) ctx.filter = 'brightness(2.2)';
    // respiración sutil en reposo (2.5D vivo)
    const resp = world.moving ? 1 : 1 + Math.sin(t / 750) * 0.016;
    ctx.translate(px + 24, py + 20);
    ctx.scale(p.flip ? -resp : resp, resp);
    ctx.drawImage(img, -24, -24);
    // capa de máscara de gas (PUESTA en la ranura de cara): PNG opcional en
    // game/assets/sprites/mascara_<dir>.png, se compone encima del cuerpo
    if (world.equipado && world.equipado('mascara_gas')) {
      const maskId = 'mascara_' + dir;
      if (Sprites.tiene(maskId))
        ctx.drawImage(Sprites.get(maskId, frame % Sprites.frameCount(maskId)), -24, -24);
    }
    ctx.restore();
  }

  // tipo visual de la salida según su texto (coherencia con la wiki)
  function exitStyle(def) {
    const s = (def.texto || '').toLowerCase();
    if (/suelo|caer|agujero|fosa|hoyo|trampilla|pozo|precipicio|fall/.test(s)) return 'trampilla';
    if (/escalera|ascensor|elevador/.test(s)) return 'escalera';
    if (/ventana/.test(s)) return 'ventana';
    return 'puerta';
  }

  // salidas rituales canon: el objeto específico de la wiki, no una puerta genérica
  function drawRitual(ex, x, y, t, col, pulse) {
    const cx = x + 24, base = y + 40;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(cx, base + 2, 13, 4.5, 0, 0, 7); ctx.fill();
    ctx.shadowColor = col; ctx.shadowBlur = 12 * pulse;
    switch (ex.def.ritual) {
      case 'nave': // pedestal con la nave espacial de juguete (L483 → L140)
        ctx.fillStyle = '#6a6a72';
        ctx.fillRect(cx - 7, base - 18, 14, 18);
        ctx.fillStyle = '#8a8a92';
        ctx.fillRect(cx - 9, base - 21, 18, 4);
        ctx.fillStyle = '#d84a3a';                       // cohete de juguete
        ctx.beginPath(); ctx.moveTo(cx, base - 36); ctx.lineTo(cx + 5, base - 24); ctx.lineTo(cx - 5, base - 24); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e8e8f0';
        ctx.fillRect(cx - 5, base - 25, 10, 4);
        ctx.fillStyle = col; ctx.globalAlpha = pulse;
        ctx.beginPath(); ctx.arc(cx, base - 30, 2, 0, 7); ctx.fill();
        break;
      case 'reloj': // reloj digital moderno (L80 → L2)
        ctx.fillStyle = '#20242a';
        ctx.fillRect(cx - 12, base - 26, 24, 14);
        ctx.strokeStyle = '#4a5058';
        ctx.strokeRect(cx - 12.5, base - 26.5, 25, 15);
        ctx.fillStyle = Math.floor(t / 500) % 2 ? '#40ff80' : '#30cc60'; // dígitos parpadeando
        ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
        ctx.fillText('88:88', cx, base - 15.5);
        ctx.fillStyle = '#2a2e34';
        ctx.fillRect(cx - 3, base - 12, 6, 12);
        break;
      case 'vending': // máquina expendedora (L16 → L98)
        ctx.fillStyle = '#a83848';
        ctx.fillRect(cx - 11, base - 36, 22, 36);
        ctx.fillStyle = '#d8e8f0'; ctx.globalAlpha = 0.8;
        ctx.fillRect(cx - 8, base - 32, 10, 22);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#701828';
        ctx.fillRect(cx + 4, base - 32, 5, 22);
        ctx.fillStyle = pulse > 0.7 ? '#ffe060' : '#c8a830'; // botones 9 y 8
        ctx.fillRect(cx + 5, base - 30, 3, 3); ctx.fillRect(cx + 5, base - 25, 3, 3);
        break;
      case 'boton': // panel con botón ESCAPE (L15 → L3)
        ctx.fillStyle = '#c8ccd4';
        ctx.fillRect(cx - 10, base - 28, 20, 20);
        ctx.strokeStyle = '#8a92a0';
        ctx.strokeRect(cx - 10.5, base - 28.5, 21, 21);
        ctx.fillStyle = '#d83030';
        ctx.beginPath(); ctx.arc(cx, base - 18, 4 + pulse, 0, 7); ctx.fill();
        ctx.fillStyle = '#2a2e34'; ctx.font = 'bold 5px monospace'; ctx.textAlign = 'center';
        ctx.fillText('ESCAPE', cx, base - 9);
        break;
      case 'edificio': // rascacielos de la realidad (escape de L385)
        ctx.fillStyle = '#38404c';
        ctx.fillRect(cx - 10, base - 40, 20, 40);
        ctx.fillStyle = '#6ae86a'; ctx.globalAlpha = 0.5 + pulse * 0.4;
        for (let fy = 0; fy < 5; fy++)
          for (let fx = 0; fx < 3; fx++)
            if ((fx + fy) % 2 === 0) ctx.fillRect(cx - 7 + fx * 5.5, base - 36 + fy * 7, 3.5, 4);
        break;
      case 'emergencia': // puerta de emergencia (L0 → L14): rótulo EXIT + baliza roja
        ctx.fillStyle = '#181210';
        ctx.fillRect(cx - 11, base - 36, 22, 36);
        ctx.fillStyle = '#3a2c28';
        ctx.fillRect(cx - 9, base - 28, 18, 26);
        ctx.fillStyle = '#c81818';
        ctx.fillRect(cx - 8, base - 12, 16, 4);
        ctx.fillStyle = '#2a0808';
        ctx.fillRect(cx - 11, base - 38, 22, 8);
        ctx.fillStyle = Math.floor(t / 300) % 2 ? '#ff2020' : '#c81010'; // rótulo parpadeante
        ctx.font = 'bold 6px monospace'; ctx.textAlign = 'center';
        ctx.fillText('EXIT', cx, base - 32);
        ctx.fillStyle = '#ff2020'; ctx.globalAlpha = 0.35 + pulse * 0.35; // baliza
        ctx.beginPath(); ctx.arc(cx, base - 34, 10, 0, 7); ctx.fill();
        break;
    }
    ctx.restore();
  }

  function drawExit(ex, x, y, t, northWall) {
    const cx = x + 24;
    const pulse = 0.6 + Math.sin(t / 400) * 0.25;
    const col = ex.def.tipo === 'escape' ? '#6ae86a' : ex.def.tipo === 'sellada' ? '#666666' : '#e8c95a';
    if (ex.def.ritual) { drawRitual(ex, x, y, t, col, pulse); return; }

    // Suelo falso todavía cerrado: grietas sobre la moqueta, no un agujero ya abierto.
    if (ex.def._mec === 'romper_suelo' && !ex.def._abierta) {
      ctx.save();
      ctx.strokeStyle = 'rgba(28,20,10,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 7, y + 25); ctx.lineTo(x + 18, y + 20); ctx.lineTo(x + 24, y + 27);
      ctx.lineTo(x + 33, y + 15); ctx.lineTo(x + 41, y + 20);
      ctx.moveTo(x + 24, y + 27); ctx.lineTo(x + 29, y + 37);
      ctx.moveTo(x + 18, y + 20); ctx.lineTo(x + 15, y + 11);
      ctx.stroke();
      ctx.globalAlpha = 0.18 + pulse * 0.12;
      ctx.fillStyle = '#fff1b0';
      ctx.beginPath(); ctx.arc(cx, y + 25, 13, 0, 7); ctx.fill();
      ctx.restore();
      return;
    }

    // pared AGRIETADA (v20): la salida hay que romperla; abierta = hueco de luz
    if (ex.def._mec === 'romper') {
      ctx.save();
      const by = northWall ? y - 37 : y - 2;
      if (ex.def._abierta) {
        ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 16 * pulse;
        ctx.fillStyle = '#0c0a06';                    // boquete
        ctx.fillRect(cx - 13, by, 26, 39);
        ctx.fillStyle = `rgba(255,255,255,${0.65 + pulse * 0.3})`; // luz blanca
        ctx.fillRect(cx - 9, by + 3, 18, 33);
      } else {
        ctx.strokeStyle = 'rgba(20,16,10,0.85)';      // la grieta
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 1, by + 1);
        ctx.lineTo(cx - 5, by + 10); ctx.lineTo(cx + 2, by + 17);
        ctx.lineTo(cx - 3, by + 26); ctx.lineTo(cx + 4, by + 33); ctx.lineTo(cx + 1, by + 38);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 5, by + 10); ctx.lineTo(cx - 11, by + 14);
        ctx.moveTo(cx + 2, by + 17); ctx.lineTo(cx + 9, by + 19);
        ctx.moveTo(cx - 3, by + 26); ctx.lineTo(cx - 10, by + 30);
        ctx.stroke();
        ctx.globalAlpha = 0.25 + pulse * 0.2;         // respira un poco de luz
        ctx.strokeStyle = '#fff8e0';
        ctx.beginPath();
        ctx.moveTo(cx - 1, by + 2); ctx.lineTo(cx - 4, by + 10); ctx.lineTo(cx + 1, by + 17);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    const style = exitStyle(ex.def);
    ctx.save();

    if (style === 'trampilla') {
      // trampilla plana en el suelo
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x + 8, y + 10, 32, 28);
      ctx.fillStyle = '#0a0806';
      ctx.fillRect(x + 11, y + 13, 26, 22);
      ctx.strokeStyle = Tiles.shade(col, 0.8); ctx.lineWidth = 2;
      ctx.strokeRect(x + 9.5, y + 11.5, 29, 25);
      ctx.globalAlpha = pulse * 0.6;               // resplandor desde el fondo
      const gr = ctx.createRadialGradient(cx, y + 24, 2, cx, y + 24, 15);
      gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(x + 11, y + 13, 26, 22);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = Tiles.shade(col, 0.6);     // bisagras
      ctx.strokeRect(x + 13, y + 14.5, 5, 2); ctx.strokeRect(x + 30, y + 14.5, 5, 2);
    } else if (style === 'escalera') {
      // escalera descendente vista desde arriba
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x + 10, y + 8, 28, 34);
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = Tiles.shade(col, 0.9 - i * 0.16);
        ctx.fillRect(x + 12, y + 10 + i * 6, 24, 5);
      }
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5 + pulse * 0.4;
      ctx.strokeRect(x + 10.5, y + 8.5, 27, 33);
    } else if (style === 'ventana') {
      // ventana luminosa en pie (o sobre la pared norte)
      const by = northWall ? y - 34 : y + 4;
      ctx.shadowColor = col; ctx.shadowBlur = 14 * pulse;
      ctx.fillStyle = '#2a2a2e';
      ctx.fillRect(cx - 11, by, 22, 30);
      ctx.fillStyle = Tiles.shade(col, 0.9);
      ctx.globalAlpha = 0.55 + pulse * 0.35;
      ctx.fillRect(cx - 8, by + 3, 7.5, 11); ctx.fillRect(cx + 0.5, by + 3, 7.5, 11);
      ctx.fillRect(cx - 8, by + 16, 7.5, 11); ctx.fillRect(cx + 0.5, by + 16, 7.5, 11);
      if (!northWall) {
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.ellipse(cx, y + 40, 13, 4, 0, 0, 7); ctx.fill();
      }
    } else {
      // puerta: pegada a la cara de la pared norte si existe; si no, exenta
      if (northWall) {
        const by = y - 37;                         // encajada en la cara del muro norte
        const bh = 39;
        ctx.fillStyle = Tiles.shade(col, 0.28);    // marco
        ctx.fillRect(cx - 12, by, 24, bh);
        ctx.fillStyle = Tiles.shade(col, 0.5);     // hoja
        ctx.fillRect(cx - 9, by + 2, 18, bh - 3);
        ctx.strokeStyle = Tiles.shade(col, 0.9); ctx.lineWidth = 1.5;
        ctx.strokeRect(cx - 9.5, by + 2.5, 19, bh - 4);
        ctx.strokeRect(cx - 6, by + 5, 11, 10);    // cuarterón
        ctx.fillStyle = '#e8d890';                 // pomo
        ctx.beginPath(); ctx.arc(cx + 5.5, by + bh - 12, 1.8, 0, 7); ctx.fill();
        ctx.globalAlpha = pulse * 0.5;             // luz que se cuela por debajo
        ctx.fillStyle = col;
        ctx.fillRect(cx - 9, by + bh - 2, 18, 2.5);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.ellipse(cx, y + 41, 13, 4.5, 0, 0, 7); ctx.fill();
        ctx.shadowColor = col; ctx.shadowBlur = 12 * pulse;
        ctx.fillStyle = Tiles.shade(col, 0.3);
        ctx.fillRect(cx - 12, y - 2, 24, 42);
        ctx.fillStyle = Tiles.shade(col, 0.55);
        ctx.fillRect(cx - 9, y + 1, 18, 38);
        ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        ctx.strokeRect(cx - 9.5, y + 1.5, 19, 37);
        ctx.strokeRect(cx - 6, y + 5, 11, 12);
        ctx.fillStyle = '#e8d890';
        ctx.beginPath(); ctx.arc(cx + 5.5, y + 24, 2, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawItem(it, x, y, t, objects) {
    const def = objects[it.id];
    // apoyado en el suelo (sin flotar): sombra de contacto + brillo pulsante
    const cx = x + 24, cy = y + 31;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 9, 9, 3.2, 0, 0, 7); ctx.fill();
    const frame = Math.floor(t / 320) % Sprites.frameCount(it.id);
    const sprite = Sprites.get(it.id, frame);
    if (sprite) {
      ctx.shadowColor = def.color;
      ctx.shadowBlur = 5 + Math.sin(t / 350 + cx) * 2;
      ctx.drawImage(sprite, Math.round(cx - 24), Math.round(cy - 32));
      ctx.restore();
      return;
    }
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 6 + Math.sin(t / 350 + cx) * 3;
    ctx.fillStyle = def.color;
    if (it.id === 'agua_almendras') {
      ctx.fillRect(cx - 4, cy - 8, 8, 15);
      ctx.fillStyle = Tiles.shade(def.color, 0.6);
      ctx.fillRect(cx - 4, cy - 8, 8, 4);
    } else if (it.id === 'botiquin') {
      ctx.fillRect(cx - 7, cy - 5, 14, 11);
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - 1.5, cy - 3.5, 3, 8); ctx.fillRect(cx - 4.5, cy - 0.5, 9, 3);
    } else if (it.id === 'linterna') {
      ctx.fillRect(cx - 7, cy - 2.5, 12, 6);
      ctx.fillStyle = '#fff8d0';
      ctx.beginPath(); ctx.arc(cx + 6, cy, 3.6, 0, 7); ctx.fill();
    } else if (it.id === 'llave_nivel') {
      ctx.strokeStyle = def.color; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(cx - 4, cy, 4, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 8, cy); ctx.moveTo(cx + 6, cy); ctx.lineTo(cx + 6, cy + 4); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  // ---------- partículas ambientales (screen-space, por ficha de nivel) ----------
  let pState = { levelId: null, list: [] };

  function initParticles(mode, n) {
    const list = [];
    for (let i = 0; i < n; i++)
      list.push({
        x: Math.random() * W, y: Math.random() * H,
        v: 0.3 + Math.random() * 0.8, fase: Math.random() * 7,
        vida: Math.random(), par: Math.random() < 0.5,
      });
    return list;
  }

  function drawParticles(world, t) {
    const mode = world.level.particulas;
    if (!mode) { pState.levelId = world.level.id; return; }
    if (pState.levelId !== world.level.id) {
      const counts = { polvo: 45, nieve: 70, lluvia: 90, glitch: 8, ojos: 5, esporas: 40, vapor: 25, estrellas: 60 };
      pState = { levelId: world.level.id, list: initParticles(mode, counts[mode] ?? 40) };
    }
    ctx.save();
    const pal = world.level.paleta;
    for (const p of pState.list) {
      switch (mode) {
        case 'polvo': // motas doradas a la deriva
          p.x += Math.sin(t / 2100 + p.fase) * 0.18;
          p.y += p.v * 0.12;
          ctx.globalAlpha = 0.16 + Math.sin(t / 900 + p.fase) * 0.1;
          ctx.fillStyle = pal.luz;
          ctx.fillRect(p.x, p.y, 1.6, 1.6);
          break;
        case 'nieve':
          p.x += Math.sin(t / 1300 + p.fase) * 0.5;
          p.y += p.v * 0.9;
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = '#f0f6ff';
          ctx.fillRect(p.x, p.y, 2.2, 2.2);
          break;
        case 'lluvia':
          p.y += p.v * 7;
          p.x -= p.v * 1.6;
          ctx.globalAlpha = 0.3;
          ctx.strokeStyle = '#9ab0d8';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 2, p.y + 9); ctx.stroke();
          break;
        case 'glitch': // rectángulos corruptos intermitentes
          if (Math.random() < 0.985) continue;
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = Math.random() < 0.5 ? pal.detalle : '#ffffff';
          ctx.fillRect(Math.random() * W, Math.random() * H, 8 + Math.random() * 42, 1.5 + Math.random() * 4);
          continue;
        case 'ojos': { // pares de ojos que se abren y cierran en la penumbra
          p.vida += 0.004;
          if (p.vida > 1) { p.vida = 0; p.x = Math.random() * W; p.y = Math.random() * H; }
          const a = Math.sin(p.vida * Math.PI);
          ctx.globalAlpha = Math.max(0, a - 0.35) * 0.9;
          ctx.fillStyle = '#e03040';
          ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, 7); ctx.fill();
          ctx.beginPath(); ctx.arc(p.x + 7, p.y, 1.8, 0, 7); ctx.fill();
          break;
        }
        case 'esporas':
          p.x += Math.sin(t / 1600 + p.fase) * 0.3;
          p.y -= p.v * 0.22;
          ctx.globalAlpha = 0.3 + Math.sin(t / 700 + p.fase) * 0.15;
          ctx.fillStyle = pal.detalle;
          ctx.fillRect(p.x, p.y, 2, 2);
          break;
        case 'vapor':
          p.y -= p.v * 0.55;
          p.x += Math.sin(t / 1000 + p.fase) * 0.4;
          ctx.globalAlpha = 0.05;
          ctx.fillStyle = '#e8d8c8';
          ctx.beginPath(); ctx.arc(p.x, p.y, 9 + Math.sin(p.fase + t / 800) * 3, 0, 7); ctx.fill();
          break;
        case 'estrellas': // fijas, titilan (solo se aprecian sobre el vacío)
          ctx.globalAlpha = 0.25 + Math.sin(t / 600 + p.fase * 9) * 0.2;
          ctx.fillStyle = '#cfe0ff';
          ctx.fillRect(p.x, p.y, p.par ? 1 : 1.6, p.par ? 1 : 1.6);
          break;
      }
      if (p.y > H + 10) { p.y = -8; p.x = Math.random() * W; }
      if (p.y < -12) { p.y = H + 8; p.x = Math.random() * W; }
      if (p.x > W + 10) p.x = -8;
      if (p.x < -10) p.x = W + 8;
    }
    ctx.restore();
  }

  // ---------- frame ----------
  function frame(world, t) {
    const g = world.map.grid;
    const cam = world.camera;
    const dark = world.level.oscuridad;

    const [shx, shy] = window.NOFX ? [0, 0] : Effects.shakeOffset(t);
    ctx.save();
    ctx.translate(shx, shy);

    ctx.fillStyle = world.level.paleta.fondo;
    ctx.fillRect(-12, -12, W + 24, H + 24);

    let flicker = 1;
    if (Math.random() < 0.012) flicker = 0.72;
    world._flicker = world._flicker === undefined ? 1 : world._flicker * 0.85 + flicker * 0.15;
    const fl = world._flicker;

    const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1);
    const y0 = Math.max(0, Math.floor(cam.y / TILE) - 1);
    const x1 = Math.min(g.w - 1, x0 + Math.ceil(W / TILE) + 2);
    const y1 = Math.min(g.h - 1, y0 + Math.ceil(H / TILE) + 2);

    const vis = (idx) => world.explored[idx] || world.light[idx] > 0.001;

    // PASE 1: suelos — SE DIBUJA TODO el viewport; la niebla es el único límite
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const idx = y * g.w + x;
        const v = g.t[idx];
        if (v === T.VACIO) continue; // el fondo es el cielo/abismo
        const sx = x * TILE - cam.x, sy = y * TILE - cam.y;
        let img;
        if (v === T.AGUA) img = world.tiles.agua;
        else if (v === T.DECOR) img = world.tiles.decor;
        else img = world.tiles.suelo[(x * 7 + y * 13) % 3];
        ctx.drawImage(img, sx, sy);
        // oclusión ambiental: sombra donde el suelo toca una pared
        if (v !== T.PARED) {
          ctx.fillStyle = 'rgba(0,0,0,0.16)';
          if (MapGen.at(g, x, y - 1) === T.PARED) ctx.fillRect(sx, sy, TILE, 5);
          if (MapGen.at(g, x - 1, y) === T.PARED) ctx.fillRect(sx, sy, 5, TILE);
          if (MapGen.at(g, x + 1, y) === T.PARED) ctx.fillRect(sx + TILE - 5, sy, 5, TILE);
        }
      }

    // índices por celda
    const exitAt = new Map();
    for (const ex of world.map.exits) exitAt.set(ex.y * g.w + ex.x, ex);
    const itemsAt = new Map();
    for (const it of world.map.items) {
      if (it.taken) continue;
      (itemsAt.get(it.y * g.w + it.x) ?? itemsAt.set(it.y * g.w + it.x, []).get(it.y * g.w + it.x)).push(it);
    }
    const propsAt = new Map();
    for (const pr of world.map.props || []) {
      (propsAt.get(pr.y * g.w + pr.x) ?? propsAt.set(pr.y * g.w + pr.x, []).get(pr.y * g.w + pr.x)).push(pr);
    }
    const actorsAt = new Map();
    for (const e of world.entities) {
      if (!e.viva) continue;
      if (e.rx === undefined) { e.rx = e.x; e.ry = e.y; }
      const ex = Math.round(e.x), ey = Math.round(e.y);
      const idx = ey * g.w + ex;
      const lit = world.light[idx];
      const esSmiler = e.def.glyph === 'smiler';
      const visible = lit > 0.05 ||
        (e.reveladaHasta ?? -1) > world.turn ||
        (esSmiler && (world.explored[idx] || Math.hypot(e.x - world.player.x, e.y - world.player.y) < 9));
      if (!visible) continue;
      (actorsAt.get(ey) ?? actorsAt.set(ey, []).get(ey)).push(e);
    }

    const esWall = (x, y) => MapGen.at(g, x, y) === T.PARED;

    // PASE 2: por filas — salidas/objetos/props, tabiques (con cara), actores
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const idx = y * g.w + x;
        const sx = x * TILE - cam.x, sy = y * TILE - cam.y;
        const light = world.light[idx];

        const ex = exitAt.get(idx);
        if (ex && (light > 0.05 || world.explored[idx]))
          drawExit(ex, sx, sy, t, world.tiles.wallStyle === 'tabique' && esWall(x, y - 1));
        const its = itemsAt.get(idx);
        if (its && light > 0.05) for (const it of its) drawItem(it, sx, sy, t, world.data.objects);
        const prs = propsAt.get(idx);
        if (prs && (light > 0.05 || world.explored[idx]))
          for (const pr of prs) {
            Sprites.drawProp(ctx, pr.id, sx + 24, sy + 24, t, null);
            if (pr.contenedor && !pr.registrado) { // brillo de "se puede registrar"
              ctx.save();
              ctx.globalAlpha = 0.5 + Math.sin(t / 300) * 0.3;
              ctx.fillStyle = '#ffe9a0';
              ctx.beginPath(); ctx.arc(sx + 36, sy + 10, 2.2, 0, 7); ctx.fill();
              ctx.restore();
            }
          }

        if (g.t[idx] === T.PARED) {
          if (world.tiles.wallStyle === 'arbol') {
            ctx.drawImage(world.tiles.arbol, sx, sy - 18);
          } else if (world.tiles.wallStyle === 'roca') {
            ctx.drawImage(world.tiles.roca, sx, sy - 10);
          } else {
            // esquema HD-2D: cara frontal completa si el sur es transitable; techo si no
            const surPared = esWall(x, y + 1);
            if (!surPared && MapGen.at(g, x, y + 1) !== T.VACIO) {
              ctx.drawImage(world.tiles.caraFull[(x * 7 + y * 13) % 3], sx, sy);
              // sombra del muro proyectada sobre el suelo del sur
              const sg = ctx.createLinearGradient(0, sy + TILE, 0, sy + TILE + 9);
              sg.addColorStop(0, 'rgba(0,0,0,0.32)');
              sg.addColorStop(1, 'rgba(0,0,0,0)');
              ctx.fillStyle = sg;
              ctx.fillRect(sx, sy + TILE, TILE, 9);
            } else {
              ctx.drawImage(world.tiles.techo, sx, sy);
              // aristas del techo contra zonas abiertas
              ctx.fillStyle = 'rgba(255,255,255,0.14)';
              if (!esWall(x, y - 1)) ctx.fillRect(sx, sy, TILE, 2);
              if (!esWall(x - 1, y)) ctx.fillRect(sx, sy, 2, TILE);
              ctx.fillStyle = 'rgba(0,0,0,0.22)';
              if (!esWall(x + 1, y)) ctx.fillRect(sx + TILE - 2, sy, 2, TILE);
            }
          }
        }
      }

      // actores de esta fila
      const acts = actorsAt.get(y);
      if (acts) {
        for (const e of acts) {
          let ax = e.rx * TILE - cam.x, ay = e.ry * TILE - cam.y;
          // embestida de ataque hacia el jugador
          if (e._atkT !== undefined) {
            const k = (t - e._atkT) / 240;
            if (k >= 0 && k <= 1) {
              const amp = Math.sin(Math.PI * k) * 0.38;
              ax += (world.player.x - e.x) * amp * TILE;
              ay += (world.player.y - e.y) * amp * TILE;
            }
          }
          const lit = world.light[Math.round(e.y) * g.w + Math.round(e.x)];
          ctx.save();
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath(); ctx.ellipse(ax + 24, ay + 40, 11, 4, 0, 0, 7); ctx.fill();
          ctx.restore();
          drawEntity(e, ax, ay - 6, lit, t);
        }
      }
      if (Math.round(world.player.y) === y && !world.escondido) {
        drawPlayer(world.player.rx * TILE - cam.x, world.player.ry * TILE - cam.y, t, world);
      }
    }

    // PASE 3: oscuridad Darkwood SUAVE — canvas de luz de baja resolución
    // (1 píxel por casilla) escalado con interpolación bilineal: gradientes
    // continuos en vez de cuadros.
    {
      const lw = x1 - x0 + 1, lh = y1 - y0 + 1;
      if (!frame._lc || frame._lc.width < lw || frame._lc.height < lh) {
        frame._lc = document.createElement('canvas');
        frame._lc.width = Math.max(lw, 40);
        frame._lc.height = Math.max(lh, 40);
      }
      const lc = frame._lc;
      const lctx = lc.getContext('2d');
      const img = lctx.createImageData(lw, lh);
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const idx = y * g.w + x;
          const light = world.light[idx];
          const seen = world.explored[idx];
          let a;
          if (light > 0) a = (1 - light * fl) * (0.2 + dark * 0.72);
          else if (seen) a = 0.9;
          else a = 1;
          const o = ((y - y0) * lw + (x - x0)) * 4;
          img.data[o + 3] = Math.round(a * 255); // negro con alpha
        }
      lctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(lc, 0, 0, lw, lh, x0 * TILE - cam.x, y0 * TILE - cam.y, lw * TILE, lh * TILE);
    }

    // partículas ambientales del nivel
    if (!window.NOFX) drawParticles(world, t);

    // halo cálido
    if (!window.NOFX) {
      const pcx = world.player.rx * TILE - cam.x + TILE / 2;
      const pcy = world.player.ry * TILE - cam.y + TILE / 2;
      const halo = ctx.createRadialGradient(pcx, pcy, 12, pcx, pcy, TILE * (world.visionActual() * 0.75 + 1));
      halo.addColorStop(0, `rgba(255,240,190,${0.09 * fl})`);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, W, H);
    }

    // jugadores remotos del MMO (cuerpo + capa social); en 2D van por encima
    // del mapa — suficiente para el render de respaldo
    if (window.Otros && world.otros) {
      for (const o of world.otros) {
        if (o.escondido) continue;
        const ox = o.rx * TILE - cam.x, oy = o.ry * TILE - cam.y;
        if (ox < -TILE || oy < -TILE || ox > W + TILE || oy > H + TILE) continue;
        const d4 = Otros.dir4(o.rot);
        const dir = d4 === 0 ? 'up' : d4 === 2 ? 'down' : 'side';
        const sid = 'player_' + dir;
        const anda = Math.abs(o.rx - o.x) + Math.abs(o.ry - o.y) > 0.03;
        const img = Sprites.get(sid, anda ? Math.floor(t / 150) % Sprites.frameCount(sid) : 0);
        ctx.save();
        ctx.translate(ox + 24, oy + 20);
        if (d4 === 3) ctx.scale(-1, 1);
        ctx.drawImage(img, -24, -24);
        ctx.restore();
      }
      Otros.overlay(ctx, (wx, wy) => [wx * TILE - cam.x + TILE / 2, wy * TILE - cam.y + TILE / 2], world, t);
    }
    if (!window.NOFX) Effects.draw(ctx, cam.x, cam.y, t, TILE);
    ctx.restore(); // fin de la sacudida

    // tilt-shift de diorama (sello HD-2D): bandas superior/inferior desenfocadas
    if (!window.NOFX) {
      ctx.save();
      for (const [by, bh, blur] of [
        [0, H * 0.10, 2.4], [H * 0.10, H * 0.06, 1.1],
        [H * 0.84, H * 0.06, 1.1], [H * 0.90, H * 0.10, 2.4],
      ]) {
        ctx.filter = `blur(${blur}px)`;
        ctx.drawImage(canvas, 0, by, W, bh, 0, by, W, bh);
      }
      ctx.restore();
    }

    if (world.player.cordura < 30) {
      const sc = (30 - world.player.cordura) / 30;
      ctx.fillStyle = `rgba(60,0,20,${0.12 * sc})`;
      ctx.fillRect(0, 0, W, H);
    }

    // clima del nivel: tinte helado o de horno
    const reglasClima = world.level.reglas || [];
    if (reglasClima.includes('frio')) {
      ctx.fillStyle = `rgba(140,190,235,${0.06 + 0.025 * Math.sin(t * 0.0012)})`;
      ctx.fillRect(0, 0, W, H);
    } else if (reglasClima.includes('calor')) {
      ctx.fillStyle = `rgba(235,110,30,${0.055 + 0.03 * Math.sin(t * 0.002)})`;
      ctx.fillRect(0, 0, W, H);
    }

    if (!window.NOFX) {
      const vin = ctx.createRadialGradient(W / 2, H / 2, H * 0.36, W / 2, H / 2, H * 0.78);
      vin.addColorStop(0, 'rgba(0,0,0,0)');
      vin.addColorStop(1, 'rgba(0,0,0,0.62)');
      ctx.fillStyle = vin;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(grain, Math.random() * -80, Math.random() * -80, W + 160, H + 160);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- exportadores a canvas (texturas para el render 3D) ----------
  function toCanvas(w, h, fn) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const viejo = ctx;
    ctx = c.getContext('2d');
    fn();
    ctx = viejo;
    return c;
  }

  window.Render = {
    init, frame, TILE: 48,
    _drawEntity: drawEntity,
    exitStyle,
    exitToCanvas: (def) => toCanvas(48, 72, () => drawExit({ def }, 0, 20, 500, false)),
    itemToCanvas: (id, objects) => toCanvas(48, 52, () => drawItem({ id }, 0, 2, 350, objects)),
    propToCanvas: (id) => toCanvas(48, 72, () => Sprites.drawProp(ctx, id, 24, 46, 400, null)),
  };
})();
