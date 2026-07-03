// Núcleo del juego: estado del mundo, sistema por turnos, transiciones,
// estadísticas, muerte permanente y victoria.
(function () {
  const { T, walkable } = MapGen;

  const world = {
    data: null,
    runSeed: '',
    rng: null,
    level: null,
    map: null,
    tiles: null,
    entities: [],
    player: null,
    turn: 0,
    turnTotal: 0,
    explored: null,
    light: null,
    dmap: null,
    camera: { x: 0, y: 0 },
    journal: [],
    visited: [],
    prevStack: [],
    entryCount: {},
    busy: false,
    over: false,
    visionMod: 0,
    luzBloqueada: false,
    extraWorldStep: false,
    moving: false,
    ui: null, // inyectado por ui.js
  };

  // ---------- perfiles de usuario (locales, sin servidor) ----------
  const Profiles = {
    _load() {
      try { return JSON.parse(localStorage.getItem('backrooms-profiles')) || { activo: null, perfiles: {} }; }
      catch (e) { return { activo: null, perfiles: {} }; }
    },
    _save(d) { try { localStorage.setItem('backrooms-profiles', JSON.stringify(d)); } catch (e) {} },
    list() { return Object.keys(this._load().perfiles); },
    activeName() { return this._load().activo; },
    get() {
      const d = this._load();
      return d.activo ? d.perfiles[d.activo] : null;
    },
    create(nombre) {
      nombre = (nombre || '').trim().slice(0, 24);
      if (!nombre) return false;
      const d = this._load();
      if (!d.perfiles[nombre]) {
        d.perfiles[nombre] = {
          creado: new Date().toISOString(),
          codice: {},
          records: { runs: 0, maxNiveles: 0, maxTurnos: 0, escapes: 0 },
          historial: [],
        };
      }
      d.activo = nombre;
      this._save(d);
      return true;
    },
    select(nombre) {
      const d = this._load();
      if (!d.perfiles[nombre]) return false;
      d.activo = nombre;
      this._save(d);
      return true;
    },
    remove(nombre) {
      const d = this._load();
      delete d.perfiles[nombre];
      if (d.activo === nombre) d.activo = Object.keys(d.perfiles)[0] || null;
      this._save(d);
      localStorage.removeItem('backrooms-save::' + nombre);
    },
    _update(fn) {
      const d = this._load();
      if (!d.activo || !d.perfiles[d.activo]) return;
      fn(d.perfiles[d.activo]);
      this._save(d);
    },
    registrarEntrada(levelId) {
      this._update((p) => {
        p.codice[levelId] = p.codice[levelId] || { veces: 0, mejorTurnos: null, escapado: false };
        p.codice[levelId].veces++;
      });
    },
    registrarSalida(levelId, turnos) {
      this._update((p) => {
        const c = p.codice[levelId];
        if (c && (c.mejorTurnos === null || turnos < c.mejorTurnos)) c.mejorTurnos = turnos;
      });
    },
    registrarFin(victoria, journal, turnTotal, seed, levelFinal) {
      this._update((p) => {
        p.records.runs++;
        p.records.maxNiveles = Math.max(p.records.maxNiveles, journal.length);
        p.records.maxTurnos = Math.max(p.records.maxTurnos, turnTotal);
        if (victoria) {
          p.records.escapes++;
          if (p.codice[levelFinal]) p.codice[levelFinal].escapado = true;
        }
        p.historial.unshift({
          fecha: new Date().toISOString().slice(0, 16).replace('T', ' '),
          semilla: seed,
          niveles: journal.length,
          turnos: turnTotal,
          resultado: victoria ? '⭐ Escape' : '☠ ' + (journal[journal.length - 1]?.nombre || '—'),
        });
        p.historial = p.historial.slice(0, 20);
      });
    },
    exportar() {
      const d = this._load();
      if (!d.activo) return null;
      return JSON.stringify({ nombre: d.activo, datos: d.perfiles[d.activo] }, null, 1);
    },
    importar(json) {
      try {
        const o = JSON.parse(json);
        if (!o.nombre || !o.datos || !o.datos.codice) return false;
        const d = this._load();
        d.perfiles[o.nombre] = o.datos;
        d.activo = o.nombre;
        this._save(d);
        return true;
      } catch (e) { return false; }
    },
  };

  const saveKey = () => 'backrooms-save::' + (Profiles.activeName() || 'anon');

  // ---------- utilidades de estado ----------
  world.log = (msg, cls) => world.ui.log(msg, cls);

  world.visionActual = function () {
    let v = world.level.vision + 2 + world.visionMod;
    if (world.player.luz) v += 4;
    return Math.max(2, v);
  };

  world.hurt = function (n, causa, ambiental) {
    if (world.over) return;
    world.player.salud = Math.max(0, world.player.salud - n);
    world.player._hitT = performance.now();
    if (window.Effects) Effects.number(world.player.x, world.player.y, '−' + n, '#e86a5a');
    if (window.Sfx && !ambiental) Sfx.play('dano');
    world.ui.updateHUD();
    world.ui.flashDamage();
    if (world.player.salud <= 0) die(`Has muerto: ${causa} acabó contigo.`);
  };
  world.sanity = function (n) {
    if (world.over) return;
    world.player.cordura = Math.max(0, Math.min(100, world.player.cordura + n));
    if (window.Effects && n !== 0)
      Effects.number(world.player.x, world.player.y - 0.4,
        (n > 0 ? '+' : '−') + Math.abs(n) + ' ☯', n > 0 ? '#9ee8a0' : '#b08ae8');
    world.ui.updateHUD();
    if (world.player.cordura <= 0)
      die('Tu mente se ha quebrado. Te has convertido en una cosa más de las Backrooms.');
  };
  world.thirst = (n) => { world.player.sed = Math.max(0, Math.min(100, world.player.sed + n)); };
  world.hunger = (n) => { world.player.hambre = Math.max(0, Math.min(100, world.player.hambre + n)); };
  world.hasItem = (id) => world.player.inv.includes(id);

  // Remodelación REAL de una zona del nivel (propiedad no euclidiana):
  // regenera los tiles de un chunk lejos del jugador, valida que todas las
  // salidas sigan alcanzables, y borra la memoria explorada SOLO de esa zona.
  world.remodelarZona = function () {
    const g = world.map.grid;
    const T = MapGen.T;
    const rng = RNG.create(`${world.runSeed}::remodel::${world.level.id}::${world.turnTotal}`);
    const CH = 14;
    if (g.w < CH + 6 || g.h < CH + 6) return false;

    for (let intento = 0; intento < 12; intento++) {
      const cx = rng.int(2, g.w - CH - 3);
      const cy = rng.int(2, g.h - CH - 3);
      // fuera de la vista del jugador (distancia a la celda más cercana del chunk)
      const ncx = Math.max(cx, Math.min(world.player.x, cx + CH - 1));
      const ncy = Math.max(cy, Math.min(world.player.y, cy + CH - 1));
      const pd = Math.max(Math.abs(world.player.x - ncx), Math.abs(world.player.y - ncy));
      if (pd < world.visionActual() + 3) continue;
      // sin salidas dentro del chunk
      if (world.map.exits.some((e) => e.x >= cx && e.x < cx + CH && e.y >= cy && e.y < cy + CH)) continue;

      // copia de seguridad por si rompe la conectividad
      const backup = new Uint8Array(CH * CH);
      for (let y = 0; y < CH; y++)
        for (let x = 0; x < CH; x++)
          backup[y * CH + x] = g.t[(cy + y) * g.w + (cx + x)];

      // regenerar el interior (los bordes del chunk se conservan: no sella pasos)
      for (let y = 1; y < CH - 1; y++)
        for (let x = 1; x < CH - 1; x++) {
          const gx = cx + x, gy = cy + y;
          const viejo = g.t[gy * g.w + gx];
          if (viejo === T.VACIO || viejo === T.AGUA) continue; // no tocar abismos ni agua
          const pilar = (gx % 2 === 0 && gy % 2 === 0) || rng.chance(0.22);
          g.t[gy * g.w + gx] = pilar ? T.PARED : T.SUELO;
        }
      // despeja bajo objetos, props y entidades del chunk
      const dentro = (x, y) => x >= cx && x < cx + CH && y >= cy && y < cy + CH;
      for (const it of world.map.items) if (!it.taken && dentro(it.x, it.y)) g.t[it.y * g.w + it.x] = T.SUELO;
      for (const pr of world.map.props || []) if (dentro(pr.x, pr.y)) g.t[pr.y * g.w + pr.x] = T.SUELO;
      for (const e of world.entities) if (e.viva && dentro(e.x, e.y)) g.t[e.y * g.w + e.x] = T.SUELO;

      // validar: todas las salidas siguen alcanzables desde el jugador
      const dist = MapGen.bfsDist(g, world.player.x, world.player.y);
      const ok = world.map.exits.every((e) => dist[e.y * g.w + e.x] >= 0);
      if (!ok) {
        for (let y = 0; y < CH; y++)
          for (let x = 0; x < CH; x++)
            g.t[(cy + y) * g.w + (cx + x)] = backup[y * CH + x];
        continue;
      }

      // éxito: la memoria explorada se borra SOLO en la zona remodelada
      for (let y = 0; y < CH; y++)
        for (let x = 0; x < CH; x++)
          world.explored[(cy + y) * g.w + (cx + x)] = 0;
      return true;
    }
    return false;
  };

  world.rollDice = function (texto, cb) {
    world.busy = true;
    if (window.Sfx) Sfx.play('dado');
    world.ui.showDice(texto, (d) => {
      world.busy = false;
      // el trébol de la suerte (Object 13) mejora toda tirada
      if (world.hasItem('trebol') && d < 20) {
        world.log(`🍀 Trébol de la suerte: ${d} + 2 = ${Math.min(20, d + 2)}`, 'good');
        d = Math.min(20, d + 2);
      }
      cb(d);
      world.ui.updateHUD();
    });
  };

  // ---------- inicio de partida ----------
  function startRun(seed) {
    world.runSeed = seed || RNG.randomSeed();
    world.player = {
      x: 0, y: 0, rx: 0, ry: 0, dir: 'down', flip: false,
      salud: 100, cordura: 100, sed: 100, hambre: 100,
      inv: [], luz: false, viva: true,
    };
    world.journal = [];
    world.visited = [];
    world.prevStack = [];
    world.entryCount = {};
    world.turnTotal = 0;
    world.over = false;
    enterLevel('level-0', 'Despertaste aquí tras atravesar la realidad.');
  }

  // ---------- transición de nivel ----------
  function enterLevel(id, via) {
    const def = world.data.levels[id];
    if (!def) { world.log('Ese camino no lleva a ninguna parte.', 'event'); return; }

    // cierra el diario del nivel anterior
    if (world.level) {
      world.journal.push({
        nivel: world.level.id,
        nombre: world.level.wikiTitle,
        turnos: world.turn,
        salida: via,
      });
      Profiles.registrarSalida(world.level.id, world.turn);
    }

    world.entryCount[id] = (world.entryCount[id] || 0) + 1;
    const levelSeed = `${world.runSeed}::${id}::${world.entryCount[id]}`;
    world.rng = RNG.create(levelSeed);
    world.level = def;
    world.turn = 0;
    world.visionMod = 0;
    world.luzBloqueada = false;
    if (!world.visited.includes(id)) world.visited.push(id);
    Profiles.registrarEntrada(id);

    world.map = MapGen.generate(def, world.rng);
    world.tiles = Tiles.build(def, world.rng);
    world.entities = Entities.create(world.map.entitySpawns, world.data.entities, world.rng);

    const g = world.map.grid;
    world.explored = new Uint8Array(g.w * g.h);
    world.light = new Float32Array(g.w * g.h);
    world.player.x = world.map.spawn[0];
    world.player.y = world.map.spawn[1];
    world.player.rx = world.player.x;
    world.player.ry = world.player.y;

    Rules.aplicarEntrada(world);
    recomputeFov();
    recomputeDmap();
    save();

    world.ui.showLevelCard(def, () => {
      world.ui.updateHUD();
      world.log(`— ${def.nombre} —`, 'event');
      if (via) world.log(via, 'event');
      if (window.Sfx) Sfx.ambient(def); // arranca con el clic de ENTRAR (gesto válido)
    });
  }

  // ---------- FOV y pathfinding ----------
  function recomputeFov() {
    const g = world.map.grid;
    world.light = FOV.compute(g, world.player.x, world.player.y, world.visionActual());
    for (let i = 0; i < world.light.length; i++)
      if (world.light[i] > 0.06) world.explored[i] = 1;
  }

  function recomputeDmap() {
    world.dmap = MapGen.bfsDist(world.map.grid, world.player.x, world.player.y);
  }

  // ---------- turno del mundo ----------
  function worldStep() {
    world.turn++;
    world.turnTotal++;

    // recogida de objetos
    for (const it of world.map.items) {
      if (!it.taken && it.x === world.player.x && it.y === world.player.y) {
        if (world.player.inv.length >= 6) {
          world.log('Inventario lleno. Lo dejas atrás.', 'event');
        } else {
          it.taken = true;
          world.player.inv.push(it.id);
          world.log(`Recoges: ${world.data.objects[it.id].nombre}.`, 'good');
          if (window.Effects) {
            Effects.flash(it.x, it.y, world.data.objects[it.id].color);
            Effects.number(it.x, it.y, world.data.objects[it.id].nombre, '#a8d8a0');
          }
          if (window.Sfx) Sfx.play('recoger');
        }
      }
    }

    // salida bajo los pies
    const ex = world.map.exits.find((e) => e.x === world.player.x && e.y === world.player.y);
    if (ex) world.ui.showExitModal(ex.def);

    // aviso al pisar un contenedor sin registrar
    const contAqui = (world.map.props || []).find(
      (p) => p.contenedor && !p.registrado && p.x === world.player.x && p.y === world.player.y
    );
    if (contAqui && !contAqui.avisado) {
      contAqui.avisado = true;
      world.log(`Hay ${NOMBRES_CONT[contAqui.id] ?? 'un contenedor'} aquí. Pulsa E para registrarlo.`, 'good');
    }

    // reglas del nivel + necesidades
    Rules.aplicarTurno(world, world.rng);
    // descansar en niveles seguros repone la mente (hasta 70)
    if (world.level.peligro <= 1 && world.player.cordura < 70 && world.turn % 25 === 0)
      world.sanity(1);
    if (world.turn % 9 === 0) world.thirst(-1);
    if (world.turn % 15 === 0) world.hunger(-1);
    if (world.player.sed <= 0 && world.turn % 3 === 0) world.hurt(2, 'la deshidratación', true);
    if (world.player.hambre <= 0 && world.turn % 5 === 0) world.hurt(1, 'la inanición', true);
    if (world.player.sed === 20) world.log('Tienes muchísima sed.', 'danger');
    if (world.player.hambre === 20) world.log('El hambre te retuerce el estómago.', 'danger');

    // entidades
    recomputeDmap();
    Entities.stepAll(world, world.rng);
    if (world.extraWorldStep) {
      world.extraWorldStep = false;
      Entities.stepAll(world, world.rng);
    }

    recomputeFov();
    world.ui.updateHUD();
  }

  // ---------- acciones del jugador ----------
  function tryMove(dx, dy) {
    if (world.busy || world.over) return;
    const reglas = world.level.reglas || [];
    if (reglas.includes('controles_invertidos')) { dx = -dx; dy = -dy; }
    // orientación del sprite
    if (dy > 0) world.player.dir = 'down';
    else if (dy < 0) world.player.dir = 'up';
    else if (dx !== 0) { world.player.dir = 'side'; world.player.flip = dx < 0; }
    const pasos = reglas.includes('gravedad_baja') ? 2 : 1;

    for (let i = 0; i < pasos; i++) {
      const nx = world.player.x + dx, ny = world.player.y + dy;
      const g = world.map.grid;
      const v = (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) ? T.PARED : g.t[ny * g.w + nx];
      if (v === T.PARED) { if (i === 0) return; else break; }
      if (v === T.VACIO) {
        world.log('El abismo se abre a tus pies. Retrocedes con el corazón desbocado.', 'danger');
        world.sanity(-2);
        break;
      }
      if (v === T.AGUA) { world.log('El agua no parece segura.', 'event'); break; }
      // no puedes atravesar entidades: con arma, moverte hacia ella = golpearla
      const ent = world.entities.find((e) => e.viva && e.x === nx && e.y === ny);
      if (ent) {
        if (world.hasItem('tuberia')) {
          golpear(ent);
          worldStep();
          return;
        }
        world.log(`${ent.def.nombre} te corta el paso. (Sin un arma no puedes golpearla.)`, 'danger');
        break;
      }
      world.player.x = nx;
      world.player.y = ny;
      if (window.Sfx) Sfx.play('paso', world.level.estilo?.suelo);
    }
    worldStep();
  }

  // golpe cuerpo a cuerpo con la tubería
  function golpear(ent) {
    const dano = 18 + world.rng.int(-6, 6);
    ent.vida -= dano;
    ent._hitT = performance.now();
    ent.estado = 'caza';
    ent.revelada = true;
    if (window.Sfx) Sfx.play('golpe');
    if (window.Effects) {
      Effects.number(ent.x, ent.y, '−' + dano, '#ffc860');
      Effects.particles(ent.x, ent.y, ent.def.color, 8);
    }
    // el limo tóxico salpica al golpearlo (canon: contacto letal)
    if (ent.id === 'silverslime') {
      world.hurt(8, 'las salpicaduras del limo', true);
      world.log('¡El limo salpica ácido al golpearlo!', 'danger');
    }
    if (ent.vida <= 0) {
      ent.viva = false;
      world.log(`Has derribado a ${ent.def.nombre}.`, 'good');
      if (window.Effects) Effects.particles(ent.x, ent.y, ent.def.color, 20);
      world.sanity(-2); // matar en las Backrooms también pesa
      return;
    }
    world.log(`Golpeas a ${ent.def.nombre} con la tubería.`, 'good');
    // retroceso de 1 casilla si el hueco está libre
    const kx = ent.x + Math.sign(ent.x - world.player.x);
    const ky = ent.y + Math.sign(ent.y - world.player.y);
    const g = world.map.grid;
    if (MapGen.walkable(MapGen.at(g, kx, ky)) &&
        !world.entities.some((o) => o.viva && o !== ent && o.x === kx && o.y === ky) &&
        !(world.player.x === kx && world.player.y === ky)) {
      ent.x = kx; ent.y = ky;
    }
  }

  function wait() {
    if (world.busy || world.over) return;
    worldStep();
  }

  function interact() {
    if (world.busy || world.over) return;
    const ex = world.map.exits.find((e) => e.x === world.player.x && e.y === world.player.y);
    if (ex) { world.ui.showExitModal(ex.def); return; }
    // contenedores registrables
    const cont = (world.map.props || []).find(
      (p) => p.contenedor && !p.registrado && p.x === world.player.x && p.y === world.player.y
    );
    if (cont) { registrar(cont); return; }
    world.log('No hay nada con lo que interactuar aquí.', 'event');
  }

  const NOMBRES_CONT = {
    taquilla: 'la taquilla', archivador: 'el archivador',
    nevera: 'la nevera de suministros', cofre: 'la caja',
  };
  function registrar(cont) {
    cont.registrado = true;
    if (window.Sfx) Sfx.play('registrar');
    world.rollDice(`Registras ${NOMBRES_CONT[cont.id] ?? 'el contenedor'}…`, (d) => {
      if (d >= 14) {
        const pool = ['agua_almendras', 'agua_almendras', 'botiquin', 'amuleto', 'linterna', 'chaqueta', 'tuberia', 'fuego_griego', 'guante_paralisis', 'trebol'];
        const id = pool[Math.min(pool.length - 1, Math.floor((d - 14) / 7 * pool.length + world.rng.int(0, 2)))];
        if (world.player.inv.length >= 6) {
          world.log(`Dado: ${d}. Hay algo útil… pero no te cabe nada más.`, 'event');
        } else {
          world.player.inv.push(id);
          world.log(`Dado: ${d}. Encuentras: ${world.data.objects[id].nombre}.`, 'good');
          if (window.Effects) Effects.flash(world.player.x, world.player.y, '#ffe9a0');
        }
      } else if (d >= 7) {
        world.log(`Dado: ${d}. Vacío. Solo polvo y papel amarillento.`, 'event');
      } else if (d >= 2) {
        world.log(`Dado: ${d}. Algo se escurre entre tus dedos. Retrocedes de golpe.`, 'danger');
        world.sanity(-5);
      } else {
        world.log(`Dado: ${d}. El ruido ha despertado algo en la oscuridad…`, 'danger');
        let best = null, bestD = Infinity;
        for (const e of world.entities) {
          if (!e.viva) continue;
          const dd = Math.abs(e.x - world.player.x) + Math.abs(e.y - world.player.y);
          if (dd < bestD) { bestD = dd; best = e; }
        }
        if (best) { best.estado = 'caza'; best.revelada = true; }
        world.sanity(-3);
      }
      worldStep();
    });
  }

  function toggleLuz() {
    if (world.busy || world.over) return;
    if (world.luzBloqueada) { world.log('Ninguna luz funciona en este nivel.', 'danger'); return; }
    if (!world.hasItem('linterna')) { world.log('No tienes linterna.', 'event'); return; }
    world.player.luz = !world.player.luz;
    world.log(world.player.luz ? 'Enciendes la linterna. Su luz puede atraer cosas.' : 'Apagas la linterna.', 'event');
    recomputeFov();
    world.ui.updateHUD();
  }

  function useItem(slot) {
    if (world.busy || world.over) return;
    const id = world.player.inv[slot];
    if (!id) return;
    const def = world.data.objects[id];
    if (def.efecto?.toggle === 'luz') { toggleLuz(); return; }
    if (def.efecto?.activo === 'fuego') {
      world.player.inv.splice(slot, 1);
      world.log('¡Lanzas el fuego griego! Las llamas se extienden a tu alrededor.', 'good');
      if (window.Sfx) Sfx.play('golpe');
      let alcanzadas = 0;
      for (const e of world.entities) {
        if (!e.viva) continue;
        if (Math.abs(e.x - world.player.x) + Math.abs(e.y - world.player.y) > 3) continue;
        e.vida -= 30;
        e._hitT = performance.now();
        e.huyendo = 8;
        e.revelada = true;
        alcanzadas++;
        if (window.Effects) {
          Effects.particles(e.x, e.y, '#ff8a30', 14);
          Effects.number(e.x, e.y, '−30', '#ff8a30');
        }
        if (e.vida <= 0) { e.viva = false; world.log(`${e.def.nombre} arde hasta desaparecer.`, 'good'); }
      }
      if (window.Effects) Effects.flash(world.player.x, world.player.y, '#ff8a30');
      if (!alcanzadas) world.log('Las llamas se apagan sin alcanzar a nada.', 'event');
      world.ui.updateHUD();
      worldStep();
      return;
    }
    if (def.efecto?.activo === 'paralisis') {
      world.player.inv.splice(slot, 1);
      let alcanzadas = 0;
      for (const e of world.entities) {
        if (!e.viva) continue;
        if (Math.abs(e.x - world.player.x) + Math.abs(e.y - world.player.y) > 1) continue;
        e.paralizada = 6;
        e._hitT = performance.now();
        alcanzadas++;
        if (window.Effects) Effects.number(e.x, e.y, '⚡ paralizada', '#60c8e8');
      }
      world.log(alcanzadas
        ? `El guante descarga: ${alcanzadas} entidad(es) inmovilizada(s) durante 6 turnos.`
        : 'El guante chisporrotea… pero no hay nada adyacente que tocar. Se ha gastado.', alcanzadas ? 'good' : 'event');
      if (window.Sfx) Sfx.play('registrar');
      world.ui.updateHUD();
      worldStep();
      return;
    }
    if (def.efecto?.pasivo) { world.log(`${def.nombre}: su efecto es pasivo, basta con llevarlo.`, 'event'); return; }
    if (def.efecto) {
      if (def.efecto.salud) {
        world.player.salud = Math.min(100, world.player.salud + def.efecto.salud);
        if (window.Effects) Effects.number(world.player.x, world.player.y, '+' + def.efecto.salud + ' ♥', '#9ee8a0');
      }
      if (def.efecto.cordura) world.sanity(def.efecto.cordura);
      if (def.efecto.sed) world.thirst(def.efecto.sed);
      world.player.inv.splice(slot, 1);
      world.log(`Usas: ${def.nombre}.`, 'good');
      world.ui.updateHUD();
      worldStep();
    }
  }

  function volver() {
    if (world.busy || world.over) return;
    if (!world.prevStack.length) {
      world.log('No recuerdas por dónde llegaste. No hay vuelta atrás.', 'event');
      return;
    }
    const prev = world.prevStack.pop();
    world.sanity(-6);
    world.log('Vuelves sobre tus pasos, con la sensación de haber perdido algo.', 'event');
    enterLevel(prev, 'Volviste sobre tus pasos.');
  }

  // ---------- cruzar salidas ----------
  function crossExit(def) {
    const tipo = def.tipo;

    if (tipo === 'sellada') {
      world.log('El camino se difumina: ese nivel aún no está cartografiado en el piloto.', 'event');
      world.sanity(-2);
      return;
    }
    if (tipo === 'escape') {
      win();
      return;
    }
    if (tipo === 'llave') {
      if (!world.hasItem('llave_nivel')) {
        world.log('Las puertas de acero no tienen pomo. Necesitas una Llave de Nivel.', 'event');
        return;
      }
      world.ui.showLevelPicker(world.visited.filter((v) => v !== world.level.id), (destino) => {
        world.player.inv.splice(world.player.inv.indexOf('llave_nivel'), 1);
        world.prevStack.push(world.level.id);
        enterLevel(destino, 'Abriste una puerta de acero con la Llave.');
      });
      return;
    }

    const go = () => {
      if (window.Sfx) Sfx.play('puerta');
      let destino = def.destino;
      if (destino === '*aleatoria') {
        const ids = Object.keys(world.data.levels).filter((i) => i !== world.level.id);
        destino = world.rng.pick(ids);
      } else if (destino === '*visitada') {
        destino = world.rng.pick(world.visited);
      }
      world.prevStack.push(world.level.id);
      enterLevel(destino, def.texto);
    };

    if (tipo === 'arriesgada' && def.riesgoVoid > 0) {
      world.rollDice('El camino es inestable. Tira el dado…', (d) => {
        const umbral = Math.round(def.riesgoVoid * 20);
        if (d <= umbral) {
          world.log(`Dado: ${d}. El suelo cede.`, 'danger');
          die('Caíste al Vacío. El Vacío no devuelve nada.');
        } else {
          world.log(`Dado: ${d}. Cruzas por los pelos.`, 'good');
          go();
        }
      });
      return;
    }
    go();
  }

  // ---------- fin de partida ----------
  function die(causa) {
    if (world.over) return;
    world.over = true;
    world.journal.push({
      nivel: world.level.id,
      nombre: world.level.wikiTitle,
      turnos: world.turn,
      salida: '☠ ' + causa,
    });
    Profiles.registrarFin(false, world.journal, world.turnTotal, world.runSeed, world.level.id);
    localStorage.removeItem(saveKey());
    if (window.Sfx) { Sfx.stopAmbient(); Sfx.play('muerte'); }
    world.ui.showEnd(false, causa);
  }

  function win() {
    world.over = true;
    world.journal.push({
      nivel: world.level.id,
      nombre: world.level.wikiTitle,
      turnos: world.turn,
      salida: '⭐ Escapaste de las Backrooms.',
    });
    Profiles.registrarSalida(world.level.id, world.turn);
    Profiles.registrarFin(true, world.journal, world.turnTotal, world.runSeed, world.level.id);
    localStorage.removeItem(saveKey());
    if (window.Sfx) { Sfx.stopAmbient(); Sfx.play('victoria'); }
    world.ui.showEnd(true, 'Atravesaste el edificio imposible y despertaste en una acera cualquiera, bajo un sol de verdad.');
  }

  // ---------- guardado ----------
  function save() {
    try {
      localStorage.setItem(saveKey(), JSON.stringify({
        runSeed: world.runSeed,
        levelId: world.level.id,
        player: {
          salud: world.player.salud, cordura: world.player.cordura,
          sed: world.player.sed, hambre: world.player.hambre,
          inv: world.player.inv,
        },
        journal: world.journal,
        visited: world.visited,
        prevStack: world.prevStack,
        entryCount: world.entryCount,
        turnTotal: world.turnTotal,
      }));
    } catch (e) { /* almacenamiento no disponible */ }
  }

  function loadSave() {
    try { return JSON.parse(localStorage.getItem(saveKey())); }
    catch (e) { return null; }
  }

  function continueRun(s) {
    world.runSeed = s.runSeed;
    world.player = {
      x: 0, y: 0, rx: 0, ry: 0,
      salud: s.player.salud, cordura: s.player.cordura,
      sed: s.player.sed, hambre: s.player.hambre,
      inv: s.player.inv, luz: false, viva: true,
    };
    world.journal = s.journal;
    world.visited = s.visited.slice(0, -0) || [];
    world.visited = s.visited;
    world.prevStack = s.prevStack;
    world.entryCount = s.entryCount;
    // repite la entrada al nivel guardado sin duplicar el diario
    world.entryCount[s.levelId] = Math.max(0, (world.entryCount[s.levelId] || 1) - 1);
    world.turnTotal = s.turnTotal;
    world.over = false;
    world.level = null;
    enterLevel(s.levelId, 'Retomas la marcha donde lo dejaste.');
  }

  window.Game = {
    world, startRun, continueRun, loadSave, Profiles,
    tryMove, wait, interact, toggleLuz, useItem, volver, crossExit,
  };
})();
