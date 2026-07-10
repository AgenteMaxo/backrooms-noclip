// Arranque: input, bucle de animación y pantalla de título.
(function () {
  // versión visible del juego (Ajustes); súbela con cada tanda de cambios
  window.VERSION_JUEGO = 'v25';
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
    ...Sprites.CAPA_MASCARA_GAS,
  ]);
  // iconos PNG personalizados (game/assets/icons/) si existen
  if (window.Icons) Icons.tryOverrides(Icons.list());

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
    actualizarAdminUI(); // debug y barras solo con la contraseña de guardián
    const enJuego = world.level && !world.over;
    if (enJuego && world.esAdmin) document.getElementById('debug-nivel').value = world.level.id;
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

  // ---------- versión + pantalla completa + guardián (v23) ----------
  document.getElementById('ajustes-version').textContent =
    `BACKROOMS MMO ${window.VERSION_JUEGO}`;

  const btnFs = document.getElementById('btn-fullscreen');
  btnFs.onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  // v25: pantalla completa DE VERDAD — el lienzo se re-renderiza a la
  // resolución del monitor (nada de cuadro de 960×600 sobre fondo negro)
  function ajustarLienzo() {
    const fs = !!document.fullscreenElement;
    const w = fs ? window.innerWidth : 960;
    const h = fs ? window.innerHeight : 600;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      if (use3D && Render3D.resize) Render3D.resize(w, h);
    }
    document.body.classList.toggle('fs', fs);
  }
  document.addEventListener('fullscreenchange', () => {
    btnFs.textContent = document.fullscreenElement
      ? 'Salir de pantalla completa' : 'Pantalla completa';
    ajustarLienzo();
  });
  window.addEventListener('resize', () => { if (document.fullscreenElement) ajustarLienzo(); });

  // ---------- cámara libre con el RATÓN (v25, online 3ªP): mantener y arrastrar ----------
  {
    const wrap = document.getElementById('game-wrap');
    let arrastre = null;
    wrap.addEventListener('contextmenu', (ev) => ev.preventDefault());
    wrap.addEventListener('mousedown', (ev) => {
      if (!world.online || !use3D || Render3D.modo !== 'tercera') return;
      if (ev.target.closest('button, input, select, #backpack-panel, #log-panel')) return;
      arrastre = ev.clientX;
      wrap.classList.add('orbitando');
    });
    window.addEventListener('mousemove', (ev) => {
      if (arrastre === null) return;
      Render3D.orbita((ev.clientX - arrastre) * 0.0085);
      arrastre = ev.clientX;
    });
    window.addEventListener('mouseup', () => {
      arrastre = null;
      wrap.classList.remove('orbitando');
    });
  }

  // contraseña de guardián: valida contra el servidor (online) y desbloquea
  // el teleport de debug + las barras de salud/comida/bebida/cordura
  function actualizarAdminUI() {
    const admin = !!world.esAdmin;
    const enJuego = world.level && !world.over;
    document.getElementById('admin-row').style.display = admin ? 'none' : 'flex';
    document.getElementById('debug-row').style.display = admin && enJuego ? 'flex' : 'none';
    document.getElementById('debug-stats').style.display = admin && enJuego ? 'block' : 'none';
    if (admin) world.ui.updateHUD();
  }
  window.onAdminCambia = (si) => {
    const msg = document.getElementById('admin-msg');
    if (si) {
      world.log('Las Backrooms te reconocen como su guardián.', 'good');
      document.getElementById('admin-clave').value = '';
      if (msg) msg.textContent = '';
    } else if (msg) {
      // feedback EN el panel (el registro pequeño pasaba desapercibido)
      msg.textContent = '✗ Clave incorrecta (5 fallos = 10 min de bloqueo)';
    }
    actualizarAdminUI();
  };
  {
    const clave = document.getElementById('admin-clave');
    const btnAdmin = document.getElementById('btn-admin');
    // que teclear la contraseña no mueva al personaje ni dispare atajos
    clave.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') btnAdmin.click();
    });
    btnAdmin.onclick = () => {
      const v = clave.value.trim();
      if (!v) { clave.focus(); return; }
      if (world.online && window.Net && Net.activo) Net.admin(v);
      else {
        // modo local (desarrollo, sin servidor): no hay clave que validar
        world.esAdmin = true;
        window.onAdminCambia(true);
      }
    };
  }

  // ---------- debug (v20.2→v23): teleport a cualquier nivel, solo guardián ----------
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
      if (!world.esAdmin || !world.level || world.over || !world.data.levels[id]) return;
      cerrarSndMenu();
      if (world.online && window.Net && Net.activo) Net.tp(id);
      else Game.debugTeleport(id);
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

  // v22: conjunto de teclas de movimiento PULSADAS (keydown/keyup); el vector
  // de input se calcula en cada frame del bucle — movimiento libre y suave
  const teclas = new Set();
  document.addEventListener('keyup', (ev) => teclas.delete(ev.code));
  window.addEventListener('blur', () => {
    teclas.clear();
    if (world.online && window.Net) Net.parar();
  });

  let lastStepT = 0; // mantener pulsado = velocidad CONSTANTE (v16)
  document.addEventListener('keydown', (ev) => {
    if (!world.level || world.over) return;
    if (document.getElementById('screen-card').style.display !== 'none') return;
    // escribiendo en el chat del MMO: el juego no oye nada
    if (window.Net && Net.chatAbierto && Net.chatAbierto()) return;
    const tercera = use3D && Render3D.modo === 'tercera';
    // ---------- modo online (BACKROOMS MMO v22): movimiento LIBRE ----------
    // las teclas de movimiento solo se apuntan; el vector se calcula por frame
    if (world.online) {
      if (KEYS[ev.code]) {
        ev.preventDefault();
        teclas.add(ev.code);
      } else if (ev.code === 'KeyT' || ev.code === 'Enter') {
        ev.preventDefault();
        Net.abrirChat();
      } else if (ev.code === 'Space') {
        ev.preventDefault();
        Net.accion(); // contextual: esconderse, romper, reabrir la oferta de salida
      } else if (ev.code === 'KeyQ' || ev.code === 'KeyE') {
        if (tercera || !use3D) Net.usar(ev.code === 'KeyQ' ? 0 : 1);
        else Render3D.rotar(ev.code === 'KeyQ' ? 1 : -1);
      } else if (ev.code === 'KeyF') Net.luzToggle();
      else if (/^Digit[1-6]$/.test(ev.code)) Game.useItem(parseInt(ev.code.slice(5), 10) - 1);
      else if (ev.code === 'KeyB') world.ui.toggleBackpack();
      else if (ev.code === 'KeyL') world.ui.toggleLog();
      else if (ev.code === 'KeyC') world.ui.toggleCodex();
      else if (ev.code === 'KeyM' || ev.code === 'KeyN') Minimap.toggleBig();
      else if (ev.code === 'Escape') {
        if (Minimap.visible) Minimap.toggleBig(false);
        else if (document.getElementById('backpack-panel').style.display !== 'none') world.ui.toggleBackpack(false);
        else if (sndMenu.style.display !== 'none') cerrarSndMenu();
        else abrirSndMenu();
      }
      // (X=esperar no aplica online: el mundo ya no espera por nadie)
      return;
    }
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

  // ---------- bucle de animación (y, online, también el input continuo) ----------
  function lerp(a, b, f) { return a + (b - a) * f; }

  // (la velocidad de giro online vive en Fisica.GIRO_JUGADOR: cliente y
  // servidor DEBEN integrar el rumbo con la misma constante)
  let lastFrameT = 0;

  function loop(t) {
    requestAnimationFrame(loop);
    const dtBruto = (t - lastFrameT) / 1000 || 0;
    const dtF = Math.min(0.1, dtBruto);
    // la PREDICCIÓN de red integra el tiempo REAL (los microparones del
    // navegador no pueden «perder» camino respecto al servidor → snaps);
    // la física trocea en subpasos, así que un dt grande es seguro
    const dtNet = Math.min(0.6, dtBruto);
    lastFrameT = t;
    if (!world.level || !world.player) return;
    const p = world.player;

    // ---------- v22: vector de movimiento por frame (movimiento libre) ----------
    if (world.online && window.Net && Net.activo &&
        !(Net.chatAbierto && Net.chatAbierto()) &&
        document.getElementById('screen-card').style.display === 'none') {
      // suma de las teclas pulsadas en coordenadas de PANTALLA
      let sx = 0, sy = 0;
      for (const code of teclas) {
        const v = KEYS[code];
        if (v) { sx += v[0]; sy += v[1]; }
      }
      sx = Math.sign(sx); sy = Math.sign(sy);
      const tercera = use3D && Render3D.modo === 'tercera';
      if (tercera) {
        // v25 — estilo Roblox: WASD mueve RELATIVO A LA CÁMARA (adelante/
        // atrás/izquierda/derecha); la cámara solo la mueve el ratón.
        const yaw = Render3D.yaw;
        const Lx = -Math.sin(yaw), Lz = -Math.cos(yaw);  // «adelante» de la cámara
        const Rx = Math.cos(yaw), Rz = -Math.sin(yaw);   // «derecha» de la cámara
        const dx = Lx * -sy + Rx * sx;
        const dy = Lz * -sy + Rz * sx;
        Net.setInput(dx, dy);
        if (dx || dy) {
          p.rot = Math.atan2(dx, -dy); // el personaje ENCARA hacia donde anda
          if (Math.abs(dy) >= Math.abs(dx)) p.dir = dy > 0 ? 'down' : 'up';
          else { p.dir = 'side'; p.flip = dx < 0; }
        }
      } else {
        // 2D / cámara alta: 8 direcciones relativas a la pantalla
        let dx = sx, dy = sy;
        if (use3D && Render3D.rot) {
          const th = -Render3D.rot * Math.PI / 2;
          const rx2 = Math.cos(th) * sx - Math.sin(th) * sy;
          const ry2 = Math.sin(th) * sx + Math.cos(th) * sy;
          dx = rx2; dy = ry2;
        }
        Net.setInput(dx, dy);
        if (dx || dy) {
          // el facing sigue al movimiento (sprite 2D + acciones por ángulo)
          if (Math.abs(dy) >= Math.abs(dx)) p.dir = dy > 0 ? 'down' : 'up';
          else { p.dir = 'side'; p.flip = dx < 0; }
          Net.setRot(Math.atan2(dx, -dy));
        }
      }
      Net.frame(dtNet); // predicción local con la misma física del servidor
    }

    // desliza la posición visual hacia la lógica
    p.rx = lerp(p.rx, p.x, world.online ? 0.5 : 0.28);
    p.ry = lerp(p.ry, p.y, world.online ? 0.5 : 0.28);
    world.moving = Math.abs(p.rx - p.x) + Math.abs(p.ry - p.y) > 0.02;
    for (const e of world.entities) {
      if (e.rx === undefined) { e.rx = e.x; e.ry = e.y; }
      // online las entidades interpolan entre instantáneas reales del servidor
      if (world.online && e._snaps && Otros.muestrear(e, t)) continue;
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
  if (params.get('netdebug')) window.NETDEBUG = true; // consola: derivas de red y rtt
  if ((params.get('autostart') || params.get('selftest') || params.get('online')) && !Game.Profiles.activeName())
    Game.Profiles.create(params.get('nombre') || 'Errante');
  // ---------- BACKROOMS MMO: ?online=1 conecta al mundo compartido ----------
  if (params.get('online')) {
    Net.iniciar(params.get('nombre') || Game.Profiles.activeName() || 'Errante');
    // la tarjeta del nivel aparece al recibir la bienvenida; se entra sola
    const esperaCard = setInterval(() => {
      const btn = document.getElementById('btn-enter');
      if (Net.activo && btn && document.getElementById('screen-card').style.display !== 'none') {
        clearInterval(esperaCard);
        btn.click();
      }
    }, 100);
  } else if (params.get('autostart')) {
    Game.startRun(params.get('seed') || undefined);
    if (params.get('nivel') && world.data.levels[params.get('nivel')]) {
      // salto directo para pruebas
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
    let marchaCache = null;
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
            pasosNivel: world.pasosNivel,
            objetivoCaminata: world._caminataObjetivo,
            posicion: [world.player?.x, world.player?.y],
            mapa: world.map ? [world.map.grid.w, world.map.grid.h] : null,
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
        // Prueba dirigida de una expansión: coloca al jugador en la banda este
        // y avanza un turno. Solo se activa explícitamente con ?shift=1.
        if (params.get('shift') && !window.__shiftForzado) {
          const g = world.map.grid;
          let pos = null;
          for (let x = g.w - 2; x >= g.w - 20 && !pos; x--)
            for (let y = 1; y < g.h - 1; y++)
              if (MapGen.walkable(MapGen.at(g, x, y))) { pos = [x, y]; break; }
          if (pos) {
            world.player.x = world.player.rx = pos[0];
            world.player.y = world.player.ry = pos[1];
            window.__shiftForzado = true;
            Game.wait();
            acciones++;
            return;
          }
        }
        // Marcha dirigida hacia el extremo este: fuerza cambios de ventana en
        // niveles infinitos sin desperdiciar cientos de intentos contra muros.
        if (params.get('marcha')) {
          const g = world.map.grid;
          const version = `${world.ventanaN || 0}:${world.mapaVersion || 0}`;
          if (!marchaCache || marchaCache.version !== version) {
            marchaCache = null;
            buscar: for (let tx = g.w - 2; tx >= 1; tx--)
              for (let ty = 1; ty < g.h - 1; ty++) {
                if (!MapGen.walkable(MapGen.at(g, tx, ty))) continue;
                const dist = MapGen.bfsDist(g, tx, ty);
                if (dist[world.player.y * g.w + world.player.x] >= 0) {
                  marchaCache = { version, dist };
                  break buscar;
                }
              }
          }
          let paso = null;
          if (marchaCache) {
            const actual = marchaCache.dist[world.player.y * g.w + world.player.x];
            for (const [dx, dy] of dirs) {
              const nx = world.player.x + dx, ny = world.player.y + dy;
              if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
              const v = marchaCache.dist[ny * g.w + nx];
              if (v >= 0 && v < actual) { paso = [dx, dy]; break; }
            }
          }
          if (paso) Game.tryMove(paso[0], paso[1]);
          else { marchaCache = null; Game.tryMove(1, 0); }
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
    // BACKROOMS MMO: el botón del título conecta al mundo compartido
    const btn = $id('btn-start');
    const errNet = $id('title-net');
    btn.disabled = true;
    btn.textContent = 'CRUZANDO LA REALIDAD…';
    errNet.style.display = 'none';
    Net.iniciar(P.activeName());
    const t0 = Date.now();
    const espera = setInterval(() => {
      if (Net.activo) {
        clearInterval(espera);
        btn.disabled = false;
        btn.textContent = 'DESPERTAR EN LEVEL 0';
        errNet.style.display = 'none';
      } else if (Net.ultimoError || Date.now() - t0 > 10000) {
        // conexión rechazada o muerta: que el streamer VEA el porqué
        clearInterval(espera);
        btn.disabled = false;
        btn.textContent = 'DESPERTAR EN LEVEL 0';
        errNet.textContent = Net.ultimoError ||
          'No se pudo conectar con las Backrooms. ¿El servidor está despierto?';
        errNet.style.display = 'block';
      }
    }, 200);
  };
  $id('btn-again').onclick = () => {
    refreshTitle();
    world.ui.show('title');
  };
  $id('btn-journal-close').onclick = () => world.ui.toggleJournal();
  $id('btn-end-codex').onclick = () => world.ui.toggleCodex(true);
  $id('btn-end-title').onclick = () => { world.ui.show('title'); refreshTitle(); };
  refreshTitle();
})();
