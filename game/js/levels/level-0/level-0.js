// Comportamiento exclusivo de Level 0.
// Los recursos visuales usan el manifiesto y el cargador común de Tiles; aquí
// solo viven reglas que no comparte ningún otro nivel.
(function () {
  const ID = 'level-0';

  function frame(world, t) {
    // Susurros de la Sala Manila: mas frecuentes cuanto mas cerca esta el
    // jugador. Sfx decide si usa muestras reales o sintesis WebAudio.
    const m = world.map?.manila;
    const p = world.player;
    if (!m || !p || !window.Sfx || world.over) return;
    const cx = m.x + m.w / 2, cy = m.y + m.h / 2;
    const d = Math.hypot(p.rx - cx, p.ry - cy);
    const alcance = Math.max(m.w, m.h) / 2 + 10;
    if (d > alcance) {
      world._susurroNext = 0;
      return;
    }
    const prox = 1 - d / alcance;
    if (!world._susurroNext) world._susurroNext = t + 3000 + Math.random() * 6000;
    else if (t >= world._susurroNext) {
      world._susurroNext = t + 4000 + Math.random() * (10000 * (1 - prox * 0.6));
      window.Sfx.susurros(0.5 + prox * 0.7);
    }
  }

  function turno(world, contexto) {
    // La unica luz naranja de Manila sufre apagones ocasionales.
    if (!contexto?.dentroManila) return;
    const now = performance.now();
    if (!world._apagonEn) world._apagonEn = now + 30000 + world.rng.int(0, 40000);
    else if (now >= world._apagonEn) {
      world._apagonEn = now + 30000 + world.rng.int(0, 40000);
      world.manilaApagon = { hasta: now + 1600 + world.rng.int(0, 2200) };
      window.Sfx?.susurros(1.4);
    }
  }

  window.Levels.registrar(ID, {
    frame,
    turno,
  });
})();
