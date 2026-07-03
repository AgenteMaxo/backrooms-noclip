// Texturas cenitales procedurales por paleta/bioma — v3: paredes FINAS.
// Suelo: 48×48 · Pared: tabique fino con autotiling (bitmask N/E/S/O) cuya cara
// frontal (26px) muestra el grabado del nivel: papel pintado, zócalo, enchufes…
(function () {
  const TILE = 48;
  const G = 14;                    // grosor del tabique
  const B0 = (TILE - G) / 2;       // borde izquierdo/superior de la banda (17)
  const B1 = B0 + G;               // borde derecho/inferior de la banda (31)
  const FH = 34;                   // alto de la cara frontal (2.5D)

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r * f)));
    g = Math.max(0, Math.min(255, Math.round(g * f)));
    b = Math.max(0, Math.min(255, Math.round(b * f)));
    return `rgb(${r},${g},${b})`;
  }

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function speckle(ctx, rng, color, n, x0, y0, w, h, size = 1) {
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++)
      ctx.fillRect(x0 + rng.int(0, w - 1), y0 + rng.int(0, h - 1), size, size);
  }

  // ---------- suelos (por estilo de la ficha) ----------
  function floorTile(pal, estilo, rng, variant) {
    const c = canvas(TILE, TILE), ctx = c.getContext('2d');
    ctx.fillStyle = shade(pal.suelo, 0.92 + variant * 0.06);
    ctx.fillRect(0, 0, TILE, TILE);
    switch (estilo) {
      case 'moqueta_humeda': // Level 0: moqueta empapada con cercos de humedad
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = shade(pal.detalle, 0.75);
        ctx.beginPath();
        ctx.ellipse(12 + (variant * 13) % 24, 14 + (variant * 7) % 20, 14, 9, 0.4, 0, 7);
        ctx.fill();
        ctx.globalAlpha = 1;
        // sin break: continúa con la textura de moqueta
      case 'moqueta':
        speckle(ctx, rng, shade(pal.suelo, 0.78), 170, 0, 0, TILE, TILE);
        speckle(ctx, rng, shade(pal.suelo, 1.14), 110, 0, 0, TILE, TILE);
        if (variant === 2 || estilo === 'moqueta_humeda')
          speckle(ctx, rng, shade(pal.detalle, 0.9), 40, 8, 8, 32, 32, 2);
        break;
      case 'moqueta_cenefa':
        speckle(ctx, rng, shade(pal.suelo, 0.8), 150, 0, 0, TILE, TILE);
        speckle(ctx, rng, shade(pal.suelo, 1.12), 90, 0, 0, TILE, TILE);
        ctx.strokeStyle = shade(pal.detalle, 1.3);      // cenefa de hotel
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(5.5, 5.5, TILE - 11, TILE - 11);
        ctx.setLineDash([]);
        break;
      case 'hormigon':
        speckle(ctx, rng, shade(pal.suelo, 0.82), 70, 0, 0, TILE, TILE);
        if (variant > 0) {
          ctx.strokeStyle = shade(pal.suelo, 0.66);
          ctx.beginPath();
          let x = rng.int(8, 40), y = 0;
          ctx.moveTo(x, y);
          while (y < TILE) { x += rng.int(-4, 4); y += rng.int(4, 8); ctx.lineTo(x, y); }
          ctx.stroke();
        }
        break;
      case 'baldosa':
      case 'baldosa_oscura':
        if (estilo === 'baldosa_oscura') { ctx.fillStyle = shade(pal.suelo, 0.7); ctx.fillRect(0, 0, TILE, TILE); }
        speckle(ctx, rng, shade(pal.suelo, 1.08), 32, 0, 0, TILE, TILE);
        ctx.strokeStyle = shade(pal.suelo, estilo === 'baldosa_oscura' ? 1.5 : 0.74);
        ctx.strokeRect(0.5, 0.5, TILE - 1, TILE - 1);
        ctx.strokeRect(0.5, 0.5, TILE / 2, TILE / 2);
        ctx.strokeRect(TILE / 2 + 0.5, TILE / 2 + 0.5, TILE / 2 - 1, TILE / 2 - 1);
        break;
      case 'tablones':
      case 'tablones_claros': {
        const base = estilo === 'tablones_claros' ? 1.15 : 1;
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = shade(pal.suelo, base * (0.85 + ((i + variant) % 3) * 0.1));
          ctx.fillRect(0, i * 12, TILE, 12);
          ctx.strokeStyle = shade(pal.suelo, 0.6);
          ctx.beginPath(); ctx.moveTo(0, i * 12 + 0.5); ctx.lineTo(TILE, i * 12 + 0.5); ctx.stroke();
          // juntas de tablón desfasadas + vetas
          const jx = ((i * 17 + variant * 23) % TILE);
          ctx.beginPath(); ctx.moveTo(jx, i * 12); ctx.lineTo(jx, i * 12 + 12); ctx.stroke();
          ctx.strokeStyle = shade(pal.suelo, 0.75 * base);
          ctx.beginPath(); ctx.moveTo(4, i * 12 + 6); ctx.lineTo(TILE - rng.int(4, 20), i * 12 + 6); ctx.stroke();
        }
        break;
      }
      case 'piedra':
        speckle(ctx, rng, shade(pal.suelo, 0.8), 60, 0, 0, TILE, TILE);
        ctx.strokeStyle = shade(pal.suelo, 0.65);
        for (const [ax, ay, bx, by] of [[0, 18, 20, 14], [20, 14, 48, 22], [14, 48, 22, 30], [22, 30, 48, 36], [0, 34, 14, 30]]) {
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        }
        break;
      case 'rejilla':
        ctx.fillStyle = shade(pal.suelo, 0.75);
        ctx.fillRect(0, 0, TILE, TILE);
        ctx.strokeStyle = shade(pal.suelo, 1.3);
        for (let i = 4; i < TILE; i += 8) {
          ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, TILE); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(TILE, i); ctx.stroke();
        }
        ctx.strokeStyle = shade(pal.suelo, 1.6);
        ctx.strokeRect(1.5, 1.5, TILE - 3, TILE - 3);
        break;
      case 'negro':
        ctx.fillStyle = shade(pal.suelo, 0.85);
        ctx.fillRect(0, 0, TILE, TILE);
        speckle(ctx, rng, shade(pal.detalle, 1.2), 12, 0, 0, TILE, TILE);
        break;
      case 'nieve':
        speckle(ctx, rng, shade(pal.suelo, 1.1), 90, 0, 0, TILE, TILE);
        speckle(ctx, rng, '#ffffff', 30, 0, 0, TILE, TILE);
        if (variant === 2) { // huellas antiguas
          ctx.fillStyle = shade(pal.suelo, 0.85);
          ctx.beginPath(); ctx.ellipse(18, 16, 3, 5, 0.3, 0, 7); ctx.fill();
          ctx.beginPath(); ctx.ellipse(28, 30, 3, 5, 0.3, 0, 7); ctx.fill();
        }
        break;
      case 'blanco':
        ctx.fillStyle = shade(pal.suelo, 1.0);
        ctx.fillRect(0, 0, TILE, TILE);
        speckle(ctx, rng, shade(pal.suelo, 0.94), 20, 0, 0, TILE, TILE);
        break;
      case 'tierra':
        speckle(ctx, rng, shade(pal.suelo, 0.8), 100, 0, 0, TILE, TILE);
        speckle(ctx, rng, shade(pal.detalle, 1.0), 26, 0, 0, TILE, TILE, 2);
        break;
      case 'hierba':
        speckle(ctx, rng, shade(pal.suelo, 0.78), 90, 0, 0, TILE, TILE);
        speckle(ctx, rng, shade(pal.detalle, 1.15), 40, 0, 0, TILE, TILE, 2);
        ctx.strokeStyle = shade(pal.detalle, 1.3);      // briznas
        for (let i = 0; i < 8; i++) {
          const gx = rng.int(3, TILE - 3), gy = rng.int(3, TILE - 3);
          ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + rng.int(-2, 2), gy - 4); ctx.stroke();
        }
        break;
      case 'adoquin':
        speckle(ctx, rng, shade(pal.suelo, 0.85), 46, 0, 0, TILE, TILE);
        ctx.strokeStyle = shade(pal.suelo, 0.7);
        for (let y = 12; y < TILE; y += 12) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(TILE, y); ctx.stroke(); }
        for (let x = 12; x < TILE; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, TILE); ctx.stroke(); }
        break;
      case 'panel':
        ctx.strokeStyle = shade(pal.suelo, 0.84);
        ctx.strokeRect(2.5, 2.5, TILE - 5, TILE - 5);
        speckle(ctx, rng, shade(pal.suelo, 1.06), 14, 0, 0, TILE, TILE);
        break;
    }
    return c;
  }

  // ---------- grabado de la cara frontal por ESTILO (identidad de cada nivel) ----------
  function faceDetail(ctx, pal, estilo, rng, w) {
    const zocalo = (f = 0.55) => {
      ctx.fillStyle = shade(pal.detalle, f);
      ctx.fillRect(0, FH - 6, w, 6);
      ctx.fillStyle = shade(pal.detalle, f + 0.2);
      ctx.fillRect(0, FH - 7, w, 1);
    };
    switch (estilo) {
      case 'papel_rayas': // Level 0: el rayado clásico
        for (let x = 0; x < w; x += 6) {
          ctx.fillStyle = shade(pal.pared, 1.12);
          ctx.fillRect(x, 0, 3, FH);
        }
        ctx.fillStyle = shade(pal.pared, 0.8);
        ctx.fillRect(0, 0, w, 2);
        zocalo();
        if (rng.chance(0.3)) {
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = shade(pal.pared, 0.7);
          ctx.beginPath();
          ctx.ellipse(rng.int(6, w - 6), rng.int(6, 16), rng.int(3, 6), rng.int(4, 8), 0, 0, 7);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        break;
      case 'madera': // Woodrooms: tablones verticales con vetas y nudos
        for (let x = 0; x < w; x += 9) {
          ctx.fillStyle = shade(pal.pared, 0.9 + ((x / 9) % 3) * 0.09);
          ctx.fillRect(x, 0, 9, FH);
          ctx.strokeStyle = shade(pal.pared, 0.6);
          ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, FH); ctx.stroke();
          ctx.strokeStyle = shade(pal.pared, 0.75);      // veta
          ctx.beginPath(); ctx.moveTo(x + 4, 2); ctx.quadraticCurveTo(x + 2, FH / 2, x + 5, FH - 2); ctx.stroke();
        }
        if (rng.chance(0.5)) {                            // nudo
          ctx.fillStyle = shade(pal.pared, 0.55);
          ctx.beginPath(); ctx.ellipse(rng.int(5, w - 5), rng.int(6, FH - 8), 2.5, 3.5, 0, 0, 7); ctx.fill();
        }
        break;
      case 'apartamento': // Level 130: papel + marcos de puerta + apliques
        for (let x = 0; x < w; x += 8) {
          ctx.fillStyle = shade(pal.pared, 1.1);
          ctx.fillRect(x, 0, 4, FH);
        }
        zocalo(0.5);
        if (w >= 40 && rng.chance(0.45)) {                // puerta decorativa
          ctx.fillStyle = shade(pal.detalle, 0.75);
          ctx.fillRect(w / 2 - 8, 3, 16, FH - 3);
          ctx.strokeStyle = shade(pal.detalle, 0.45);
          ctx.strokeRect(w / 2 - 8.5, 3.5, 17, FH - 4);
          ctx.strokeRect(w / 2 - 5, 6.5, 10, 7);
          ctx.fillStyle = '#d8c078';
          ctx.beginPath(); ctx.arc(w / 2 + 5, FH - 10, 1.4, 0, 7); ctx.fill();
        } else if (rng.chance(0.4)) {                     // aplique encendido
          ctx.fillStyle = '#ffe9b0';
          ctx.beginPath(); ctx.arc(rng.int(8, w - 8), 6, 2.5, 0, 7); ctx.fill();
        }
        break;
      case 'hotel': // Level 483: friso de madera + cuadros vacíos
        ctx.fillStyle = shade(pal.pared, 1.08);
        ctx.fillRect(0, 0, w, FH - 11);
        ctx.fillStyle = shade(pal.detalle, 0.8);          // friso
        ctx.fillRect(0, FH - 11, w, 11);
        ctx.strokeStyle = shade(pal.detalle, 1.2);
        ctx.beginPath(); ctx.moveTo(0, FH - 11); ctx.lineTo(w, FH - 11); ctx.stroke();
        for (let x = 6; x < w; x += 12) {
          ctx.beginPath(); ctx.moveTo(x, FH - 9); ctx.lineTo(x, FH - 2); ctx.stroke();
        }
        if (w >= 30 && rng.chance(0.5)) {                 // cuadro en blanco
          ctx.strokeStyle = shade(pal.pared, 0.5);
          ctx.lineWidth = 1.6;
          ctx.strokeRect(w / 2 - 6, 3.5, 12, 9);
          ctx.fillStyle = shade(pal.pared, 1.3);
          ctx.fillRect(w / 2 - 4.5, 5, 9, 6);
          ctx.lineWidth = 1;
        }
        break;
      case 'espejo': // Level 305: paneles espejados con destello
        for (let x = 0; x < w; x += 16) {
          ctx.fillStyle = shade(pal.detalle, 1.15);
          ctx.fillRect(x + 1, 2, 14, FH - 8);
          ctx.strokeStyle = shade(pal.pared, 0.6);
          ctx.strokeRect(x + 0.5, 1.5, 15, FH - 7);
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';      // destello diagonal
          ctx.beginPath();
          ctx.moveTo(x + 3 + rng.int(0, 4), FH - 8);
          ctx.lineTo(x + 9 + rng.int(0, 4), 3);
          ctx.stroke();
        }
        zocalo(0.4);
        break;
      case 'negro_ojos': // Level 777: negro con vetas y ojos rojos
        speckle(ctx, rng, shade(pal.pared, 1.5), 12, 0, 0, w, FH);
        ctx.strokeStyle = shade(pal.detalle, 0.7);        // vetas orgánicas
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(rng.int(0, w), 0);
          ctx.quadraticCurveTo(rng.int(0, w), FH / 2, rng.int(0, w), FH);
          ctx.stroke();
        }
        if (rng.chance(0.5)) {                            // par de ojos
          const ex = rng.int(6, w - 8), ey = rng.int(5, FH - 10);
          ctx.fillStyle = '#e03040';
          ctx.beginPath(); ctx.arc(ex, ey, 1.6, 0, 7); ctx.fill();
          ctx.beginPath(); ctx.arc(ex + 5, ey, 1.6, 0, 7); ctx.fill();
        }
        break;
      case 'cristal': // Level 13: invernadero con montantes y vegetación
        ctx.fillStyle = shade(pal.detalle, 1.05);
        ctx.globalAlpha = 0.85;
        ctx.fillRect(0, 2, w, FH - 8);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = shade(pal.pared, 0.65);         // montantes
        for (let x = 0; x <= w; x += 12) {
          ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, FH - 6); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(0, FH / 2 - 2); ctx.lineTo(w, FH / 2 - 2); ctx.stroke();
        ctx.fillStyle = shade(pal.pared, 0.55);           // silueta de vegetación tras el cristal
        for (let x = 3; x < w; x += rng.int(8, 14)) {
          ctx.beginPath();
          ctx.ellipse(x, FH - 9, 4, rng.int(4, 8), 0, Math.PI, 0);
          ctx.fill();
        }
        zocalo(0.5);
        break;
      case 'tuberias': // Level 2: ladrillo + tuberías con válvulas
        ctx.strokeStyle = shade(pal.pared, 0.55);
        for (let y = 6; y < FH; y += 7) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
          for (let x = ((y / 7) | 0) % 2 ? 6 : 12; x < w; x += 12) {
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, Math.min(y + 7, FH)); ctx.stroke();
          }
        }
        ctx.fillStyle = shade(pal.detalle, 0.8);          // tubería horizontal
        ctx.fillRect(0, 6, w, 5);
        ctx.fillStyle = shade(pal.detalle, 1.1);
        ctx.fillRect(0, 6, w, 1.6);
        if (rng.chance(0.4)) {                            // válvula
          const vx = rng.int(6, w - 6);
          ctx.fillStyle = shade(pal.detalle, 1.3);
          ctx.beginPath(); ctx.arc(vx, 8.5, 3.4, 0, 7); ctx.fill();
          ctx.strokeStyle = shade(pal.detalle, 0.5);
          ctx.beginPath(); ctx.arc(vx, 8.5, 3.4, 0, 7); ctx.stroke();
        }
        break;
      case 'brutalismo': // Level 268: hormigón encofrado
        ctx.strokeStyle = shade(pal.pared, 0.8);
        for (let y = 8; y < FH; y += 9) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        ctx.fillStyle = shade(pal.pared, 0.85);           // agujeros de encofrado
        for (let x = 8; x < w; x += 16) {
          ctx.beginPath(); ctx.arc(x, 4.5, 1.3, 0, 7); ctx.fill();
          ctx.beginPath(); ctx.arc(x, FH - 5, 1.3, 0, 7); ctx.fill();
        }
        speckle(ctx, rng, shade(pal.pared, 0.9), 12, 0, 0, w, FH);
        break;
      case 'asilo': // Level 16: azulejo desconchado + arañazos
        ctx.fillStyle = shade(pal.detalle, 1.15);
        ctx.fillRect(0, FH - 12, w, 12);
        ctx.strokeStyle = shade(pal.detalle, 0.75);
        for (let x = 8; x < w; x += 8) {
          ctx.beginPath(); ctx.moveTo(x, FH - 12); ctx.lineTo(x, FH); ctx.stroke();
        }
        // desconchones
        for (let i = 0; i < 3; i++) {
          if (!rng.chance(0.6)) continue;
          ctx.fillStyle = shade(pal.pared, 0.65);
          ctx.beginPath();
          ctx.moveTo(rng.int(4, w - 8), FH - 12);
          ctx.lineTo(rng.int(4, w - 4), FH - 12 + rng.int(3, 8));
          ctx.lineTo(rng.int(2, w - 6), FH - 12 + rng.int(2, 5));
          ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = shade(pal.pared, 0.6);          // arañazos
        for (let i = 0; i < 2; i++) {
          const ax = rng.int(4, w - 10);
          ctx.beginPath(); ctx.moveTo(ax, rng.int(3, 8)); ctx.lineTo(ax + rng.int(3, 7), rng.int(9, 14)); ctx.stroke();
        }
        break;
      case 'estuco_ventanas': // Level 188: estuco con ventanitas con cortinas
        speckle(ctx, rng, shade(pal.pared, 1.08), 26, 0, 0, w, FH);
        zocalo(0.6);
        if (w >= 30 && rng.chance(0.6)) {
          const wx = w / 2 - 6;
          ctx.fillStyle = shade(pal.detalle, 0.5);        // marco
          ctx.fillRect(wx - 1.5, 4, 15, 12.5);
          ctx.fillStyle = '#c8b890';                      // cortinas cerradas
          ctx.fillRect(wx, 5.5, 12, 9.5);
          ctx.strokeStyle = shade(pal.detalle, 0.7);
          for (let cxx = wx + 2; cxx < wx + 12; cxx += 3) {
            ctx.beginPath(); ctx.moveTo(cxx, 5.5); ctx.lineTo(cxx, 15); ctx.stroke();
          }
        }
        break;
      case 'relojes': // Level 80: madera + esferas de reloj
        for (let x = 0; x < w; x += 10) {
          ctx.fillStyle = shade(pal.pared, 0.92 + ((x / 10) % 2) * 0.12);
          ctx.fillRect(x, 0, 10, FH);
        }
        zocalo(0.6);
        if (rng.chance(0.6)) {                            // esfera de reloj
          const cxx = rng.int(9, w - 9), cyy = rng.int(8, FH - 12);
          ctx.fillStyle = '#e8d8b0';
          ctx.beginPath(); ctx.arc(cxx, cyy, 5, 0, 7); ctx.fill();
          ctx.strokeStyle = '#3a2e20';
          ctx.beginPath(); ctx.arc(cxx, cyy, 5, 0, 7); ctx.stroke();
          const a = rng.f() * 7;
          ctx.beginPath(); ctx.moveTo(cxx, cyy); ctx.lineTo(cxx + Math.cos(a) * 3.6, cyy + Math.sin(a) * 3.6); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cxx, cyy); ctx.lineTo(cxx + Math.cos(a * 3) * 2.2, cyy + Math.sin(a * 3) * 2.2); ctx.stroke();
        }
        break;
      case 'nave': // Level 140: paneles oscuros + ventanillas con estrellas
        ctx.strokeStyle = shade(pal.pared, 1.35);
        for (let x = 0; x < w; x += 16) {
          ctx.strokeRect(x + 0.5, 1.5, 15, FH - 3);
        }
        ctx.fillStyle = shade(pal.pared, 1.5);            // remaches
        for (let x = 3; x < w; x += 8) ctx.fillRect(x, FH - 4, 1.5, 1.5);
        if (w >= 30 && rng.chance(0.55)) {                // ventanilla al espacio
          const wx = w / 2;
          ctx.fillStyle = '#04060a';
          ctx.beginPath(); ctx.ellipse(wx, 10, 7, 5.5, 0, 0, 7); ctx.fill();
          ctx.strokeStyle = shade(pal.pared, 1.6);
          ctx.beginPath(); ctx.ellipse(wx, 10, 7, 5.5, 0, 0, 7); ctx.stroke();
          ctx.fillStyle = '#cfe8ff';
          for (let i = 0; i < 4; i++) ctx.fillRect(wx - 5 + rng.int(0, 10), 7 + rng.int(0, 6), 1, 1);
        }
        break;
      case 'neon': // Level 399: paneles oscuros + tira de neón
        ctx.fillStyle = shade(pal.pared, 0.7);
        ctx.fillRect(0, 0, w, FH);
        ctx.strokeStyle = shade(pal.pared, 1.2);
        for (let x = 0; x < w; x += 12) {
          ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, FH); ctx.stroke();
        }
        ctx.save();                                        // tira de neón
        ctx.shadowColor = pal.detalle; ctx.shadowBlur = 6;
        ctx.fillStyle = shade(pal.detalle, 1.4);
        ctx.fillRect(0, 8, w, 2.5);
        ctx.restore();
        zocalo(0.4);
        break;
      case 'obra': // Level 484: panel blanco con cinta y brochazos
        speckle(ctx, rng, shade(pal.pared, 0.95), 14, 0, 0, w, FH);
        if (rng.chance(0.5)) {                            // brochazo de pintura fresca
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(rng.int(2, w - 14), rng.int(3, FH - 10), rng.int(8, 14), rng.int(4, 7));
          ctx.globalAlpha = 1;
        }
        if (rng.chance(0.35)) {                           // cinta de pintor
          ctx.fillStyle = '#d8c890';
          ctx.fillRect(rng.int(2, w - 10), rng.int(2, FH - 5), 9, 2.5);
        }
        zocalo(0.85);
        break;
      case 'feria': // Level 995: lona a rayas + guirnalda de bombillas
        for (let x = 0; x < w; x += 12) {
          ctx.fillStyle = ((x / 12) | 0) % 2 ? shade(pal.detalle, 1.15) : shade(pal.pared, 1.1);
          ctx.fillRect(x, 0, 12, FH);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.25)';               // pliegue de lona
        ctx.fillRect(0, FH - 8, w, 8);
        for (let x = 5; x < w; x += 10) {                 // bombillas
          const fundida = rng.chance(0.2);
          ctx.fillStyle = fundida ? '#4a4038' : '#ffd878';
          if (!fundida) { ctx.save(); ctx.shadowColor = '#ffd878'; ctx.shadowBlur = 5; }
          ctx.beginPath(); ctx.arc(x, 4, 2, 0, 7); ctx.fill();
          if (!fundida) ctx.restore();
        }
        break;
      case 'ladrillo':
        ctx.strokeStyle = shade(pal.pared, 0.55);
        for (let y = 6; y < FH; y += 7) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
          for (let x = ((y / 7) | 0) % 2 ? 6 : 12; x < w; x += 12) {
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, Math.min(y + 7, FH)); ctx.stroke();
          }
        }
        break;
      case 'azulejo':
        ctx.fillStyle = shade(pal.detalle, 1.2);
        ctx.fillRect(0, FH - 12, w, 12);
        ctx.strokeStyle = shade(pal.detalle, 0.8);
        ctx.beginPath(); ctx.moveTo(0, FH - 12); ctx.lineTo(w, FH - 12); ctx.stroke();
        for (let x = 8; x < w; x += 8) {
          ctx.beginPath(); ctx.moveTo(x, FH - 12); ctx.lineTo(x, FH); ctx.stroke();
        }
        speckle(ctx, rng, shade(pal.pared, 0.78), 10, 0, 2, w, 10);
        break;
      case 'hormigon':
        speckle(ctx, rng, shade(pal.pared, 0.8), 22, 0, 2, w, FH - 8);
        ctx.fillStyle = shade(pal.detalle, 1.35);
        ctx.fillRect(0, FH - 9, w, 4);
        break;
      case 'metal_futurista':
        ctx.strokeStyle = shade(pal.pared, 1.4);
        for (let y = 7; y < FH; y += 9) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
        ctx.fillStyle = shade(pal.pared, 1.5);
        for (let x = 4; x < w; x += 10) ctx.fillRect(x, 3, 1.5, 1.5);
        if (rng.chance(0.35)) {                           // LED de estado
          ctx.fillStyle = rng.chance(0.5) ? '#50e8a0' : '#e85050';
          ctx.fillRect(rng.int(4, w - 6), FH - 13, 2, 2);
        }
        break;
      default: // roca / estratos
        ctx.strokeStyle = shade(pal.pared, 0.68);
        for (let y = 5; y < FH; y += rng.int(5, 9)) {
          ctx.beginPath(); ctx.moveTo(0, y + rng.int(-1, 1)); ctx.lineTo(w, y + rng.int(-1, 1)); ctx.stroke();
        }
        speckle(ctx, rng, shade(pal.pared, 0.82), 18, 0, 2, w, FH - 4);
    }
  }

  // ---------- piezas de tabique fino ----------
  // topPieces[bits]: vista superior del tabique según conexiones (1=N,2=E,4=S,8=O)
  function buildTopPieces(pal, bioma, rng) {
    const pieces = [];
    const base = shade(pal.pared, 1.18);
    const edge = shade(pal.pared, 0.7);
    for (let bits = 0; bits < 16; bits++) {
      const c = canvas(TILE, TILE), ctx = c.getContext('2d');
      const rects = [];
      if (bits === 0) rects.push([B0 - 2, B0 - 2, G + 4, G + 4]); // poste aislado
      else {
        rects.push([B0, B0, G, G]);
        if (bits & 1) rects.push([B0, 0, G, B0]);        // N
        if (bits & 2) rects.push([B1, B0, TILE - B1, G]); // E
        if (bits & 4) rects.push([B0, B1, G, TILE - B1]); // S
        if (bits & 8) rects.push([0, B0, B0, G]);         // O
      }
      ctx.fillStyle = base;
      for (const [x, y, w, h] of rects) ctx.fillRect(x, y, w, h);
      // textura y bordes
      ctx.save();
      ctx.beginPath();
      for (const [x, y, w, h] of rects) ctx.rect(x, y, w, h);
      ctx.clip();
      speckle(ctx, rng, shade(pal.pared, 1.05), 40, 0, 0, TILE, TILE);
      ctx.restore();
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1;
      for (const [x, y, w, h] of rects) ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      pieces.push(c);
    }
    return pieces;
  }

  // faceTexs: 3 variantes de textura de cara a lo ancho completo (48×FH).
  // El render recorta el segmento expuesto → el rayado casa entre tiles contiguos.
  function buildFaceTexs(pal, bioma, rng) {
    const out = [];
    for (let v = 0; v < 3; v++) {
      const c = canvas(TILE, FH), ctx = c.getContext('2d');
      ctx.fillStyle = shade(pal.pared, 0.95);
      ctx.fillRect(0, 0, TILE, FH);
      faceDetail(ctx, pal, bioma, rng, TILE);
      // sombreado de volumen: más oscuro hacia abajo
      const grad = ctx.createLinearGradient(0, 0, 0, FH);
      grad.addColorStop(0, 'rgba(255,255,255,0.06)');
      grad.addColorStop(0.6, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, TILE, FH);
      out.push(c);
    }
    return out;
  }

  // árbol (bosque) y roca (exterior): paredes orgánicas, sin autotile
  function arbolTile(pal, rng) {
    const c = canvas(TILE, TILE + 18), ctx = c.getContext('2d');
    const cx = TILE / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(cx, TILE + 8, 16, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#4a3a2a';
    ctx.fillRect(cx - 4, TILE - 12, 8, 26);
    ctx.fillStyle = '#5a4632';
    ctx.fillRect(cx - 1, TILE - 12, 4, 26);
    ctx.fillStyle = shade(pal.pared, 0.9);
    ctx.beginPath(); ctx.ellipse(cx, 20, 21, 17, 0, 0, 7); ctx.fill();
    ctx.fillStyle = shade(pal.pared, 1.18);
    ctx.beginPath(); ctx.ellipse(cx - 6, 14, 11, 8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = shade(pal.pared, 0.7);
    ctx.beginPath(); ctx.ellipse(cx + 8, 26, 9, 7, 0, 0, 7); ctx.fill();
    return c;
  }

  function rocaTile(pal, rng) {
    const c = canvas(TILE, TILE + 10), ctx = c.getContext('2d');
    const cx = TILE / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(cx, TILE + 2, 18, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = shade(pal.pared, 1.0);
    ctx.beginPath();
    ctx.moveTo(6, TILE);
    ctx.lineTo(4, 26); ctx.lineTo(14, 12); ctx.lineTo(30, 8);
    ctx.lineTo(42, 20); ctx.lineTo(44, TILE);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(pal.pared, 1.25);
    ctx.beginPath(); ctx.moveTo(14, 12); ctx.lineTo(30, 8); ctx.lineTo(34, 22); ctx.lineTo(16, 26); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = shade(pal.pared, 0.6);
    ctx.beginPath(); ctx.moveTo(16, 26); ctx.lineTo(34, 22); ctx.moveTo(24, 24); ctx.lineTo(26, TILE - 4); ctx.stroke();
    return c;
  }

  function aguaTile(pal, rng) {
    const c = canvas(TILE, TILE), ctx = c.getContext('2d');
    ctx.fillStyle = shade(pal.detalle, 0.65);
    ctx.fillRect(0, 0, TILE, TILE);
    ctx.strokeStyle = shade(pal.detalle, 1.35);
    for (let i = 0; i < 4; i++) {
      const y = rng.int(6, TILE - 6);
      ctx.beginPath();
      ctx.moveTo(rng.int(2, 12), y);
      ctx.quadraticCurveTo(TILE / 2, y + rng.int(-4, 4), TILE - rng.int(2, 12), y);
      ctx.stroke();
    }
    return c;
  }

  function decorTile(pal, bioma, estiloSuelo, rng) {
    const base = floorTile(pal, estiloSuelo, rng, 1);
    const ctx = base.getContext('2d');
    if (bioma === 'torres') {                         // viga sobre el vacío
      ctx.fillStyle = shade(pal.pared, 1.1);
      ctx.fillRect(TILE / 2 - 7, 0, 14, TILE);
      ctx.strokeStyle = shade(pal.pared, 1.5);
      ctx.strokeRect(TILE / 2 - 7 + 0.5, 0.5, 13, TILE - 1);
    } else if (bioma === 'garaje') {                  // mancha de aceite
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = shade(pal.detalle, 1.1);
      ctx.beginPath(); ctx.ellipse(TILE / 2, TILE / 2, 16, 9, 0.4, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      speckle(ctx, rng, shade(pal.detalle, 1.05), 24, 8, 8, TILE - 16, TILE - 16, 2);
    }
    return base;
  }

  // versión oscurecida de un canvas (lados extruidos del parallax 2.5D)
  function darken(src, f) {
    const c = canvas(src.width, src.height), ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(0,0,0,${1 - f})`;
    ctx.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // estilos por defecto si la ficha no especifica (compatibilidad)
  const FALLBACK = {
    pasillos: ['papel_rayas', 'moqueta'], garaje: ['hormigon', 'hormigon'],
    tuneles: ['ladrillo', 'hormigon'], hospital: ['azulejo', 'baldosa'],
    oficinas: ['azulejo', 'baldosa'], exterior: ['roca', 'tierra'],
    bosque: ['arbol', 'hierba'], ciudad: ['ladrillo', 'adoquin'],
    torres: ['metal_futurista', 'panel'],
  };

  window.Tiles = {
    TILE, G, B0, B1, FH,
    shade,
    build(levelDef, rng) {
      const pal = levelDef.paleta;
      const fb = FALLBACK[levelDef.bioma] ?? ['papel_rayas', 'moqueta'];
      const estiloPared = levelDef.estilo?.pared ?? fb[0];
      const estiloSuelo = levelDef.estilo?.suelo ?? fb[1];
      const wallStyle = estiloPared === 'arbol' ? 'arbol' : estiloPared === 'roca' ? 'roca' : 'tabique';
      const out = {
        wallStyle,
        suelo: [0, 1, 2].map((v) => floorTile(pal, estiloSuelo, rng, v)),
        agua: aguaTile(pal, rng),
        decor: decorTile(pal, levelDef.bioma, estiloSuelo, rng),
        topPieces: wallStyle === 'tabique' ? buildTopPieces(pal, estiloPared, rng) : null,
        topPiecesSombra: null, // se rellena abajo
        faceTexs: wallStyle === 'tabique' ? buildFaceTexs(pal, estiloPared, rng) : null,
        arbol: wallStyle === 'arbol' ? arbolTile(pal, rng) : null,
        roca: wallStyle === 'roca' ? rocaTile(pal, rng) : null,
      };
      if (out.topPieces) out.topPiecesSombra = out.topPieces.map((c) => darken(c, 0.55));
      return out;
    },
    darken,
  };
})();
