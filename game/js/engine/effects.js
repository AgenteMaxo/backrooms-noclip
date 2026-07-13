// Efectos visuales temporales: números de daño, partículas, sacudida de
// pantalla, destellos. La lógica del juego los encola; el render los dibuja.
(function () {
  let list = [];
  let shake = { mag: 0, until: 0 };

  function now() { return performance.now(); }

  // número flotante en coordenadas de casilla (wx, wy)
  function number(wx, wy, txt, color) {
    list.push({ type: 'num', wx, wy, txt, color, t0: now(), dur: 950 });
  }

  // salpicadura de partículas
  function particles(wx, wy, color, n = 10) {
    const pieces = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 20 + Math.random() * 55;
      pieces.push({ a, v, r: 1.5 + Math.random() * 2 });
    }
    list.push({ type: 'part', wx, wy, color, pieces, t0: now(), dur: 550 });
  }

  // destello circular (recogidas, curas)
  function flash(wx, wy, color) {
    list.push({ type: 'flash', wx, wy, color, t0: now(), dur: 400 });
  }

  // proyectil visible (bisturí volador de Level 14, etc.)
  function proyectil(x0, y0, x1, y1, color) {
    list.push({ type: 'proy', x0, y0, x1, y1, color, t0: now(), dur: 380 });
  }

  // bocadillo de pensamiento sobre el personaje (HUD contextual v15);
  // se encolan: nunca se pisan dos a la vez. Si se pasa `ref` (el jugador),
  // el bocadillo LE SIGUE en vez de quedarse clavado en la casilla (v16)
  let bubbleEnd = 0;
  function bubble(wx, wy, txt, ref) {
    const t0 = Math.max(now(), bubbleEnd);
    list.push({ type: 'bub', wx, wy, txt, ref, t0, dur: 2600 });
    bubbleEnd = t0 + 2200;
  }

  function doShake(mag = 5, dur = 160) {
    shake = { mag, until: now() + dur };
  }

  function shakeOffset(t) {
    if (t > shake.until) return [0, 0];
    const k = (shake.until - t) / 200;
    return [(Math.random() * 2 - 1) * shake.mag * k, (Math.random() * 2 - 1) * shake.mag * k];
  }

  // proj opcional: función (wx, wy) => [sx, sy] para el render 3D
  function draw(ctx, camX, camY, t, TILE, proj) {
    list = list.filter((e) => t - e.t0 < e.dur);
    const P = proj || ((wx, wy) => [wx * TILE - camX + TILE / 2, wy * TILE - camY + TILE / 2]);
    for (const e of list) {
      if (t < e.t0) continue; // bocadillos en cola: aún no les toca
      // el timestamp del rAF puede ir ligeramente por detrás de performance.now()
      const k = Math.min(1, Math.max(0, (t - e.t0) / e.dur));
      // los bocadillos con referencia viajan con su dueño (encima de la cabeza)
      const [sx, sy, detras] = e.ref ? P(e.ref.rx, e.ref.ry) : P(e.wx, e.wy);
      if (detras) continue; // el dueño queda detrás de la cámara: no dibujar
      ctx.save();
      if (e.type === 'bub') {
        // fundido de entrada/salida
        const a = Math.min(1, k * 8, (1 - k) * 5);
        ctx.globalAlpha = Math.max(0, a);
        ctx.font = '16px VT323, "Courier New", monospace';
        const tw = ctx.measureText(e.txt).width;
        const bw = tw + 18, bh = 26;
        const bx = sx - bw / 2, by = sy - 92;
        ctx.fillStyle = 'rgba(14,12,9,0.92)';
        ctx.strokeStyle = '#8a7a3d';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 4);
        ctx.fill(); ctx.stroke();
        ctx.beginPath();                               // cola del bocadillo
        ctx.moveTo(sx - 5, by + bh); ctx.lineTo(sx + 5, by + bh); ctx.lineTo(sx, by + bh + 8);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#efe8d0';
        ctx.textAlign = 'center';
        ctx.fillText(e.txt, sx, by + 18);
        ctx.restore();
        continue;
      }
      if (e.type === 'num') {
        ctx.globalAlpha = 1 - k * k;
        ctx.font = 'bold 15px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.fillText(e.txt, sx + 1, sy - 14 - k * 26 + 1);
        ctx.fillStyle = e.color;
        ctx.fillText(e.txt, sx, sy - 14 - k * 26);
      } else if (e.type === 'part') {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = e.color;
        for (const p of e.pieces) {
          const d = p.v * k;
          ctx.fillRect(sx + Math.cos(p.a) * d - p.r, sy + Math.sin(p.a) * d - p.r + k * k * 18, p.r * 2, p.r * 2);
        }
      } else if (e.type === 'flash') {
        ctx.globalAlpha = (1 - k) * 0.7;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(sx, sy, 6 + k * 20, 0, 7);
        ctx.stroke();
      } else if (e.type === 'proy') {
        // hoja metálica girando hacia el objetivo, con estela
        const [px, py] = P(e.x0 + (e.x1 - e.x0) * k, e.y0 + (e.y1 - e.y0) * k);
        const [qx, qy] = P(e.x0 + (e.x1 - e.x0) * Math.max(0, k - 0.12), e.y0 + (e.y1 - e.y0) * Math.max(0, k - 0.12));
        const ang = Math.atan2(py - qy, px - qx) + k * 9;
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = e.color;
        ctx.beginPath();
        ctx.moveTo(qx, qy);
        ctx.lineTo(px, py);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang);
        // Hoja metálica estándar (bisturí)
        ctx.fillStyle = e.color;                      // hoja
        ctx.beginPath();
        ctx.moveTo(7, 0); ctx.lineTo(-3, -2.5); ctx.lineTo(-3, 2.5);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#5a4a3a';                    // mango
        ctx.fillRect(-8, -1.5, 5, 3);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';      // destello
        ctx.fillRect(2, -0.7, 3, 1.4);
        ctx.restore();
      }
      ctx.restore();
    }
  }

  window.Effects = { number, particles, flash, proyectil, bubble, doShake, shakeOffset, draw, clear() { list = []; } };
})();
