// BACKROOMS MMO — jugadores remotos en tu pantalla.
// Mantiene el censo (world.otros), interpola sus posiciones y dibuja la capa
// social: nombre flotante y bocadillos de chat POR JUGADOR (a diferencia de
// Effects.bubble, aquí pueden hablar varios a la vez sin hacer cola).
(function () {
  const porId = new Map(); // id -> otro
  let miId = null;

  const CHAT_DUR = 4200; // ms de vida de un bocadillo de chat

  function reset(id) {
    porId.clear();
    miId = id;
    const w = window.Game && Game.world;
    if (w) w.otros = [];
  }

  function sincroniza() {
    const w = window.Game && Game.world;
    if (w) w.otros = [...porId.values()];
  }

  function entra(j) {
    if (j.id === miId) return;
    porId.set(j.id, {
      id: j.id, nombre: j.nombre, x: j.x, y: j.y,
      rx: j.x, ry: j.y, rot: j.rot ?? 2,
      chat: null, chatT: 0,
      escondido: !!j.escondido, luz: false,
    });
    sincroniza();
  }

  function esconde(id, si) {
    const o = porId.get(id);
    if (o) o.escondido = !!si;
  }

  function luz(id, si) {
    const o = porId.get(id);
    if (o) o.luz = !!si;
  }

  function sale(id) {
    porId.delete(id);
    sincroniza();
  }

  function mueve(id, x, y) { // teleports (spawn/noclip/corrección)
    const o = porId.get(id);
    if (!o) return;
    if (Math.abs(x - o.x) + Math.abs(y - o.y) > 3) { o.rx = x; o.ry = y; }
    o.x = x; o.y = y;
  }

  // v22: actualización continua de posición (batched); el facing se deriva
  // del propio movimiento salvo que llegue un 'gira' explícito reciente
  function pos(id, x, y) {
    const o = porId.get(id);
    if (!o) return;
    const dx = x - o.x, dy = y - o.y;
    if ((dx || dy) && performance.now() - (o.giroT || 0) > 400)
      o.rot = Math.atan2(dx, -dy);
    o.x = x; o.y = y;
  }

  function gira(id, rot) {
    const o = porId.get(id);
    if (o) { o.rot = rot; o.giroT = performance.now(); }
  }

  // cuantiza un ángulo θ a las 4 direcciones de sprite (0 N, 1 E, 2 S, 3 O)
  function dir4(th) {
    return ((Math.round((th || 0) / (Math.PI / 2)) % 4) + 4) % 4;
  }

  // txt ya viene filtrado por el servidor
  function chat(id, txt, t) {
    const ahora = t ?? performance.now();
    if (id === miId) {
      propio = { txt, t0: ahora };
      return;
    }
    const o = porId.get(id);
    if (!o) return;
    o.chat = txt;
    o.chatT = ahora;
  }
  let propio = null; // tu último mensaje: también flota sobre tu cabeza

  // interpolación por frame (mismo lerp que usan entidades y jugador)
  function frame() {
    for (const o of porId.values()) {
      o.rx += (o.x - o.rx) * 0.22;
      o.ry += (o.y - o.ry) * 0.22;
    }
  }

  // ---------- capa 2D sobre ambos renders ----------
  // proj(wx, wy) → [sx, sy] en píxeles de pantalla (los renders ya la tienen).
  function burbuja(ctx, sx, sy, txt, k) {
    const a = Math.min(1, k * 6, (1 - k) * 4);
    if (a <= 0) return;
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = '15px VT323, "Courier New", monospace';
    const tw = Math.min(280, ctx.measureText(txt).width);
    const bw = tw + 16, bh = 24;
    const bx = sx - bw / 2, by = sy - 96 - (1 - Math.min(1, k * 6)) * 6;
    ctx.fillStyle = 'rgba(14,12,9,0.92)';
    ctx.strokeStyle = 'rgba(216,201,138,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 5);
    ctx.fill(); ctx.stroke();
    // cola del bocadillo
    ctx.beginPath();
    ctx.moveTo(sx - 4, by + bh); ctx.lineTo(sx + 4, by + bh); ctx.lineTo(sx, by + bh + 6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8dcae';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, sx, by + bh / 2 + 1, 280);
    ctx.globalAlpha = 1;
  }

  function nombre(ctx, sx, sy, txt) {
    ctx.font = '12px VT323, "Courier New", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(txt).width;
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = 'rgba(10,9,6,0.7)';
    ctx.fillRect(sx - tw / 2 - 4, sy - 78, tw + 8, 14);
    ctx.fillStyle = '#cfc491';
    ctx.fillText(txt, sx, sy - 71);
    ctx.globalAlpha = 1;
  }

  const RADIO_SOCIAL = 13; // casillas: los nombres se leen solo de cerca

  function overlay(ctx, proj, world, t) {
    frame();
    const p = world?.player;
    for (const o of porId.values()) {
      if (o.escondido) continue; // dentro de una taquilla no hay nombre que leer
      const [sx, sy] = proj(o.rx, o.ry);
      if (sx < -80 || sy < -80 || sx > ctx.canvas.width + 80 || sy > ctx.canvas.height + 80) continue;
      // capa social de PROXIMIDAD: de lejos ves una figura, no sabes quién es
      const cercano = p && Math.hypot(o.rx - p.rx, o.ry - p.ry) <= RADIO_SOCIAL;
      if (cercano) nombre(ctx, sx, sy, o.nombre);
      if (o.chat) {
        const k = (t - o.chatT) / CHAT_DUR;
        if (k >= 1) o.chat = null;
        else if (cercano) burbuja(ctx, sx, sy, o.chat, k);
      }
    }
    // tu propio mensaje, sobre tu cabeza
    if (propio && world?.player) {
      const k = (t - propio.t0) / CHAT_DUR;
      if (k >= 1) propio = null;
      else {
        const [sx, sy] = proj(world.player.rx, world.player.ry);
        burbuja(ctx, sx, sy, propio.txt, k);
      }
    }
  }

  // sprite del jugador remoto RELATIVO a la cámara (ángulos en radianes, v22)
  function spriteDe(o, camTh) {
    const rel = dir4((o.rot || 0) - (camTh || 0));
    if (rel === 0) return ['player_up', false];
    if (rel === 2) return ['player_down', false];
    return ['player_side', rel === 3];
  }

  window.Otros = { reset, entra, sale, mueve, pos, gira, chat, esconde, luz, overlay, spriteDe, dir4, frame,
    get lista() { return [...porId.values()]; } };
})();
