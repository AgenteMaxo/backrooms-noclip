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
    pasosNivel: 0,
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
    tutorial: {},
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
      this._descCache = null;
      return true;
    },
    select(nombre) {
      const d = this._load();
      if (!d.perfiles[nombre]) return false;
      d.activo = nombre;
      this._save(d);
      this._descCache = null;
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
    // coleccionables (v15): salidas/entidades/objetos descubiertos — con caché en
    // memoria para no reescribir localStorage cada turno
    _descCache: null,
    descubierto(tipo, clave) {
      if (!this._descCache) {
        const p = this.get();
        this._descCache = p && p.descubiertos
          ? { salidas: { ...p.descubiertos.salidas }, entidades: { ...p.descubiertos.entidades }, objetos: { ...p.descubiertos.objetos } }
          : { salidas: {}, entidades: {}, objetos: {} };
      }
      return !!this._descCache[tipo][clave];
    },
    registrarDescubierto(tipo, clave) {
      if (this.descubierto(tipo, clave)) return;
      this._descCache[tipo][clave] = true;
      this._update((p) => {
        p.descubiertos = p.descubiertos || { salidas: {}, entidades: {}, objetos: {} };
        p.descubiertos[tipo][clave] = true;
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
        this._descCache = null;
        return true;
      } catch (e) { return false; }
    },
  };

  const saveKey = () => 'backrooms-save::' + (Profiles.activeName() || 'anon');

  // ---------- utilidades de estado ----------
  world.log = (msg, cls) => world.ui.log(msg, cls);

  function tutorialHint(clave, texto, registrar = false) {
    if (world.level?.id !== 'level-0' || (world.tutorial || (world.tutorial = {}))[clave]) return;
    world.tutorial[clave] = true;
    if (window.Effects) Effects.bubble(world.player.x, world.player.y, texto, world.player);
    if (registrar) world.log(texto, 'good');
  }

  world.visionActual = function () {
    let v = world.level.vision + 2 + world.visionMod;
    if (world.player.luz) v += 4;
    if (world.instinto('piel_fluorescente')) v += 1;
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

  // ---------- LA SINTONÍA (v18): las Backrooms te reclaman ----------
  // No hay XP: hay un pacto. Presenciar horrores te SINTONIZA con el lugar —
  // ganas Instintos (poderes), pero la realidad cada vez te reconoce menos
  // como suyo: escapar se vuelve más difícil. Poder ↔ volver a casa.
  const INSTINTOS = {
    oido_moqueta: { nombre: 'Oído de moqueta', icono: 'onda',
      desc: 'Sientes a las entidades a través de los muros: aparecen en tu mapa aunque no las veas.' },
    pies_moqueta: { nombre: 'Pies de moqueta', icono: 'punto',
      desc: 'Tus pasos ya no suenan del todo humanos: las entidades te detectan 2 casillas más tarde.' },
    reflejos_errante: { nombre: 'Reflejos de errante', icono: 'estrella',
      desc: 'Un 25% de las veces esquivas por puro instinto los ataques que ves venir (⚠).' },
    visceras_vacio: { nombre: 'Vísceras del vacío', icono: 'vacio',
      desc: 'Tu cuerpo aprende a no necesitar: la sed y el hambre te consumen a la MITAD.' },
    lengua_paredes: { nombre: 'Lengua de las paredes', icono: 'libro',
      desc: 'Los contenedores te susurran lo que guardan: registrar nunca acaba mal (sin pifias).' },
    piel_fluorescente: { nombre: 'Piel de fluorescente', icono: 'linterna',
      desc: '+1 de visión permanente… y las Deathmoths te confunden con una luz más.' },
    sangre_amarilla: { nombre: 'Sangre amarilla', icono: 'gota',
      desc: 'Regeneras 1 de salud cada 12 turnos, pero el agua de almendras te repone la MITAD.' },
    noclip: { nombre: 'No-clip', icono: 'diametro', min: 80,
      desc: 'Tecla G: atraviesas la pared que encaras. Cuesta 10 de cordura y arriesga caer al Vacío.' },
  };
  world.instinto = (id) => (world.player?.instintos || []).includes(id);

  // RUIDO (v18): las entidades latentes/en alerta investigan los sonidos
  world.hacerRuido = function (x, y, radio) {
    world.ruido = { x, y, radio, turno: world.turnTotal };
  };

  // sube (o baja) la Sintonía; al cruzar 20/40/60/80 se elige 1 de 3 Instintos
  world.tune = function (n) {
    const p = world.player;
    if (!p || world.over) return;
    const antes = p.sintonia || 0;
    p.sintonia = Math.max(0, Math.min(100, antes + n));
    if (p.sintonia === antes) return;
    for (const u of [20, 40, 60, 80]) {
      if (antes < u && p.sintonia >= u && !(p.umbrales || (p.umbrales = [])).includes(u)) {
        p.umbrales.push(u);
        ofrecerInstinto(u);
        break;
      }
    }
    world.ui.updateHUD();
  };

  function ofrecerInstinto(umbral) {
    const p = world.player;
    const rng = RNG.create(`${world.runSeed}::instinto::${umbral}`);
    const pool = Object.keys(INSTINTOS).filter(
      (k) => !p.instintos.includes(k) && (INSTINTOS[k].min ?? 0) <= umbral
    );
    const ofertas = rng.shuffle(pool).slice(0, 3);
    if (!ofertas.length) return;
    if (window.Effects) Effects.bubble(p.x, p.y, 'Algo está cambiando en mí…', p);
    if (window.Sfx) Sfx.cue('generico');
    world.ui.showInstintos(umbral, ofertas.map((k) => ({ id: k, ...INSTINTOS[k] })), (id) => {
      p.instintos.push(id);
      world.log(`INSTINTO: ${INSTINTOS[id].nombre}. Las Backrooms te han dado algo… y se han quedado algo.`, 'good');
      if (id === 'piel_fluorescente') recomputeFov();
      world.ui.updateHUD();
    });
  }
  // posesión total (mochila + manos + puesto) — los pasivos de bolsillo
  // funcionan por llevarlos encima
  world.hasItem = (id) => world.player.inv.includes(id) ||
    (world.player.manos || []).includes(id) ||
    Object.values(world.player.equipo || {}).includes(id);
  // "en mano": linterna y armas solo funcionan empuñadas
  world.enMano = (id) => (world.player.manos || []).includes(id);
  // "puesto": la ropa (chaqueta, máscara, botas) solo protege VESTIDA (v20)
  world.equipado = (id) => Object.values(world.player?.equipo || {}).includes(id);

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
      if (pd < 20) continue; // nunca a la vista ni en el borde de la niebla 3D
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
      // el render 3D reconstruye su escena al ver cambiar esta versión
      world.mapaVersion = (world.mapaVersion || 0) + 1;
      world.tune(2); // presenciar la no-euclidianidad deja huella
      return true;
    }
    return false;
  };

  world.rollDice = function (texto, cb) {
    world.busy = true;
    if (window.Sfx) Sfx.play('dado');
    // el d20 decide lógica de partida (noclip, escapes, botín…): sale de la semilla,
    // nunca de Math.random(). Contador propio para que el guardado reanude la secuencia.
    let resultado;
    if (!world.online) {
      world.dadosN = (world.dadosN || 0) + 1;
      resultado = RNG.create(`${world.runSeed}::dado::${world.dadosN}`).int(1, 20);
    }
    world.ui.showDice(texto, (d) => {
      world.busy = false;
      // el trébol de la suerte (Object 13) mejora toda tirada
      if (world.hasItem('trebol') && d < 20) {
        world.log(`🍀 Trébol de la suerte: ${d} + 2 = ${Math.min(20, d + 2)}`, 'good');
        d = Math.min(20, d + 2);
      }
      cb(d);
      world.ui.updateHUD();
    }, resultado);
  };

  // ---------- inicio de partida ----------
  function startRun(seed) {
    world.runSeed = seed || RNG.randomSeed();
    world.player = {
      x: 0, y: 0, rx: 0, ry: 0, dir: 'down', flip: false, rot: 2,
      salud: 100, cordura: 100, sed: 100, hambre: 100,
      sintonia: 0, instintos: [], umbrales: [],
      inv: [], manos: [null, null], equipo: { cara: null, cuerpo: null, pies: null },
      luz: false, viva: true,
    };
    world.journal = [];
    world.visited = [];
    world.prevStack = [];
    world.entryCount = {};
    world.savedLevels = {};   // niveles visitados, conservados TAL CUAL (v15)
    world.tutorial = {};
    world.turnTotal = 0;
    world.dadosN = 0;         // nº de tiradas de dado (secuencia determinista por semilla)
    world.over = false;
    // run NUEVA de verdad: si venías de morir, el nivel anterior sigue en
    // world.level y sin esto enterLevel crearía una salida de retorno hacia él
    world.level = null;
    enterLevel('level-0', 'Despertaste aquí tras atravesar la realidad.');
  }

  // ---------- transición de nivel ----------
  // salidas de las que físicamente NO se puede volver (caídas, vacío, desplomes)
  function esSinRetorno(def) {
    if (def.sinRetorno) return true;
    if (def.tipo === 'void') return true;
    return /agujero|caes |caer |caída|desplom|abismo|pozo|trampilla|no.?clip|desmay|despiert/i.test(def.texto || '');
  }

  function enterLevel(id, via, entrada) {
    const def = world.data.levels[id];
    if (!def) { world.log('Ese camino no lleva a ninguna parte.', 'event'); return; }

    // el ambiente del nivel anterior muere AQUÍ (nada de sonidos acumulados)
    if (window.Sfx) Sfx.stopAmbient();

    // cierra el diario + SNAPSHOT del nivel que abandonas: el mundo es
    // persistente (v15) — si vuelves por donde viniste, está tal cual lo dejaste
    const desdeId = world.level ? world.level.id : null;
    if (world.level) {
      world.journal.push({
        nivel: world.level.id,
        nombre: world.level.wikiTitle,
        turnos: world.turn,
        salida: via,
      });
      Profiles.registrarSalida(world.level.id, world.turn);
      world.savedLevels[world.level.id] = {
        map: world.map, tiles: world.tiles, entities: world.entities,
        explored: world.explored, light: world.light,
        ventanaN: world.ventanaN || 0, mapaVersion: world.mapaVersion || 0,
        entryN: world.entryCount[world.level.id] || 1,
        pasosNivel: world.pasosNivel || 0,
        caminataObjetivo: world._caminataObjetivo,
      };
    }
    world._preVentana = null;

    world.level = def;
    world.turn = 0;
    world.visionMod = 0;
    world.luzBloqueada = false;
    world.escondido = null;
    world.ruido = null;
    if (!world.visited.includes(id)) world.visited.push(id);
    Profiles.registrarEntrada(id);

    const snap = world.savedLevels[id];
    if (snap) {
      // ------- nivel ya visitado: se RESTAURA tal cual (no se regenera) -------
      world.rng = RNG.create(`${world.runSeed}::${id}::${snap.entryN}::t${world.turnTotal}`);
      world.map = snap.map;
      world.tiles = snap.tiles;
      world.entities = snap.entities;
      world.explored = snap.explored;
      world.light = snap.light;
      world.ventanaN = snap.ventanaN;
      world.mapaVersion = snap.mapaVersion;
      // apareces en la salida que conecta con el nivel del que vienes
      let pos = null;
      if (desdeId) {
        const exVuelta = world.map.exits.find(
          (e) => e.def.destino === desdeId || e.def._destinoResuelto === desdeId
        );
        if (exVuelta) pos = [exVuelta.x, exVuelta.y];
      }
      if (!pos) pos = world.map.spawn;
      world.player.x = pos[0];
      world.player.y = pos[1];
    } else {
      // ------- primera visita: generación procedural -------
      world.entryCount[id] = (world.entryCount[id] || 0) + 1;
      const levelSeed = `${world.runSeed}::${id}::${world.entryCount[id]}`;
      world.rng = RNG.create(levelSeed);
      world.ventanaN = 0;

      world.map = MapGen.generate(def, world.rng);
      world.tiles = Tiles.build(def, world.rng);
      world.entities = Entities.create(world.map.entitySpawns, world.data.entities, world.rng);

      const g = world.map.grid;
      world.explored = new Uint8Array(g.w * g.h);
      world.light = new Float32Array(g.w * g.h);
      world.player.x = world.map.spawn[0];
      world.player.y = world.map.spawn[1];

      // salida de RETORNO donde apareces: la única manera de volver atrás es la
      // puerta que ya usaste — salvo que hayas CAÍDO (físicamente imposible)
      if (desdeId && (!entrada || !entrada.sinRetorno)) {
        world.map.exits.push({
          x: world.player.x, y: world.player.y,
          def: {
            texto: 'El camino por el que llegaste sigue abierto.',
            destino: desdeId, tipo: 'retorno',
          },
        });
      }
    }
    world.player.rx = world.player.x;
    world.player.ry = world.player.y;
    world.pasosNivel = snap?.pasosNivel || 0;
    world._caminataObjetivo = snap?.caminataObjetivo || MapGen.walkingGoal(
      def, world.runSeed, world.entryCount[id] || 1, 0
    );
    world._caminataAvisos = {};
    // no abras el modal por APARECER encima de la salida (solo al volver a pisarla)
    const exAqui = world.map.exits.find((e) => e.x === world.player.x && e.y === world.player.y);
    world._ignoraExit = exAqui ? { x: exAqui.x, y: exAqui.y } : null;

    Rules.aplicarEntrada(world);
    recomputeFov();
    recomputeDmap();
    save();

    const nivelListo = () => {
      world.ui.updateHUD();
      world.log(`— ${def.nombre} —`, 'event');
      if (via) world.log(via, 'event');
      if (def.id === 'level-0' && world.turnTotal === 0)
        tutorialHint('inicio', 'W/S para caminar. A/D para girar. Cada paso hace avanzar al mundo.', true);
      if (window.Sfx) Sfx.ambient(def); // arranca con el clic de ENTRAR (gesto válido)
    };
    // Las salidas por caminata funden un nivel con el siguiente: no interrumpen
    // la marcha con tarjeta ni decisión. Las demás conservan su presentación.
    if (entrada?.sinTarjeta) nivelListo();
    else world.ui.showLevelCard(def, nivelListo);
  }

  // ---------- niveles infinitos: ventana deslizante ----------
  // El nivel nunca se acaba: cuando te acercas a un borde, la ventana se
  // desplaza media anchura en esa dirección — el solape se conserva tal cual,
  // lo nuevo se genera fresco y lo que queda muy atrás se descarta.
  function desplazarVentana(sx, sy) {
    const g = world.map.grid;
    const W = g.w, H = g.h;
    const shiftX = sx * Math.floor(W / 2);
    const shiftY = sy * Math.floor(H / 2);
    world.ventanaN = (world.ventanaN || 0) + 1;
    // usa el mapa pregenerado si existe (el coste pesado ya se pagó turnos antes)
    let nuevo;
    if (world._preVentana && world._preVentana.n === world.ventanaN) {
      nuevo = world._preVentana.mapa;
    } else {
      const rng = RNG.create(`${world.runSeed}::${world.level.id}::ventana::${world.ventanaN}`);
      nuevo = MapGen.generate(world.level, rng);
    }
    world._preVentana = null;
    const ng = nuevo.grid;
    const T = MapGen.T;
    const nExp = new Uint8Array(W * H);
    // copia del solape: el mundo que has visto no cambia bajo tus pies
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const ox = x + shiftX, oy = y + shiftY;
        if (ox >= 0 && oy >= 0 && ox < W && oy < H) {
          ng.t[y * W + x] = g.t[oy * W + ox];
          nExp[y * W + x] = world.explored[oy * W + ox];
        }
      }
    // costura: abre pasos entre el solape y la zona fresca (franja central)
    const abre = (x, y) => {
      if (x > 0 && y > 0 && x < W - 1 && y < H - 1 && ng.t[y * W + x] !== T.VACIO)
        ng.t[y * W + x] = T.SUELO;
    };
    if (shiftX !== 0) {
      const sxm = Math.floor(W / 2);
      for (let y = 2; y < H - 2; y += 4) { abre(sxm - 1, y); abre(sxm, y); abre(sxm - 1, y + 1); abre(sxm, y + 1); }
    }
    if (shiftY !== 0) {
      const sym = Math.floor(H / 2);
      for (let x = 2; x < W - 2; x += 4) { abre(x, sym - 1); abre(x, sym); abre(x + 1, sym - 1); abre(x + 1, sym); }
    }
    world.map.grid = ng;

    // desplaza todas las coordenadas; lo que cae fuera se descarta
    const p = world.player;
    p.x -= shiftX; p.y -= shiftY; p.rx = p.x; p.ry = p.y;
    const dentro = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    const esNueva = (x, y) => {
      const ox = x + shiftX, oy = y + shiftY;
      return ox < 0 || oy < 0 || ox >= W || oy >= H;
    };
    for (const e of world.entities) {
      e.x -= shiftX; e.y -= shiftY;
      e.rx = e.x; e.ry = e.y;
      if (!dentro(e.x, e.y)) e.viva = false;
    }
    world.map.items = world.map.items.filter((it) => {
      it.x -= shiftX; it.y -= shiftY;
      return dentro(it.x, it.y) && !it.taken;
    });
    let itemsNuevos = 0;
    for (const it of nuevo.items || []) {
      if (!esNueva(it.x, it.y)) continue;
      world.map.items.push({ ...it });
      itemsNuevos++;
    }
    world.map.props = (world.map.props || []).filter((pr) => {
      pr.x -= shiftX; pr.y -= shiftY;
      return dentro(pr.x, pr.y);
    });
    for (const pr of nuevo.props || [])
      if (esNueva(pr.x, pr.y)) world.map.props.push({ ...pr });

    // Las salidas del solape permanecen en su sitio. Las que quedaron atrás se
    // descartan y la franja fresca aporta nuevas apariciones (incluidas raras).
    const dist = MapGen.bfsDist(ng, p.x, p.y);
    const lejanos = [];
    for (let y = 2; y < H - 2; y++)
      for (let x = 2; x < W - 2; x++) {
        const d = dist[y * W + x];
        if (d > 25) lejanos.push([x, y, d]);
      }
    lejanos.sort((a, b) => b[2] - a[2]);
    world.map.exits = world.map.exits.filter((ex) => {
      ex.x -= shiftX; ex.y -= shiftY;
      return dentro(ex.x, ex.y) && dist[ex.y * W + ex.x] >= 0;
    });
    const ocupadas = new Set(world.map.exits.map((ex) => ex.y * W + ex.x));
    for (const ex of nuevo.exits || []) {
      const key = ex.y * W + ex.x;
      if (!esNueva(ex.x, ex.y) || dist[key] < 0 || ocupadas.has(key)) continue;
      world.map.exits.push({ x: ex.x, y: ex.y, def: { ...ex.def } });
      ocupadas.add(key);
    }
    // Garantía de supervivencia: si la franja no trajo objetos, deja una botella.
    if (!itemsNuevos && lejanos.length) {
      const spot = lejanos[(world.ventanaN * 53) % lejanos.length];
      world.map.items.push({ x: spot[0], y: spot[1], id: 'agua_almendras' });
    }

    world.explored = nExp;
    world.light = new Float32Array(W * H);
    world.mapaVersion = (world.mapaVersion || 0) + 1;
    world._shift3d = { x: shiftX, z: shiftY }; // el render 3D desplaza su cámara sin salto
    recomputeFov();
    recomputeDmap();
    if (window.Sfx) Sfx.play('crujido');
    world.log('Los pasillos se extienden. Este lugar no tiene fin.', 'event');
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
    // BACKROOMS MMO: en el mundo compartido la simulación vive en el servidor —
    // aquí no avanza ningún turno local (ventana, reglas, entidades, sed…)
    if (world.online) return;
    world.turn++;
    world.turnTotal++;

    // niveles infinitos: desplazar la ventana al acercarse a un borde
    // (M debe cumplir M <= W/4 para que tras el salto de W/2 no rebote)
    if (world.level.infinito) {
      const M = 22, g2 = world.map.grid;
      let sx = 0, sy = 0;
      if (world.player.x < M) sx = -1; else if (world.player.x >= g2.w - M) sx = 1;
      if (world.player.y < M) sy = -1; else if (world.player.y >= g2.h - M) sy = 1;
      if (sx || sy) {
        desplazarVentana(sx, sy);
      } else {
        // pregeneración: al entrar en la banda exterior, el próximo mapa se
        // calcula YA para que el desplazamiento sea instantáneo (sin bump)
        const M2 = M + 9;
        const cerca = world.player.x < M2 || world.player.x >= g2.w - M2 ||
                      world.player.y < M2 || world.player.y >= g2.h - M2;
        const n = (world.ventanaN || 0) + 1;
        if (cerca && (!world._preVentana || world._preVentana.n !== n)) {
          const rngP = RNG.create(`${world.runSeed}::${world.level.id}::ventana::${n}`);
          world._preVentana = { n, mapa: MapGen.generate(world.level, rngP) };
        }
      }
    }

    // recogida de objetos
    for (const it of world.map.items) {
      if (it.taken) continue;
      if (it.recien) {
        // recién tirado: no se auto-recoge hasta que abandones su casilla
        if (it.x !== world.player.x || it.y !== world.player.y) it.recien = false;
        continue;
      }
      if (it.x === world.player.x && it.y === world.player.y) {
        if (world.player.inv.length >= 6) {
          world.log('Inventario lleno. Lo dejas atrás.', 'event');
        } else {
          it.taken = true;
          world.player.inv.push(it.id);
          Profiles.registrarDescubierto('objetos', it.id);
          world.log(`Recoges: ${world.data.objects[it.id].nombre}.`, 'good');
          tutorialHint('mochila', 'B abre la mochila. Arrastra objetos a las manos y usa Q/E.', true);
          if (window.Effects) {
            Effects.flash(it.x, it.y, world.data.objects[it.id].color);
            Effects.number(it.x, it.y, world.data.objects[it.id].nombre, '#a8d8a0');
          }
          if (window.Sfx) Sfx.play('recoger');
        }
      }
    }

    // salida bajo los pies (la del punto de aparición no salta hasta que la
    // abandones y vuelvas a pisarla; ESPACIO siempre funciona)
    if (world._ignoraExit &&
        (world.player.x !== world._ignoraExit.x || world.player.y !== world._ignoraExit.y))
      world._ignoraExit = null;
    const ex = world.map.exits.find((e) => e.x === world.player.x && e.y === world.player.y);
    if (ex && !world._ignoraExit) {
      // pared agrietada (v20): primero hay que ABRIRLA (ESPACIO)
      if ((ex.def._mec === 'romper' || ex.def._mec === 'romper_suelo') && !ex.def._abierta) {
        if (!ex._avisado) {
          ex._avisado = true;
          world.log(ex.def._mec === 'romper_suelo'
            ? 'La moqueta está hundida y el suelo CRUJE. Pulsa ESPACIO para intentar romperlo.'
            : 'La pared de aquí está AGRIETADA: suena hueca. Pulsa ESPACIO para intentar abrirla.', 'good');
        }
      } else world.ui.showExitModal(ex.def);
    }

    // Salidas por CAMINATA: solo cuentan movimientos WASD que cambiaron de
    // casilla. Esperar, combatir o chocar contra una pared no acercan la salida.
    if ((world.map.caminatas || []).length &&
        world.pasosNivel >= world._caminataObjetivo && !world.busy) {
      const defC = world.map.caminatas[0];
      const i = world.map.caminatas.indexOf(defC);
      if (i >= 0) world.map.caminatas.splice(i, 1);
      world.log(`Tras ${world.pasosNivel} pasos, los pasillos terminan de transformarse.`, 'event');
      crossExit(defC);
      return; // enterLevel ya recalcula, guarda y presenta el nuevo estado
    }

    // aviso al pisar un contenedor sin registrar
    const contAqui = (world.map.props || []).find(
      (p) => p.contenedor && !p.registrado && p.x === world.player.x && p.y === world.player.y
    );
    if (contAqui && !contAqui.avisado) {
      contAqui.avisado = true;
      world.log(`Hay ${NOMBRES_CONT[contAqui.id] ?? 'un contenedor'} aquí. Pulsa ESPACIO para registrarlo.`, 'good');
    }

    // reglas del nivel + necesidades
    Rules.aplicarTurno(world, world.rng);
    // descansar en niveles seguros repone la mente (hasta 70)
    if (world.level.peligro <= 1 && world.player.cordura < 70 && world.turn % 25 === 0)
      world.sanity(1);
    const drenaje = world.instinto('visceras_vacio') ? 2 : 1; // vísceras del vacío
    if (world.turn % (9 * drenaje) === 0) world.thirst(-1);
    if (world.turn % (15 * drenaje) === 0) world.hunger(-1);
    if (world.player.sed <= 0 && world.turn % 3 === 0) world.hurt(2, 'la deshidratación', true);
    if (world.player.hambre <= 0 && world.turn % 5 === 0) world.hurt(1, 'la inanición', true);

    // Sintonía (v18): el lugar cala en ti — o te suelta, muy despacio
    if (world.instinto('sangre_amarilla') && world.turnTotal % 12 === 0 && world.player.salud < 100)
      world.player.salud = Math.min(100, world.player.salud + 1);
    if (world.turnTotal % 50 === 0 && world.player.cordura < 25) world.tune(2);
    if (world.turnTotal % 40 === 0 && world.level.peligro >= 4) world.tune(1);
    if (world.turnTotal % 50 === 0 && world.level.peligro <= 1) world.tune(-1);
    // el ruido reciente caduca
    if (world.ruido && world.turnTotal - world.ruido.turno > 8) world.ruido = null;

    // HUD contextual (v15): sin barras — el personaje PIENSA sus estados en
    // bocadillos, con histéresis para no repetirse cada turno
    if (window.Effects) {
      const B = world._boca || (world._boca = {});
      const P = world.player;
      const piensa = (clave, cond, reset, txt) => {
        if (cond && !B[clave]) { B[clave] = true; Effects.bubble(P.x, P.y, txt, P); }
        else if (reset) B[clave] = false;
      };
      piensa('salud', P.salud < 35, P.salud > 55, 'Estoy malherido… esto pinta mal.');
      piensa('salud2', P.salud < 15, P.salud > 30, 'No aguantaré mucho más…');
      piensa('cordura', P.cordura < 35, P.cordura > 55, 'Las paredes… me están susurrando.');
      piensa('sed', P.sed < 30, P.sed > 55, 'Tengo la garganta seca. Necesito beber.');
      piensa('sed2', P.sed <= 5, P.sed > 20, 'Agua… lo que sea… AGUA.');
      piensa('hambre', P.hambre < 30, P.hambre > 55, 'Me ruge el estómago.');
      piensa('sint', (P.sintonia || 0) >= 85, (P.sintonia || 0) < 70,
        'Las paredes ya no me susurran. Me HABLAN. Y las entiendo.');
      if ((world.level.reglas || []).includes('frio') &&
          world.turn % 38 === 12 && !world.equipado('chaqueta'))
        Effects.bubble(P.x, P.y, 'Me castañetean los dientes…', P);
      if ((world.level.reglas || []).includes('calor') && world.turn % 44 === 20)
        Effects.bubble(P.x, P.y, 'Este calor me está cociendo vivo.', P);
    }

    // entidades
    recomputeDmap();
    Entities.stepAll(world, world.rng);
    if (world.extraWorldStep) {
      world.extraWorldStep = false;
      Entities.stepAll(world, world.rng);
    }

    recomputeFov();

    // colección del códice: entidades avistadas quedan registradas para siempre
    for (const e of world.entities) {
      if (!e.viva) continue;
      const idxE = e.y * world.map.grid.w + e.x;
      if (world.light[idxE] > 0.05 || (e.reveladaHasta ?? -1) > world.turn)
        Profiles.registrarDescubierto('entidades', e.id);
    }

    world.ui.updateHUD();
  }

  // ---------- acciones del jugador ----------
  // vectores de encaramiento (rot 0-3): norte, este, sur, oeste (3ª persona)
  const ROT_VEC = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const ROT_DIR = [
    { dir: 'up', flip: false }, { dir: 'side', flip: false },
    { dir: 'down', flip: false }, { dir: 'side', flip: true },
  ];

  // girar al personaje 90° (3ª persona): acción GRATIS, no consume turno
  function girar(d) {
    if (world.busy || world.over || !world.player) return;
    world.player.rot = ((world.player.rot ?? 2) + d + 4) % 4;
    const o = ROT_DIR[world.player.rot];
    world.player.dir = o.dir;
    world.player.flip = o.flip;
  }
  // avanzar (s=1) o retroceder (s=-1) según el encaramiento actual
  function avanzar(s) {
    const [fx, fy] = ROT_VEC[world.player.rot ?? 2];
    tryMove(fx * s, fy * s, { keepDir: true });
  }

  function tryMove(dx, dy, opts) {
    if (world.busy || world.over) return;
    if (world.escondido) {
      world.log('Estás dentro del escondite. ESPACIO para salir.', 'event');
      return;
    }
    const reglas = world.level.reglas || [];
    if (reglas.includes('controles_invertidos')) { dx = -dx; dy = -dy; }
    // orientación del sprite (en 3ª persona, retroceder no gira al personaje)
    if (!opts || !opts.keepDir) {
      if (dy > 0) { world.player.dir = 'down'; world.player.rot = 2; }
      else if (dy < 0) { world.player.dir = 'up'; world.player.rot = 0; }
      else if (dx > 0) { world.player.dir = 'side'; world.player.flip = false; world.player.rot = 1; }
      else if (dx < 0) { world.player.dir = 'side'; world.player.flip = true; world.player.rot = 3; }
    }
    const pasos = reglas.includes('gravedad_baja') ? 2 : 1;
    const x0 = world.player.x, y0 = world.player.y;

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
        // ¿era invisible? chocar con algo en la oscuridad LO REVELA (no más "muros invisibles")
        const idx2 = ny * world.map.grid.w + nx;
        const visible = world.light[idx2] > 0.05 || (ent.reveladaHasta ?? -1) > world.turn;
        if (!visible) {
          ent.revelada = true;
          ent.estado = 'caza';
          ent.reveladaHasta = world.turn + 6;
          world.log(`¡Chocas con algo en la oscuridad! ¡${ent.def.nombre} estaba ahí!`, 'danger');
          world.sanity(-3);
          world.tune(4); // tocar lo que vive aquí te sintoniza con esto
          if (window.Sfx) Sfx.cue(ent.def.glyph);
          if (window.Effects) Effects.doShake(3, 120);
          worldStep(); // el susto consume el turno
          return;
        }
        if (world.enMano('tuberia')) {
          golpear(ent);
          worldStep();
          return;
        }
        world.log(`${ent.def.nombre} te corta el paso. (Necesitas un arma EN LA MANO para golpearla.)`, 'danger');
        break;
      }
      world.player.x = nx;
      world.player.y = ny;
      if (window.Sfx) Sfx.play('paso', world.level.estilo?.suelo);
    }
    if (world.player.x !== x0 || world.player.y !== y0) {
      world.pasosNivel++;
      tutorialHint('interaccion', 'ESPACIO interactúa con grietas, salidas y contenedores. X espera un turno.', true);
      if ((world.map.caminatas || []).length) {
        const f = world.pasosNivel / Math.max(1, world._caminataObjetivo);
        const A = world._caminataAvisos || (world._caminataAvisos = {});
        const avisa = (key, limite, texto) => {
          if (f >= limite && !A[key]) { A[key] = true; if (window.Effects) Effects.bubble(world.player.x, world.player.y, texto, world.player); }
        };
        avisa('lejos1', 0.3, 'He perdido por completo el punto de partida.');
        avisa('lejos2', 0.65, 'El zumbido ya no suena igual… llevo demasiado caminando.');
        avisa('lejos3', 0.82, 'El amarillo se apaga. Bajo la moqueta asoma hormigón.');
        avisa('lejos4', 0.94, 'Hay columnas al final del pasillo. Ya no puedo distinguir dónde cambia el nivel.');
      }
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
      world.tune(8);    // …y el lugar toma nota de ti
      return;
    }
    world.log(`Golpeas a ${ent.def.nombre} con la tubería.`, 'good');
    // retroceso SOLO a veces (v20): si el golpe siempre empujara, el enemigo
    // jamás llegaría a devolvértelo — el combate debe ser un intercambio
    if (world.rng.chance(0.25)) {
      const kx = ent.x + Math.sign(ent.x - world.player.x);
      const ky = ent.y + Math.sign(ent.y - world.player.y);
      const g = world.map.grid;
      if (MapGen.walkable(MapGen.at(g, kx, ky)) &&
          !world.entities.some((o) => o.viva && o !== ent && o.x === kx && o.y === ky) &&
          !(world.player.x === kx && world.player.y === ky)) {
        ent.x = kx; ent.y = ky;
        world.log('El golpe lo hace retroceder.', 'good');
      }
    }
  }

  const FRASES_ESPERA = [
    'Esperaré aquí un momento…', 'Descansaré un rato.', 'Puedo permitirme parar un segundo.',
    'Un respiro. Solo uno.', 'Mejor no precipitarse.', 'Escucharé un momento…',
  ];
  function wait() {
    if (world.busy || world.over) return;
    if (window.Effects && Math.random() < 0.75)
      Effects.bubble(world.player.x, world.player.y,
        FRASES_ESPERA[Math.floor(Math.random() * FRASES_ESPERA.length)], world.player);
    worldStep();
  }

  function interact() {
    if (world.busy || world.over) return;
    // dentro de un escondite: ESPACIO sale
    if (world.escondido) { toggleEsconder(null); return; }
    const ex = world.map.exits.find((e) => e.x === world.player.x && e.y === world.player.y);
    if (ex) {
      if (ex.def._mec === 'romper' && !ex.def._abierta) { intentarRomper(ex); return; }
      if (ex.def._mec === 'romper_suelo' && !ex.def._abierta) { intentarRomperSuelo(ex); return; }
      world.ui.showExitModal(ex.def);
      return;
    }
    // contenedores registrables
    const cont = (world.map.props || []).find(
      (p) => p.contenedor && !p.registrado && p.x === world.player.x && p.y === world.player.y
    );
    if (cont) { registrar(cont); return; }
    // esconderse en un mueble YA registrado (taquilla, nevera, archivador)
    const esc = (world.map.props || []).find(
      (p) => ESCONDITES.has(p.id) && p.registrado && p.x === world.player.x && p.y === world.player.y
    );
    if (esc) { toggleEsconder(esc); return; }
    // agua adyacente: TÚ decides si bebes (el lore decide las consecuencias)
    const hayAgua = [[0, -1], [0, 1], [-1, 0], [1, 0]].some(
      ([ax, ay]) => MapGen.at(world.map.grid, world.player.x + ax, world.player.y + ay) === T.AGUA
    );
    if (hayAgua) { beberAgua(); return; }
    world.log('No hay nada con lo que interactuar aquí.', 'event');
  }

  // interacción libre: beber de un charco/lago — la wiki manda si es buena idea
  function beberAgua() {
    const mala = world.level.aguaMala ||
      (world.level.reglas || []).includes('agua_traicionera');
    world.ui.showChoice(
      'Agua estancada',
      'El agua reposa quieta, con un brillo extraño en la superficie. La sed aprieta… ¿bebes?',
      [
        {
          label: 'BEBER',
          cb: () => {
            if (mala) {
              world.hurt(14, 'el agua contaminada', true);
              world.sanity(-8);
              world.tune(6); // esa agua ya era parte del lugar; ahora tú también
              world.log('Arde al tragar. El brillo del agua NO era un buen augurio.', 'danger');
            } else {
              world.thirst(30);
              world.log('Bebes con las manos. Sabe a polvo y a metal, pero calma la sed.', 'good');
            }
            world.ui.updateHUD();
            worldStep();
          },
        },
        { label: 'Mejor no', cb: () => {} },
      ]
    );
  }

  const NOMBRES_CONT = {
    taquilla: 'la taquilla', archivador: 'el archivador',
    nevera: 'la nevera de suministros', cofre: 'la caja',
    caja: 'la caja de madera',
  };
  function registrar(cont) {
    cont.registrado = true;
    if (window.Sfx) Sfx.play('registrar');
    world.hacerRuido(world.player.x, world.player.y, 10); // registrar HACE RUIDO
    world.rollDice(`Registras ${NOMBRES_CONT[cont.id] ?? 'el contenedor'}…`, (d) => {
      // lengua de las paredes: los contenedores te susurran — nunca pifias
      if (d < 7 && world.instinto('lengua_paredes')) {
        world.log('Las paredes susurran: «ahí no». Retiras la mano a tiempo.', 'good');
        d = 7;
      }
      if (d >= 14) {
        const pool = ['agua_almendras', 'agua_almendras', 'botiquin', 'amuleto', 'linterna', 'chaqueta', 'mascara_gas', 'botas_reforzadas', 'tuberia', 'fuego_griego', 'guante_paralisis', 'trebol'];
        const id = pool[Math.min(pool.length - 1, Math.floor((d - 14) / 7 * pool.length + world.rng.int(0, 2)))];
        if (world.player.inv.length >= 6) {
          world.log(`Dado: ${d}. Hay algo útil… pero no te cabe nada más.`, 'event');
        } else {
          world.player.inv.push(id);
          Profiles.registrarDescubierto('objetos', id);
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

  // ---------- manos (v15): dos ranuras; linterna/armas solo funcionan empuñadas ----------
  function equipar(slot) {
    if (world.online) { Net.mochila('equipar', { slot }); return; }
    const id = world.player.inv[slot];
    if (!id) return;
    const def = world.data.objects[id];
    if (!def.manos) { world.log(`${def.nombre} no se empuña: viaja en la mochila.`, 'event'); return; }
    const manos = world.player.manos;
    if (def.manos === 2) {
      if (manos[0] || manos[1]) { world.log('Ese objeto necesita las DOS manos libres.', 'event'); return; }
      manos[0] = id; manos[1] = '=';
    } else {
      const libre = manos[0] === null ? 0 : manos[1] === null ? 1 : -1;
      if (libre === -1) { world.log('Tienes las manos ocupadas.', 'event'); return; }
      manos[libre] = id;
    }
    world.player.inv.splice(slot, 1);
    world.log(`Empuñas: ${def.nombre}.`, 'good');
    if (window.Sfx) Sfx.play('ui');
    world.ui.updateHUD();
  }

  function desequipar(mano) {
    if (world.online) { Net.mochila('desequipar', { mano }); return; }
    const manos = world.player.manos;
    let id = manos[mano];
    if (id === '=') { mano = 0; id = manos[0]; }
    if (!id) return;
    if (world.player.inv.length >= 6) { world.log('La mochila está llena: no puedes guardar nada más.', 'event'); return; }
    if (manos[1] === '=') { manos[0] = null; manos[1] = null; }
    else manos[mano] = null;
    world.player.inv.push(id);
    // guardar la linterna la apaga (obvio, pero hay que decírselo al FOV)
    if (id === 'linterna' && world.player.luz) {
      world.player.luz = false;
      world.log('Guardas la linterna apagada.', 'event');
      recomputeFov();
    }
    if (window.Sfx) Sfx.play('ui');
    world.ui.updateHUD();
  }

  function toggleLuz() {
    if (world.busy || world.over) return;
    if (world.luzBloqueada) { world.log('Ninguna luz funciona en este nivel.', 'danger'); return; }
    if (!world.enMano('linterna')) {
      world.log(world.hasItem('linterna')
        ? 'La linterna está en la mochila. Equípatela en una mano (icono 🎒).'
        : 'No tienes linterna.', 'event');
      return;
    }
    world.player.luz = !world.player.luz;
    world.log(world.player.luz ? 'Enciendes la linterna. Su luz puede atraer cosas.' : 'Apagas la linterna.', 'event');
    recomputeFov();
    world.ui.updateHUD();
  }

  // efectos activos (compartidos por mochila y manos)
  function lanzarFuego() {
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
      if (e.vida <= 0) { e.viva = false; world.log(`${e.def.nombre} arde hasta desaparecer.`, 'good'); world.tune(5); }
    }
    if (window.Effects) Effects.flash(world.player.x, world.player.y, '#ff8a30');
    if (!alcanzadas) world.log('Las llamas se apagan sin alcanzar a nada.', 'event');
  }

  function descargarParalisis() {
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
  }

  function useItem(slot) {
    if (world.online) { Net.mochila('usarItem', { slot }); return; }
    if (world.busy || world.over) return;
    const id = world.player.inv[slot];
    if (!id) return;
    const def = world.data.objects[id];
    if (def.efecto?.toggle === 'luz') { toggleLuz(); return; }
    if (def.efecto?.activo === 'fuego') {
      world.player.inv.splice(slot, 1);
      lanzarFuego();
      world.ui.updateHUD();
      worldStep();
      return;
    }
    if (def.efecto?.activo === 'paralisis') {
      world.player.inv.splice(slot, 1);
      descargarParalisis();
      world.ui.updateHUD();
      worldStep();
      return;
    }
    if (def.efecto?.pasivo) { world.log(`${def.nombre}: su efecto es pasivo, basta con llevarlo.`, 'event'); return; }
    if (def.efecto) {
      // sangre amarilla: el agua de almendras ya no te repone como antes
      const mitad = id === 'agua_almendras' && world.instinto('sangre_amarilla') ? 0.5 : 1;
      if (def.efecto.salud) {
        world.player.salud = Math.min(100, world.player.salud + def.efecto.salud);
        if (window.Effects) Effects.number(world.player.x, world.player.y, '+' + def.efecto.salud + ' ♥', '#9ee8a0');
      }
      if (def.efecto.cordura) world.sanity(Math.round(def.efecto.cordura * mitad));
      if (def.efecto.sed) world.thirst(Math.round(def.efecto.sed * mitad));
      if (id === 'amuleto') world.tune(-5); // el ancla al hogar te DES-sintoniza
      world.player.inv.splice(slot, 1);
      world.log(`Usas: ${def.nombre}.`, 'good');
      world.ui.updateHUD();
      worldStep();
    }
  }

  // golpe frontal con la tubería: ataca la casilla que ENCARAS (clic del ratón)
  function atacarFrente() {
    const [fx, fy] = ROT_VEC[world.player.rot ?? 2];
    const tx = world.player.x + fx, ty = world.player.y + fy;
    const ent = world.entities.find((e) => e.viva && e.x === tx && e.y === ty);
    if (ent) {
      golpear(ent);
      world.hacerRuido(world.player.x, world.player.y, 8);
    } else {
      world.log('Golpeas al aire. El ruido corre por los pasillos…', 'event');
      if (window.Sfx) Sfx.play('golpe');
      world.hacerRuido(tx, ty, 8);
    }
    worldStep();
  }

  // usar lo que llevas en la mano con el ratón (v17): 0 = clic izq, 1 = clic der
  function usarMano(m) {
    if (world.online) { Net.usar(m); return; }
    if (world.busy || world.over || !world.player || !world.level || world.escondido) return;
    const manos = world.player.manos || [null, null];
    const id = manos[m];
    if (id === '=') {
      world.log('Ese objeto ocupa las dos manos: se usa con el clic IZQUIERDO.', 'event');
      return;
    }
    if (!id) return;
    const def = world.data.objects[id];
    if (def.efecto?.toggle === 'luz') { toggleLuz(); return; }
    if (def.efecto?.pasivo === 'arma') { atacarFrente(); return; }
    if (def.efecto?.activo) {
      // los objetos de un solo uso se gastan DESDE la mano
      if (manos[1] === '=' || def.manos === 2) { manos[0] = null; manos[1] = null; }
      else manos[m] = null;
      if (def.efecto.activo === 'fuego') lanzarFuego();
      else if (def.efecto.activo === 'paralisis') descargarParalisis();
      world.ui.updateHUD();
      worldStep();
    }
  }

  // tirar un objeto de la mochila al suelo (acción libre, no consume turno)
  function tirarItem(slot) {
    if (world.online) { Net.mochila('tirar', { slot }); return; }
    const id = world.player.inv[slot];
    if (!id || world.over) return;
    world.player.inv.splice(slot, 1);
    world.map.items.push({ x: world.player.x, y: world.player.y, id, recien: true });
    world.itemsVersion = (world.itemsVersion || 0) + 1;
    world.log(`Dejas ${world.data.objects[id].nombre} en el suelo.`, 'event');
    if (window.Sfx) Sfx.play('ui');
    world.ui.updateHUD();
  }

  // ARROJAR (v18): lanzas el objeto a un punto visible lejano — el golpe hace
  // RUIDO allí y distrae a lo que acecha. El objeto queda en el suelo.
  function arrojarItem(slot) {
    if (world.online) { Net.mochila('arrojar', { slot }); return; }
    const id = world.player.inv[slot];
    if (!id || world.over) return;
    const g = world.map.grid;
    const spots = [];
    for (let dy = -7; dy <= 7; dy++)
      for (let dx = -7; dx <= 7; dx++) {
        const d = Math.abs(dx) + Math.abs(dy);
        if (d < 4 || d > 7) continue;
        const nx = world.player.x + dx, ny = world.player.y + dy;
        if (nx < 1 || ny < 1 || nx >= g.w - 1 || ny >= g.h - 1) continue;
        if (!MapGen.walkable(g.t[ny * g.w + nx])) continue;
        if (world.light[ny * g.w + nx] > 0.05) spots.push([nx, ny]);
      }
    if (!spots.length) { world.log('No ves ningún hueco al que arrojarlo.', 'event'); return; }
    const [tx, ty] = world.rng.pick(spots);
    world.player.inv.splice(slot, 1);
    world.map.items.push({ x: tx, y: ty, id });
    world.itemsVersion = (world.itemsVersion || 0) + 1;
    world.hacerRuido(tx, ty, 12);
    // DISTRACCIÓN real (v20): lo que oye el golpe se va DE VERDAD hacia él
    // unos turnos (aunque te estuviera cazando); el Cazador al menos se detiene
    let distraidas = 0;
    for (const e of world.entities) {
      if (!e.viva) continue;
      if (Math.abs(e.x - tx) + Math.abs(e.y - ty) > 12) continue;
      if (e.def.comportamiento === 'cazador') {
        e.paralizada = Math.max(e.paralizada, 2); // se para a ESCUCHAR
        world.log('El Cazador se detiene en seco, escuchando el eco…', 'good');
      } else {
        e.distraida = 3;
        e.estado = 'alerta';
      }
      distraidas++;
    }
    if (window.Effects) {
      Effects.proyectil(world.player.x, world.player.y, tx, ty, '#d8c8a0');
      Effects.flash(tx, ty, '#d8c8a0');
    }
    if (window.Sfx) Sfx.play('golpe');
    world.log(distraidas
      ? `Arrojas ${world.data.objects[id].nombre} lejos. Algo se gira hacia el golpe.`
      : `Arrojas ${world.data.objects[id].nombre} lejos. El golpe resuena en los pasillos.`, 'event');
    world.ui.updateHUD();
    worldStep();
  }

  // No-clip (Instinto de umbral 80): atraviesas la pared que encaras
  function noclip() {
    if (world.online) return; // sin Sintonía en el MMO (retirada a petición)
    if (world.busy || world.over || world.escondido) return;
    if (!world.instinto('noclip')) {
      if ((world.player.instintos || []).length)
        world.log('Sabes que se puede… pero tu cuerpo aún no. (Instinto No-clip, Sintonía 80.)', 'event');
      return;
    }
    const [fx, fy] = ROT_VEC[world.player.rot ?? 2];
    const g = world.map.grid;
    const wx = world.player.x + fx, wy = world.player.y + fy;
    const ox = world.player.x + fx * 2, oy = world.player.y + fy * 2;
    if (MapGen.at(g, wx, wy) !== T.PARED) { world.log('Ahí no hay pared que atravesar.', 'event'); return; }
    if (!MapGen.walkable(MapGen.at(g, ox, oy))) { world.log('Sientes el otro lado: no hay NADA transitable.', 'event'); return; }
    if (world.entities.some((e) => e.viva && e.x === ox && e.y === oy)) {
      world.log('Algo ocupa el otro lado. Mejor no aparecer DENTRO de ello.', 'danger');
      return;
    }
    world.rollDice('Empujas tu cuerpo A TRAVÉS de la pared…', (d) => {
      if (d <= 3) { die('Te des-encajaste de la realidad. El Vacío no devuelve nada.'); return; }
      world.player.x = ox;
      world.player.y = oy;
      world.sanity(-10);
      if (world.over) return;
      world.tune(4);
      world.log('Atraviesas la pared como quien cruza agua fría.', 'good');
      if (window.Sfx) Sfx.play('crujido');
      if (window.Effects) Effects.particles(ox, oy, '#d9c66e', 12);
      worldStep();
    });
  }

  // teleport de depuración (v20.2): salto directo a cualquier nivel desde el
  // menú de Ajustes — sin puerta de retorno, para no ensuciar el mundo
  function debugTeleport(id) {
    if (!world.data.levels[id] || world.over || !world.level) return;
    world.log(`DEBUG: teleport a ${world.data.levels[id].wikiTitle}.`, 'event');
    enterLevel(id, 'Teleport de depuración.', { sinRetorno: true });
  }

  // pared agrietada (v20): la salida hay que ABRIRLA rompiendo el muro — a
  // puñetazos cuesta (y duele); con una herramienta EN MANO es mucho más fácil
  function intentarRomper(ex) {
    const herramienta = world.enMano('tuberia');
    world.ui.showChoice(
      'Una pared agrietada',
      `«${ex.def.texto}». La grieta recorre el muro de arriba abajo: suena HUECO al otro lado.`,
      [
        {
          label: herramienta ? 'ROMPERLA con la tubería' : 'ROMPERLA a puñetazos',
          cb: () => {
            world.hacerRuido(world.player.x, world.player.y, 12);
            world.rollDice(herramienta ? 'Descargas la tubería contra la grieta…' : 'Golpeas la grieta con los puños…', (d) => {
              const umbral = herramienta ? 7 : 12;
              if (d >= umbral) {
                ex.def._abierta = true;
                world.mapaVersion = (world.mapaVersion || 0) + 1; // el hueco se VE
                world.log(`Dado: ${d}. ¡La pared CEDE! Una luz blanca se abre al otro lado.`, 'good');
                if (window.Sfx) Sfx.play('derrumbe');
                if (window.Effects) {
                  Effects.doShake(5, 220);
                  Effects.flash(world.player.x, world.player.y, '#ffffff');
                }
              } else if (herramienta) {
                world.log(`Dado: ${d}. La tubería rebota. La grieta apenas crece. (Inténtalo otra vez.)`, 'event');
              } else {
                world.hurt(2, 'la pared', true);
                world.log(`Dado: ${d}. Solo te abres los nudillos. Con una herramienta EN MANO sería más fácil.`, 'danger');
              }
              worldStep();
            });
          },
        },
        { label: 'Dejarla en paz', cb: () => {} },
      ]
    );
  }

  // Suelo falso/agrietado: hay que abrir físicamente el hueco antes de caer.
  function intentarRomperSuelo(ex) {
    const herramienta = world.enMano('tuberia');
    world.ui.showChoice(
      'El suelo suena hueco',
      `«${ex.def.texto}». Bajo la moqueta hay tablas vencidas y una corriente de aire imposible.`,
      [
        {
          label: herramienta ? 'GOLPEAR con la tubería' : 'PISOTEAR el suelo',
          cb: () => {
            world.hacerRuido(world.player.x, world.player.y, 12);
            world.rollDice(herramienta ? 'Golpeas las tablas con la tubería…' : 'Descargas todo tu peso sobre las tablas…', (d) => {
              const umbral = herramienta ? 7 : 11;
              if (d >= umbral) {
                ex.def._abierta = true;
                world.mapaVersion = (world.mapaVersion || 0) + 1;
                world.log(`Dado: ${d}. El suelo se PARTE. Debajo solo hay oscuridad.`, 'good');
                if (window.Sfx) Sfx.play('derrumbe');
                if (window.Effects) { Effects.doShake(6, 260); Effects.flash(ex.x, ex.y, '#d9c66e'); }
              } else {
                if (!herramienta) world.hurt(1, 'el golpe contra el suelo', true);
                world.log(`Dado: ${d}. Las tablas crujen, pero todavía aguantan.`, 'event');
              }
              worldStep();
            });
          },
        },
        { label: 'Apartarse', cb: () => {} },
      ]
    );
  }

  // ---------- equipamiento vestible (v20): cara / cuerpo / pies ----------
  function ponerEquipo(slot) {
    if (world.online) { Net.mochila('ponerEquipo', { slot }); return; }
    const id = world.player.inv[slot];
    if (!id || world.over) return;
    const def = world.data.objects[id];
    if (!def.equipo) { world.log(`${def.nombre} no se puede vestir.`, 'event'); return; }
    const eq = world.player.equipo;
    const previo = eq[def.equipo];
    world.player.inv.splice(slot, 1);
    eq[def.equipo] = id;
    if (previo) world.player.inv.push(previo); // intercambio: lo viejo a la mochila
    world.log(`Te pones: ${def.nombre}.`, 'good');
    if (window.Sfx) Sfx.play('ui');
    world.ui.updateHUD();
  }

  function quitarEquipo(tipo) {
    if (world.online) { Net.mochila('quitarEquipo', { tipo }); return; }
    const id = world.player.equipo[tipo];
    if (!id) return;
    if (world.player.inv.length >= 6) { world.log('La mochila está llena: no puedes guardarlo.', 'event'); return; }
    world.player.equipo[tipo] = null;
    world.player.inv.push(id);
    world.log(`Te quitas: ${world.data.objects[id].nombre}.`, 'event');
    if (window.Sfx) Sfx.play('ui');
    world.ui.updateHUD();
  }

  // ---------- esconderse (v18): taquillas y muebles registrados ----------
  const ESCONDITES = new Set(['taquilla', 'nevera', 'archivador']);
  function toggleEsconder(prop) {
    if (world.escondido) {
      world.escondido = null;
      world.log('Sales del escondite, con el corazón en la garganta.', 'event');
      if (window.Sfx) Sfx.play('puerta');
      worldStep();
      return;
    }
    const vistoPor = world.entities.some((e) => e.viva && e.estado === 'caza' &&
      Math.abs(e.x - world.player.x) + Math.abs(e.y - world.player.y) <= 6);
    world.escondido = { x: prop.x, y: prop.y, delatado: vistoPor };
    world.log(vistoPor
      ? `Te metes en ${NOMBRES_CONT[prop.id] ?? 'el mueble'}… pero algo te VIO entrar.`
      : `Te metes en ${NOMBRES_CONT[prop.id] ?? 'el mueble'} y contienes la respiración.`,
      vistoPor ? 'danger' : 'event');
    if (window.Sfx) Sfx.play('puerta');
    worldStep();
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
      // el precio de la Sintonía: cuanto más eres de ESTE lado, menos te deja
      // salir la realidad (d20 contra sintonía/5 — a 100 no hay vuelta)
      const s = world.player.sintonia || 0;
      if (s >= 10) {
        world.rollDice('La salida brilla… pero ¿te reconocerá la realidad como suyo?', (d) => {
          if (d <= Math.floor(s / 5)) {
            world.log(`Dado: ${d}. La membrana te ESCUPE de vuelta. Ya eres demasiado de este lado.`, 'danger');
            world.sanity(-8);
            if (window.Effects) { Effects.doShake(7, 320); Effects.bubble(world.player.x, world.player.y, 'No… me ha… rechazado.', world.player); }
            if (window.Sfx) Sfx.play('dano');
          } else {
            win();
          }
        });
      } else win();
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
      const caminata = def._mec === 'caminata';
      const continua = caminata && world.level.id === 'level-0';
      if (window.Sfx && !caminata) Sfx.play('puerta');
      let destino = def.destino;
      if (destino === '*aleatoria') {
        const ids = Object.keys(world.data.levels).filter((i) => i !== world.level.id);
        destino = world.rng.pick(ids);
      } else if (destino === '*visitada') {
        destino = world.rng.pick(world.visited);
      }
      def._destinoResuelto = destino; // para reconocer esta salida al volver
      // cruzar por donde nadie debería te sintoniza con el lugar
      if (tipo === 'void' || tipo === 'arriesgada') world.tune(5);
      world.prevStack.push(world.level.id);
      enterLevel(destino, def.texto, {
        sinRetorno: caminata || esSinRetorno(def),
        sinTarjeta: continua,
      });
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
          inv: world.player.inv, manos: world.player.manos,
          equipo: world.player.equipo,
          sintonia: world.player.sintonia, instintos: world.player.instintos,
          umbrales: world.player.umbrales,
        },
        journal: world.journal,
        visited: world.visited,
        prevStack: world.prevStack,
        entryCount: world.entryCount,
        turnTotal: world.turnTotal,
        dadosN: world.dadosN,
        pasosNivel: world.pasosNivel,
        caminataObjetivo: world._caminataObjetivo,
        tutorial: world.tutorial,
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
      x: 0, y: 0, rx: 0, ry: 0, dir: 'down', flip: false, rot: 2,
      salud: s.player.salud, cordura: s.player.cordura,
      sed: s.player.sed, hambre: s.player.hambre,
      sintonia: s.player.sintonia || 0, instintos: s.player.instintos || [],
      umbrales: s.player.umbrales || [],
      inv: s.player.inv, manos: s.player.manos || [null, null],
      equipo: s.player.equipo || { cara: null, cuerpo: null, pies: null },
      luz: false, viva: true,
    };
    world.journal = s.journal;
    world.visited = s.visited || [];
    world.prevStack = s.prevStack;
    world.entryCount = s.entryCount;
    world.savedLevels = {};   // los snapshots no se serializan: viven en memoria
    // repite la entrada al nivel guardado sin duplicar el diario
    world.entryCount[s.levelId] = Math.max(0, (world.entryCount[s.levelId] || 1) - 1);
    world.turnTotal = s.turnTotal;
    world.dadosN = s.dadosN || 0;
    world.tutorial = s.tutorial || (s.turnTotal > 0
      ? { inicio: true, interaccion: true, mochila: true }
      : {});
    world.over = false;
    world.level = null;
    enterLevel(s.levelId, 'Retomas la marcha donde lo dejaste.');
    world.pasosNivel = Math.max(0, s.pasosNivel || 0);
    if (s.caminataObjetivo) world._caminataObjetivo = s.caminataObjetivo;
    const f = world.pasosNivel / Math.max(1, world._caminataObjetivo);
    world._caminataAvisos = {
      lejos1: f >= 0.3, lejos2: f >= 0.65, lejos3: f >= 0.82, lejos4: f >= 0.94,
    };
    save();
  }

  window.Game = {
    world, startRun, continueRun, loadSave, Profiles, INSTINTOS,
    tryMove, wait, interact, toggleLuz, useItem, crossExit,
    girar, avanzar, equipar, desequipar, usarMano, tirarItem, arrojarItem, noclip,
    ponerEquipo, quitarEquipo, debugTeleport,
  };
})();
