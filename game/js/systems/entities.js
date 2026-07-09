// Entidades: IA por turnos según el comportamiento de su ficha.
(function () {
  const { walkable } = MapGen;

  function create(spawns, defs, rng) {
    return spawns.map((s, i) => {
      const def = defs[s.id];
      return {
        uid: i,
        id: s.id,
        def,
        x: s.x, y: s.y,
        estado: 'latente',       // latente | alerta | caza
        revelada: def.comportamiento !== 'imita' && def.comportamiento !== 'emboscada',
        dormida: def.comportamiento === 'cazador' ? 22 + rng.int(0, 8) : 0,
        pasoExtra: 0,
        viva: true,
        vida: def.vida ?? 40,
        paralizada: 0,           // turnos inmovilizada (guante de parálisis)
        huyendo: 0,              // turnos huyendo (fuego griego)
        preparando: false,       // telegraph: golpe anunciado (⚠)
        yaAviso: false,          // el Cazador solo telegrafía su primer golpe
        sinVerte: 0,             // turnos sin detectarte (pérdida de rastro)
      };
    });
  }

  const dist2 = (a, b, x, y) => (a - x) ** 2 + (b - y) ** 2;

  function occupied(world, x, y, self) {
    if (world.player.x === x && world.player.y === y) return true;
    return world.entities.some((e) => e.viva && e !== self && e.x === x && e.y === y);
  }

  function tileWalkable(world, x, y) {
    const g = world.map.grid;
    if (x < 0 || y < 0 || x >= g.w || y >= g.h) return false;
    return walkable(g.t[y * g.w + x]);
  }

  // un paso hacia el jugador usando el mapa de Dijkstra precalculado
  function stepToward(world, e) {
    const g = world.map.grid, dm = world.dmap;
    let best = null, bestV = dm[e.y * g.w + e.x];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = e.x + dx, ny = e.y + dy;
      if (!tileWalkable(world, nx, ny) || occupied(world, nx, ny, e)) continue;
      const v = dm[ny * g.w + nx];
      if (v >= 0 && v < bestV) { bestV = v; best = [nx, ny]; }
    }
    if (best) { e.x = best[0]; e.y = best[1]; return true; }
    return false;
  }

  function stepRandom(world, e, rng) {
    const dirs = rng.shuffle([[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]]);
    for (const [dx, dy] of dirs) {
      const nx = e.x + dx, ny = e.y + dy;
      if (dx === 0 && dy === 0) return;
      if (tileWalkable(world, nx, ny) && !occupied(world, nx, ny, e)) {
        e.x = nx; e.y = ny;
        return;
      }
    }
  }

  function adjacentToPlayer(world, e) {
    return Math.abs(e.x - world.player.x) + Math.abs(e.y - world.player.y) === 1;
  }

  function playerInDark(world) {
    // ¿está el jugador en penumbra? (nivel oscuro y sin linterna)
    const luzJugador = world.player.luz ? 1 : 0;
    return world.level.oscuridad >= 0.5 && !luzJugador;
  }

  function detecta(world, e, rng) {
    const d = e.def.deteccion;
    const dd = Math.sqrt(dist2(e.x, e.y, world.player.x, world.player.y));

    // escondido (v18): dentro de una taquilla eres casi indetectable — salvo
    // que te vieran entrar; cerca, cada turno hay riesgo de que te huelan
    if (world.escondido) {
      if (world.escondido.delatado) return dd <= 2;
      if (dd <= 3 && rng && rng.chance(e.def.comportamiento === 'cazador' ? 0.15 : 0.04)) {
        world.escondido.delatado = true;
        world.log('Unos dedos arañan tu escondite. TE HAN ENCONTRADO.', 'danger');
        if (window.Sfx) Sfx.cue(e.def.glyph);
        return true;
      }
      return false;
    }

    // Sintonía alta (v18): lo que no es cazador te huele como cosa del lugar
    // y cada vez le importas menos
    const sint = world.player.sintonia || 0;
    if (sint >= 30 && rng && e.def.comportamiento !== 'cazador' &&
        rng.chance((sint - 20) / 180)) return false;

    // pies de moqueta (−2) y botas reforzadas (−1): te detectan más tarde
    const rMod = (world.instinto && world.instinto('pies_moqueta') ? -2 : 0) +
      (world.equipado && world.equipado('botas_reforzadas') ? -1 : 0);
    const radio = Math.max(1, (d.radio ?? 6) + rMod);
    const ver = () => FOV.los(world.map.grid, e.x, e.y, world.player.x, world.player.y);
    switch (d.tipo) {
      case 'vista': return dd <= radio && ver();
      case 'oscuridad': return dd <= radio && ver() && playerInDark(world);
      case 'luz': return world.player.luz && dd <= radio &&
        !(world.instinto && world.instinto('piel_fluorescente')); // te creen una luz más
      case 'adyacente':
      case 'contacto': return dd <= (d.radio || 1);
      case 'sigilo': return dd <= radio && ver();
      case 'global': return true;
      default: return dd <= Math.max(1, 6 + rMod) && ver();
    }
  }

  function atacar(world, e, rng) {
    // un solo intento por turno (hay varios puntos del código que pueden llamar)
    if (e._turnoAtaque === world.turnTotal) return;
    e._turnoAtaque = world.turnTotal;
    const def = e.def;

    // TELEGRAPH (v18): el golpe se ANUNCIA (⚠) un turno antes — si te mueves,
    // falla. El Cazador solo avisa su primer golpe: después ya sabes lo que es.
    const avisa = def.comportamiento !== 'cazador' || !e.yaAviso;
    if (!e.preparando && avisa) {
      e.preparando = true;
      e.yaAviso = true;
      e._prepT = performance.now();
      if (window.Effects) Effects.number(e.x, e.y, '⚠', '#ffd860');
      if (window.Sfx) Sfx.cue('generico');
      return;
    }
    e.preparando = false;

    // reflejos de errante: 25% de esquivar el golpe que viste venir
    if (rng && world.instinto && world.instinto('reflejos_errante') && rng.chance(0.25)) {
      e._atkT = performance.now();
      world.log(`Te apartas por puro instinto: ${def.nombre} desgarra el aire.`, 'good');
      return;
    }

    // feedback visual: embestida + flash + sacudida + salpicadura
    e._atkT = performance.now();
    e._hitT = performance.now();
    if (window.Effects) {
      Effects.doShake(6, 180);
      Effects.particles(world.player.x, world.player.y, '#b03030', 12);
    }
    if (window.Sfx) Sfx.play('golpe');
    // que te saquen de un escondite duele MÁS
    const mult = world.escondido ? 1.5 : 1;
    world._fuenteDano = def.glyph;
    world.hurt(Math.round(def.dano * mult), def.nombre);
    if (world.escondido) {
      world.escondido = null;
      world.log('¡Te ARRANCAN del escondite!', 'danger');
    }
    if (def.danoCordura) world.sanity(-def.danoCordura);
    world.log(`¡${def.nombre} te ataca!`, 'danger');
    if (def.comportamiento === 'emboscada') e.revelada = true;
  }

  // un paso ALEJÁNDOSE del jugador (huida por el fuego griego)
  function stepAway(world, e) {
    const g = world.map.grid, dm = world.dmap;
    let best = null, bestV = dm[e.y * g.w + e.x];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = e.x + dx, ny = e.y + dy;
      if (!tileWalkable(world, nx, ny) || occupied(world, nx, ny, e)) continue;
      const v = dm[ny * g.w + nx];
      if (v > bestV) { bestV = v; best = [nx, ny]; }
    }
    if (best) { e.x = best[0]; e.y = best[1]; }
  }

  // un paso en línea recta hacia un punto (investigar ruidos)
  function stepHacia(world, e, tx, ty) {
    const dx = Math.sign(tx - e.x), dy = Math.sign(ty - e.y);
    const opciones = Math.abs(tx - e.x) > Math.abs(ty - e.y)
      ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];
    for (const [mx, my] of opciones) {
      if (!mx && !my) continue;
      if (tileWalkable(world, e.x + mx, e.y + my) && !occupied(world, e.x + mx, e.y + my, e)) {
        e.x += mx; e.y += my;
        return;
      }
    }
  }

  function stepEntity(world, e, rng) {
    const comp = e.def.comportamiento;

    // estados alterados por objetos de defensa
    if (e.paralizada > 0) { e.paralizada--; return; }
    if (e.huyendo > 0) {
      e.huyendo--;
      e.preparando = false;
      stepAway(world, e);
      if (e.def.velocidad > 1) stepAway(world, e);
      return;
    }
    // distraída por un objeto arrojado (v20): este turno va hacia el señuelo
    if (e.distraida > 0) {
      e.distraida--;
      e.preparando = false;
      if (world.ruido) stepHacia(world, e, world.ruido.x, world.ruido.y);
      return;
    }

    // golpe telegrafiado que ya no te alcanza: falla (te moviste a tiempo)
    if (e.preparando && !adjacentToPlayer(world, e)) {
      e.preparando = false;
      world.log(`${e.def.nombre} desgarra el aire donde estabas.`, 'good');
    }

    // el Cazador duerme al principio: pasos lejanos que se acercan
    if (comp === 'cazador') {
      if (e.dormida > 0) {
        e.dormida--;
        if (e.dormida === 12) world.log('Oyes pasos lejanos entre los pasillos…', 'event');
        if (e.dormida === 4) world.log('Los pasos se aceleran. Vienen hacia ti.', 'event');
        if (e.dormida === 0) {
          e.estado = 'caza';
          world.log('EL CAZADOR TE HA ENCONTRADO.', 'danger');
          if (window.Sfx) Sfx.cue('hunter');
        }
        return;
      }
      e.estado = 'caza';
      // escondido y sin delatar: el Cazador ronda tu último rastro, no te ve
      if (world.escondido && !world.escondido.delatado && !detecta(world, e, rng)) {
        stepRandom(world, e, rng);
        return;
      }
      if (adjacentToPlayer(world, e)) return atacar(world, e, rng);
      stepToward(world, e);
      // cada 3 turnos, un paso extra: es implacable
      if (++e.pasoExtra % 3 === 0 && !adjacentToPlayer(world, e)) stepToward(world, e);
      if (adjacentToPlayer(world, e)) atacar(world, e, rng);
      return;
    }

    // trampas estáticas y emboscadas: no se mueven
    if (comp === 'estatica_trampa' || comp === 'emboscada') {
      if (detecta(world, e, rng) && adjacentToPlayer(world, e)) atacar(world, e, rng);
      return;
    }

    // imitador: quieto hasta que estás cerca; entonces se revela y caza
    if (comp === 'imita') {
      if (!e.revelada) {
        if (detecta(world, e, rng)) {
          e.revelada = true;
          e.estado = 'caza';
          world.log(`Esa figura no era humana. ¡${e.def.nombre}!`, 'danger');
          if (window.Sfx) Sfx.cue('generico');
        }
        return;
      }
    }

    const detectado = detecta(world, e, rng);
    if (detectado) {
      if (e.estado !== 'caza' && window.Sfx) Sfx.cue(e.def.glyph); // te ha visto
      e.estado = 'caza';
      e.sinVerte = 0;
    }
    else if (e.estado === 'caza' && !detectado) {
      // perder el rastro DE VERDAD (v18): 3 turnos sin detectarte y abandona
      if (++e.sinVerte >= 3) {
        e.estado = 'alerta';
        e.sinVerte = 0;
      }
    }

    // smilers y acechadores no pueden cazar bajo la luz
    if (comp === 'acecho_oscuridad' && !playerInDark(world) && e.estado === 'caza') {
      e.estado = 'alerta';
    }

    // RUIDO (v18): lo que no está cazando investiga los sonidos recientes
    const rd = world.ruido;
    if (rd && e.estado !== 'caza' &&
        Math.abs(e.x - rd.x) + Math.abs(e.y - rd.y) <= rd.radio) {
      if (adjacentToPlayer(world, e) && (!world.escondido || detectado)) { atacar(world, e, rng); return; }
      e.estado = 'alerta';
      stepHacia(world, e, rd.x, rd.y);
      if (e.def.velocidad > 1) stepHacia(world, e, rd.x, rd.y);
      return; // este turno lo dedica a investigar
    }

    const vel = e.def.velocidad;
    const puedeAtacar = !world.escondido || detectado;
    for (let paso = 0; paso < vel; paso++) {
      if (adjacentToPlayer(world, e) && puedeAtacar) { atacar(world, e, rng); return; }
      if (e.estado === 'caza') stepToward(world, e);
      else if (comp === 'errante' || e.estado === 'alerta') {
        if (paso === 0) stepRandom(world, e, rng);
      } else if (comp === 'atraida_luz' && !world.player.luz) {
        if (paso === 0 && rng.chance(0.5)) stepRandom(world, e, rng);
      }
    }
    if (adjacentToPlayer(world, e) && e.estado === 'caza' && puedeAtacar) atacar(world, e, rng);

    // los errantes hostiles solo atacan si los tocas de cerca mucho tiempo
    if (comp === 'errante' && adjacentToPlayer(world, e) && puedeAtacar && rng.chance(0.25)) atacar(world, e, rng);
  }

  function stepAll(world, rng) {
    for (const e of world.entities) if (e.viva) stepEntity(world, e, rng);
  }

  window.Entities = { create, stepAll };
})();
