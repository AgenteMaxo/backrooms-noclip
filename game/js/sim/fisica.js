// BACKROOMS MMO v22 — física del movimiento libre. UNA sola fuente de verdad:
// este archivo corre en el NAVEGADOR (window.Fisica, predicción local) y en el
// SERVIDOR (module.exports, integración autoritativa). Si cliente y servidor
// integran igual, la reconciliación casi nunca corrige.
//
// Convención de coordenadas (la histórica del juego): la posición lógica
// `pos` es la esquina del tile — el CENTRO físico/visual está en pos+0.5.
// Todas las funciones de aquí aceptan y devuelven `pos` y convierten dentro.
(function () {
  'use strict';

  const RADIO = 0.35;          // radio del cuerpo (en tiles)
  const VEL_JUGADOR = 4.6;     // tiles/segundo
  const SUBPASO = 0.2;         // integración por tramos: nada atraviesa esquinas

  // transitable según los valores de MapGen.T (0 suelo, 1 pared, 2 vacío,
  // 3 agua, 4 suelo decorado) — duplicado aquí a propósito: este archivo no
  // puede depender de mapgen en el servidor ni de window en Node
  function transitable(grid, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= grid.w || ty >= grid.h) return false;
    const t = grid.t[ty * grid.w + tx];
    return t === 0 || t === 3 || t === 4;
  }

  // ¿el círculo con centro (cx,cy) y radio r pisa algún tile NO transitable?
  function chocaCentro(grid, cx, cy, r) {
    const x0 = Math.floor(cx - r), x1 = Math.floor(cx + r);
    const y0 = Math.floor(cy - r), y1 = Math.floor(cy + r);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        if (transitable(grid, tx, ty)) continue;
        // punto del tile más cercano al centro del círculo
        const px = Math.max(tx, Math.min(cx, tx + 1));
        const py = Math.max(ty, Math.min(cy, ty + 1));
        if ((cx - px) ** 2 + (cy - py) ** 2 < r * r) return true;
      }
    return false;
  }

  // Integra un desplazamiento con colisión y DESLIZAMIENTO por paredes:
  // cada subpaso intenta el eje X y el eje Y por separado (si la diagonal
  // choca, resbala por el eje libre). Devuelve la nueva `pos`.
  function mover(grid, x, y, dx, dy, dt, vel, radio) {
    const r = radio ?? RADIO;
    const m = Math.hypot(dx, dy);
    if (!m || !dt) return [x, y];
    const paso = (vel ?? VEL_JUGADOR) * dt;
    const ux = (dx / m) * paso, uy = (dy / m) * paso;
    let cx = x + 0.5, cy = y + 0.5;
    const n = Math.max(1, Math.ceil(paso / SUBPASO));
    for (let i = 0; i < n; i++) {
      const sx = ux / n, sy = uy / n;
      if (!chocaCentro(grid, cx + sx, cy, r)) cx += sx;
      if (!chocaCentro(grid, cx, cy + sy, r)) cy += sy;
    }
    return [cx - 0.5, cy - 0.5];
  }

  function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  // tile lógico que pisa una posición continua (el centro manda)
  function tileDe(v) { return Math.floor(v + 0.5); }

  const Fisica = { RADIO, VEL_JUGADOR, transitable, mover, dist, tileDe,
    choca: (grid, x, y, r) => chocaCentro(grid, x + 0.5, y + 0.5, r ?? RADIO) };

  if (typeof module !== 'undefined' && module.exports) module.exports = Fisica;
  if (typeof window !== 'undefined') window.Fisica = Fisica;
})();
