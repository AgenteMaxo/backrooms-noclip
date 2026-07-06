// Arranque: input, bucle de animación y pantalla de título.
(function () {
  const world = Game.world;
  world.data = window.GAME_DATA;

  const canvas = document.getElementById('game-canvas');
  Render.init(canvas);

  // ---------- selección de renderizador: 3D (Three.js) por defecto, ?render=2d de respaldo ----------
  const paramsPre = new URLSearchParams(location.search);
  let use3D = paramsPre.get('render') !== '2d' && window.Render3D;
  const glCanvas = document.getElementById('gl-canvas');
  if (use3D) {
    try {
      Render3D.init(glCanvas, canvas);
      glCanvas.style.display = 'block';
      document.getElementById('game-wrap').classList.add('modo3d');
    } catch (err) {
      console.warn('WebGL no disponible; usando render 2D', err);
      use3D = false;
      glCanvas.style.display = 'none';
    }
  }

  // sprites PNG personalizados (game/assets/sprites/) si existen
  Sprites.tryOverrides([
    ...Sprites.list(),
    ...Object.values(world.data.entities).map((e) => e.glyph),
  ]);

  // ---------- input ----------
  const KEYS = {
    ArrowUp: [0, -1], KeyW: [0, -1],
    ArrowDown: [0, 1], KeyS: [0, 1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0],
    ArrowRight: [1, 0], KeyD: [1, 0],
  };

  // el audio se desbloquea con el primer gesto (política de los navegadores)
  document.addEventListener('keydown', () => Sfx.unlock(), { once: true });
  document.addEventListener('click', () => Sfx.unlock(), { once: true });

  // slider de volumen del título (en partida el volumen vive en Ajustes: ESC)
  for (const sid of ['vol-slider-title']) {
    const s = document.getElementById(sid);
    if (!s) continue;
    s.value = Math.round(Sfx.volumen * 100);
    s.addEventListener('input', () => {
      Sfx.setVolume(s.value / 100);
      const o = document.getElementById('snd-general');
      if (o) o.value = s.value;
    });
  }

  // ---------- opciones persistentes (v16) ----------
  window.OPTS = { dado: true };
  try { Object.assign(window.OPTS, JSON.parse(localStorage.getItem('backrooms-opts')) || {}); }
  catch (e) { /* opciones corruptas: valores por defecto */ }
  const optDado = document.getElementById('opt-dado');
  optDado.checked = OPTS.dado;
  optDado.onchange = () => {
    OPTS.dado = optDado.checked;
    try { localStorage.setItem('backrooms-opts', JSON.stringify(OPTS)); } catch (e) {}
  };

  // ---------- menú de ajustes de sonido ----------
  const sndMenu = document.getElementById('sound-menu');
  const SND = [
    ['snd-general', 'general', () => Sfx.volumen],
    ['snd-fx', 'fx', () => Sfx.volumenFx],
    ['snd-amb', 'amb', () => Sfx.volumenAmb],
  ];
  function abrirSndMenu() {
    for (const [id, canal, get] of SND) {
      const s = document.getElementById(id);
      s.value = Math.round(get() * 100);
      document.getElementById(id + '-v').textContent = s.value + '%';
    }
    pintarBtnMute();
    // fila de debug: solo en partida; preselecciona el nivel actual
    const dbgRow = document.getElementById('debug-row');
    const enJuego = world.level && !world.over;
    dbgRow.style.display = enJuego ? 'flex' : 'none';
    if (enJuego) document.getElementById('debug-nivel').value = world.level.id;
    sndMenu.style.display = 'flex';
    if (world.level && !world.over) world.busy = true;
  }
  function cerrarSndMenu() {
    sndMenu.style.display = 'none';
    if (world.level && !world.over &&
        document.getElementById('exit-modal').style.display === 'none' &&
        document.getElementById('dice-overlay').style.display === 'none') world.busy = false;
  }
  for (const [id, canal] of SND) {
    const s = document.getElementById(id);
    s.addEventListener('input', () => {
      Sfx.setVolume(s.value / 100, canal);
      document.getElementById(id + '-v').textContent = s.value + '%';
      if (canal === 'general') {
        const o = document.getElementById('vol-slider-title');
        if (o) o.value = s.value;
      }
    });
  }
  function pintarBtnMute() {
    const b = document.getElementById('btn-snd-mute');
    b.textContent = '';
    if (window.Icons) b.appendChild(Icons.img(Sfx.muted ? 'altavoz_mudo' : 'altavoz', 13));
    b.appendChild(document.createTextNode(Sfx.muted ? ' Activar sonido' : ' Silenciar todo'));
  }
  document.getElementById('btn-snd-mute').onclick = () => {
    Sfx.toggleMute();
    pintarBtnMute();
  };
  document.getElementById('btn-snd-close').onclick = cerrarSndMenu;

  // ---------- debug (v20.2): teleport a cualquier nivel desde Ajustes ----------
  {
    const sel = document.getElementById('debug-nivel');
    const niveles = Object.values(world.data.levels).slice().sort((a, b) => {
      // orden natural por número de nivel; los sin número, al final
      const na = parseInt((a.wikiTitle.match(/\d+/) || [9999])[0], 10);
      const nb = parseInt((b.wikiTitle.match(/\d+/) || [9999])[0], 10);
      return na - nb || a.wikiTitle.localeCompare(b.wikiTitle);
    });
    for (const lv of niveles) {
      const o = document.createElement('option');
      o.value = lv.id;
      o.textContent = `${lv.wikiTitle} · P${lv.peligro} · ${lv.bioma}${lv.esEscape ? ' ⭐' : ''}`;
      sel.appendChild(o);
    }
    document.getElementById('btn-debug-tp').onclick = () => {
      const id = sel.value;
      if (!world.level || world.over || !world.data.levels[id]) return;
      cerrarSndMenu();
      Game.debugTeleport(id);
    };
  }
  // mochila (v15): botón del HUD y cierre del panel
  const btnMochila = document.getElementById('btn-mochila');
  if (btnMochila) {
    if (window.Icons) btnMochila.appendChild(Icons.img('mochila', 26));
    btnMochila.onclick = () => world.ui.toggleBackpack();
  }
  const btnBpClose = document.getElementById('btn-backpack-close');
  if (btnBpClose) btnBpClose.onclick = () => world.ui.toggleBackpack(false);
  const btnSndTitle = document.getElementById('btn-sound-menu-title');
  if (btnSndTitle) btnSndTitle.onclick = abrirSndMenu;

  let lastStepT = 0; // mantener pulsado = velocidad CONSTANTE (v16)
  document.addEventListener('keydown', (ev) => {
    if (!world.level || world.over) return;
    if (document.getElementById('screen-card').style.display !== 'none') return;
    const tercera = use3D && Render3D.modo === 'tercera';
    const autoRepeatTime2DMove = 150; // tiempo en ms mínimo entre pasos al mantener pulsada una tecla de movimiento en modo 2D
    const autoRepeatTime3DYMove = 150; // tiempo en ms mínimo entre pasos al mantener pulsada una tecla de movimiento vertical en modo 3D
    const autoRepeatTime3DXMove = 600; // tiempo en ms mínimo entre pasos al mantener pulsada una tecla de movimiento horizontal en modo 3D
    if (KEYS[ev.code]) {
      ev.preventDefault();
      const [sdx, sdy] = KEYS[ev.code]; // dirección de PANTALLA pulsada
      // el auto-repeat del teclado dispara ráfagas: 
      if (tercera) {
        if (
          ev.repeat &&
          (
            (performance.now() - lastStepT < autoRepeatTime3DXMove && sdx !== 0) ||
            (performance.now() - lastStepT < autoRepeatTime3DYMove && sdy !== 0)
          )
        ) {
          return;
        }
      } else {
        if (ev.repeat && performance.now() - lastStepT < autoRepeatTime2DMove) {
          return;
        }
      }
      lastStepT = performance.now();
      if (tercera) {
        // 3ª persona: W avanza, S retrocede, A/D giran al personaje (gratis)
        if (sdy === -1) Game.avanzar(1);
        else if (sdy === 1) Game.avanzar(-1);
        else Game.girar(sdx);
      } else {
        let dx = sdx, dy = sdy;
        // con la cámara rotada, las flechas son relativas a la pantalla
        if (use3D && Render3D.rot) {
          const th = -Render3D.rot * Math.PI / 2;
          const rx = Math.round(Math.cos(th) * dx - Math.sin(th) * dy);
          const ry = Math.round(Math.sin(th) * dx + Math.cos(th) * dy);
          dx = rx; dy = ry;
        }
        Game.tryMove(dx, dy);
      }
    } else if (ev.code === 'KeyQ' || ev.code === 'KeyE') {
      // v19: Q usa la mano izquierda, E la derecha (en ?cam=alta rotan la cámara)
      if (tercera || !use3D) Game.usarMano(ev.code === 'KeyQ' ? 0 : 1);
      else Render3D.rotar(ev.code === 'KeyQ' ? 1 : -1);
    } else if (ev.code === 'Space') {
      ev.preventDefault();
      Game.interact();
    } else if (ev.code === 'KeyX') Game.wait();
    else if (ev.code === 'KeyF') Game.toggleLuz();
    else if (ev.code === 'KeyG') Game.noclip();
    else if (ev.code === 'KeyB') world.ui.toggleBackpack();
    else if (ev.code === 'KeyL') world.ui.toggleLog();
    else if (ev.code === 'KeyJ') world.ui.toggleJournal();
    else if (ev.code === 'KeyC') world.ui.toggleCodex();
    else if (ev.code === 'KeyM' || ev.code === 'KeyN') Minimap.toggleBig();
    else if (ev.code === 'Escape') {
      // ESC: cierra lo que esté abierto; si no hay nada, abre/cierra Ajustes
      if (Minimap.visible) Minimap.toggleBig(false);
      else if (document.getElementById('backpack-panel').style.display !== 'none') world.ui.toggleBackpack(false);
      else if (sndMenu.style.display !== 'none') cerrarSndMenu();
      else abrirSndMenu();
    } else if (/^Digit[1-6]$/.test(ev.code)) Game.useItem(parseInt(ev.code.slice(5), 10) - 1);
  });

  // ---------- bucle de animación (solo visual; la lógica es por turnos) ----------
  function lerp(a, b, f) { return a + (b - a) * f; }

  function loop(t) {
    requestAnimationFrame(loop);
    if (!world.level || !world.player) return;
    const p = world.player;
    // desliza la posición visual hacia la lógica
    p.rx = lerp(p.rx, p.x, 0.28);
    p.ry = lerp(p.ry, p.y, 0.28);
    world.moving = Math.abs(p.rx - p.x) + Math.abs(p.ry - p.y) > 0.02;
    for (const e of world.entities) {
      if (e.rx === undefined) { e.rx = e.x; e.ry = e.y; }
      e.rx = lerp(e.rx, e.x, 0.2);
      e.ry = lerp(e.ry, e.y, 0.2);
    }
    try {
      if (use3D) {
        Render3D.frame(world, t);
      } else {
        // cámara cenital centrada con límites del mapa (solo 2D)
        const TILE = Tiles.TILE;
        const g = world.map.grid;
        world.camera.x = Math.max(0, Math.min(g.w * TILE - canvas.width, p.rx * TILE - canvas.width / 2 + TILE / 2));
        world.camera.y = Math.max(0, Math.min(g.h * TILE - canvas.height, p.ry * TILE - canvas.height / 2 + TILE / 2));
        if (g.w * TILE < canvas.width) world.camera.x = (g.w * TILE - canvas.width) / 2;
        if (g.h * TILE < canvas.height) world.camera.y = (g.h * TILE - canvas.height) / 2;
        Render.frame(world, t);
      }
      Minimap.frame(world, t);
    } catch (err) {
      (window.__renderErrors = window.__renderErrors || []).push(String(err && err.stack || err).slice(0, 300));
      if (window.__renderErrors.length > 8) window.__renderErrors.length = 8;
    }

    // destello rojo al recibir daño (en 3D lo dibuja su overlay)
    if (!use3D) {
      const dt = t - world.ui.flashT;
      if (dt < 220) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = `rgba(160,20,20,${0.35 * (1 - dt / 220)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }
  requestAnimationFrame(loop);

  // ---------- arranque rápido por URL: ?seed=foo&autostart=1&nivel=level-14 ----------
  const params = new URLSearchParams(location.search);
  if (params.get('nofx')) window.NOFX = true;
  if (params.get('debug3d')) window.DEBUG3D_ON = true;
  if ((params.get('autostart') || params.get('selftest')) && !Game.Profiles.activeName())
    Game.Profiles.create('Errante');
  if (params.get('autostart')) {
    Game.startRun(params.get('seed') || undefined);
    if (params.get('nivel') && world.data.levels[params.get('nivel')]) {
      // salto directo para pruebas
      const btn = document.getElementById('btn-enter');
      Game.world.prevStack.push('level-0');
      const id = params.get('nivel');
      setTimeout(() => {
        const enter = document.getElementById('btn-enter');
        window.Game.crossExit({ texto: 'salto de prueba', destino: id, tipo: 'normal' });
        enter.click();
      }, 50);
    } else {
      setTimeout(() => document.getElementById('btn-enter').click(), 50);
    }
    // depuración visual: ?abrir=instinto fuerza un umbral de Sintonía
    if (params.get('abrir') === 'instinto') setTimeout(() => Game.world.tune(22), 500);
    // depuración visual: ?abrir=mochila abre el panel tras entrar
    if (params.get('abrir') === 'mochila') {
      setTimeout(() => {
        world.player.inv.push('agua_almendras', 'botiquin', 'trebol');
        world.player.manos[0] = 'tuberia';
        world.player.equipo.cuerpo = 'chaqueta';
        world.player.equipo.cara = 'mascara_gas';
        world.ui.updateHUD();
        world.ui.toggleBackpack(true);
      }, 400);
    }
  }
  window.DEBUG_GAME = Game; // consola de depuración

  // ---------- autoprueba: ?selftest=200 juega N acciones aleatorias ----------
  if (params.get('selftest')) {
    const errores = [];
    window.onerror = (msg, src, line) => { errores.push(`${msg} @${(src || '').split('/').pop()}:${line}`); };
    const N = parseInt(params.get('selftest'), 10) || 100;
    Game.startRun(params.get('seed') || 'selftest');
    if (params.get('arma')) {
      world.player.inv.push('fuego_griego', 'detector');
      world.player.manos[0] = 'tuberia'; // el arma va EN LA MANO (v15)
    }
    setTimeout(() => document.getElementById('btn-enter')?.click(), 30);
    let acciones = 0;
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    const iv = setInterval(() => {
      try {
        // prueba dirigida de remodelación de zona
        if (params.get('remodel') && acciones === 120 && !world.over) {
          window.__remodelResultado = [];
          for (let i = 0; i < 5; i++) window.__remodelResultado.push(world.remodelarZona());
        }
        if (acciones >= N || world.over) {
          clearInterval(iv);
          const div = document.createElement('div');
          div.id = 'selftest-result';
          div.textContent = JSON.stringify({
            acciones,
            nivel: world.level?.id,
            visitados: world.visited,
            turnoTotal: world.turnTotal,
            salud: world.player?.salud,
            cordura: world.player?.cordura,
            inv: world.player?.inv,
            entidadesVivas: world.entities.filter((e) => e.viva).length,
            over: world.over,
            diario: world.journal.map((j) => j.nombre),
            errores,
            erroresRender: window.__renderErrors || [],
            remodel: window.__remodelResultado || null,
            ventanas: world.ventanaN || 0,
          });
          document.body.appendChild(div);
          document.title = errores.length ? 'SELFTEST-ERRORES' : 'SELFTEST-OK';
          if (params.get('codex')) world.ui.toggleCodex(true);
          return;
        }
        // si hay tarjeta de nivel a la vista, entra
        const card = document.getElementById('screen-card');
        if (card.style.display !== 'none') { document.getElementById('btn-enter').click(); return; }
        // si hay modal de salida, cruza (70%) o quédate
        const modal = document.getElementById('exit-modal');
        if (modal.style.display !== 'none') {
          const btn = Math.random() < 0.7 ? document.getElementById('btn-cross') : document.getElementById('btn-stay');
          if (btn && btn.style.display !== 'none') btn.click(); else document.getElementById('btn-stay').click();
          acciones++;
          return;
        }
        // modal de Instintos (v18): elige la primera carta
        const instModal = document.getElementById('instinto-modal');
        if (instModal && instModal.style.display !== 'none') {
          document.querySelector('.inst-card')?.click();
          acciones++;
          return;
        }
        // elecciones libres (beber agua, caminata, romper pared…): responde algo
        const choiceModal = document.getElementById('choice-modal');
        if (choiceModal && choiceModal.style.display !== 'none') {
          const btns = document.querySelectorAll('#choice-btns button');
          if (btns.length) btns[Math.random() < 0.6 ? 0 : btns.length - 1].click();
          acciones++;
          return;
        }
        if (world.busy) return; // dado en marcha
        // marcha forzada hacia el este serpenteando (prueba de niveles infinitos)
        if (params.get('marcha')) {
          const r = Math.random();
          Game.tryMove(r < 0.5 ? 1 : 0, r < 0.5 ? 0 : (r < 0.75 ? -1 : 1));
          acciones++;
          return;
        }
        // con arma: ataca a la entidad adyacente si la hay
        if (params.get('arma')) {
          const adj = world.entities.find((e) => e.viva &&
            Math.abs(e.x - world.player.x) + Math.abs(e.y - world.player.y) === 1);
          if (adj) {
            Game.tryMove(Math.sign(adj.x - world.player.x), Math.sign(adj.y - world.player.y));
            acciones++;
            return;
          }
        }
        // camina hacia la salida más cercana (con algo de ruido)
        let d = dirs[Math.floor(Math.random() * 4)];
        if (Math.random() < 0.85 && world.map.exits.length) {
          const g = world.map.grid;
          let best = null, bestD = Infinity;
          for (const ex of world.map.exits) {
            const dist = MapGen.bfsDist(g, ex.x, ex.y);
            const v = dist[world.player.y * g.w + world.player.x];
            if (v >= 0 && v < bestD) { bestD = v; best = dist; }
          }
          if (best) {
            for (const [dx, dy] of dirs) {
              const nx = world.player.x + dx, ny = world.player.y + dy;
              if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
              const v = best[ny * g.w + nx];
              if (v >= 0 && v < bestD) { d = [dx, dy]; break; }
            }
          }
        }
        Game.tryMove(d[0], d[1]);
        acciones++;
      } catch (e) {
        errores.push(String(e && e.message || e));
        acciones++;
      }
    }, 5);
  }

  // ---------- título y perfiles ----------
  const $id = (x) => document.getElementById(x);
  const P = Game.Profiles;

  function refreshTitle() {
    const sel = $id('profile-select');
    sel.innerHTML = '';
    const names = P.list();
    for (const n of names) {
      const o = document.createElement('option');
      o.value = n; o.textContent = n;
      if (n === P.activeName()) o.selected = true;
      sel.appendChild(o);
    }
    if (!names.length) {
      const o = document.createElement('option');
      o.textContent = '— sin perfiles —';
      sel.appendChild(o);
    }
    const p = P.get();
    $id('profile-records').textContent = p
      ? `Expediciones: ${p.records.runs} · Niveles descubiertos: ${Object.keys(p.codice).length} · Turnos récord: ${p.records.maxTurnos} · Escapes: ${p.records.escapes}`
      : 'Crea tu perfil para que el Códice registre tu expediente.';
    const saveData = Game.loadSave();
    const btn = $id('btn-continue');
    if (saveData && p) {
      btn.style.display = 'inline-block';
      btn.textContent = `Continuar partida (${saveData.levelId}, semilla ${saveData.runSeed})`;
      btn.onclick = () => Game.continueRun(saveData);
    } else btn.style.display = 'none';
  }

  $id('profile-select').onchange = (ev) => { P.select(ev.target.value); refreshTitle(); };
  $id('btn-profile-create').onclick = () => {
    const nombre = $id('profile-name').value.trim();
    if (!nombre) { $id('profile-name').focus(); return; }
    P.create(nombre);
    $id('profile-name').value = '';
    refreshTitle();
  };
  $id('btn-profile-del').onclick = () => {
    const n = P.activeName();
    if (n && confirm(`¿Borrar el perfil «${n}» y todo su códice?`)) { P.remove(n); refreshTitle(); }
  };
  $id('btn-profile-export').onclick = () => {
    const json = P.exportar();
    if (!json) return;
    const a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
    a.download = `backrooms-perfil-${P.activeName()}.json`;
    a.click();
  };
  $id('btn-profile-import').onclick = () => $id('profile-import-file').click();
  $id('profile-import-file').onchange = (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      if (P.importar(r.result)) refreshTitle();
      else alert('Ese archivo no parece un perfil válido.');
    };
    r.readAsText(f);
    ev.target.value = '';
  };
  $id('btn-codex').onclick = () => world.ui.toggleCodex(true);

  $id('btn-start').onclick = () => {
    if (!P.activeName()) P.create($id('profile-name').value.trim() || 'Errante');
    refreshTitle();
    const seed = $id('seed-input').value.trim();
    Game.startRun(seed || undefined);
  };
  $id('btn-again').onclick = () => {
    refreshTitle();
    Game.startRun();
  };
  $id('btn-journal-close').onclick = () => world.ui.toggleJournal();
  $id('btn-end-codex').onclick = () => world.ui.toggleCodex(true);
  $id('btn-end-title').onclick = () => { world.ui.show('title'); refreshTitle(); };
  refreshTitle();
})();
