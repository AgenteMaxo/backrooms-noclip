// Arranque: input, bucle de animación y pantalla de título.
(function () {
  // versión visible del juego (Ajustes); súbela con cada tanda de cambios
  window.VERSION_JUEGO = 'v30.15';
  const world = Game.world;
  world.data = window.GAME_DATA;

  // ---------- splash de presentación (v30.14, idea de Jaime Gaming #81) ----------
  (function () {
    const splash = document.getElementById('splash');
    if (!splash) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let cerrado = false;
    function cerrarSplash() {
      if (cerrado) return;
      cerrado = true;
      splash.classList.add('oculto');
      setTimeout(() => splash.remove(), 1000);
    }
    // barras de letterbox al entrar; con reduced-motion se despacha enseguida
    requestAnimationFrame(() => splash.classList.add('mostrar'));
    setTimeout(cerrarSplash, reduce ? 600 : 3200);
    window.addEventListener('pointerdown', cerrarSplash, { once: true });
    window.addEventListener('keydown', cerrarSplash, { once: true });
  })();

  // Censo discreto de la portada: una petición pequeña al arrancar y cada 30 s.
  const census = document.getElementById('backrooms-census');
  const censusText = document.getElementById('backrooms-census-text');
  async function actualizarCenso() {
    const title = document.getElementById('screen-title');
    if (!census || !censusText || document.hidden || title.style.display === 'none') return;
    try {
      const res = await fetch('censo', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const datos = await res.json();
      const total = Number.isInteger(datos.total) && datos.total >= 0 ? datos.total : 0;
      censusText.textContent = total === 0
        ? 'No se detectan errantes al otro lado'
        : `${total} ${total === 1 ? 'errante vaga' : 'errantes vagan'} ahora por las Backrooms`;
      census.classList.remove('census-offline');
    } catch (e) {
      censusText.textContent = 'Las paredes no devuelven ninguna señal';
      census.classList.add('census-offline');
    }
  }
  actualizarCenso();
  setInterval(actualizarCenso, 30000);
  document.addEventListener('visibilitychange', actualizarCenso);

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

  // assets personalizados (game/assets/): los del JUEGO se cargan al entrar
  // en partida, NO en la portada — y solo las rutas del manifiesto de assets
  // reales (v30.6: antes la portada disparaba cientos de peticiones 404
  // sondeando cada sprite/sonido posible en 4 extensiones)
  let overridesDeJuegoCargados = false;
  function cargarOverridesDeJuego() {
    if (overridesDeJuegoCargados) return;
    overridesDeJuegoCargados = true;
    Sprites.tryOverrides([
      ...Sprites.list(),
      ...Object.values(world.data.entities).map((e) => e.glyph),
      ...Sprites.CAPA_MASCARA_GAS,
      ...Object.keys(world.data.objects),
    ]);
    if (window.Sfx) Sfx.cargarOverrides();
  }
  // iconos PNG personalizados: sí al arrancar (la propia portada los usa)
  if (window.Icons) Icons.tryOverrides(Icons.list());
  // favicon real desde los iconos pixel-art (antes /favicon.ico daba 404)
  if (window.Icons) {
    const fav = document.createElement('link');
    fav.rel = 'icon';
    fav.href = Icons.url('puerta');
    document.head.appendChild(fav);
  }

  // ---------- input ----------
  const KEYS = {
    ArrowUp: [0, -1], KeyW: [0, -1],
    ArrowDown: [0, 1], KeyS: [0, 1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0],
    ArrowRight: [1, 0], KeyD: [1, 0],
  };

  // el audio se desbloquea con el primer gesto (política de los navegadores)
  document.addEventListener('keydown', () => { Sfx.unlock(); playMenuMusic(); }, { once: true });
  document.addEventListener('click', () => { Sfx.unlock(); playMenuMusic(); }, { once: true });

  // Cierre global consistente de paneles mediante tecla ESC o C (Reportado por aimar667 [HYTL])
  document.addEventListener('keydown', (ev) => {
    if (ev.code !== 'Escape' && ev.code !== 'KeyC') return;

    // Si están escribiendo en un input, ignorar atajos de teclado de una sola letra (como 'C')
    const activeEl = document.activeElement;
    const typing = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
    if (typing && ev.code !== 'Escape') return;

    // 1. Panel de Changelog
    const changelogPanel = document.getElementById('changelog-panel');
    if (changelogPanel && changelogPanel.style.display !== 'none') {
      ev.preventDefault();
      ev.stopPropagation();
      if (world.ui && typeof world.ui.toggleChangelog === 'function') {
        world.ui.toggleChangelog(false);
      } else {
        changelogPanel.style.display = 'none';
      }
      return;
    }

    // 2. Panel de Códice
    const codexPanel = document.getElementById('codex-panel');
    if (codexPanel && codexPanel.style.display !== 'none') {
      ev.preventDefault();
      ev.stopPropagation();
      if (world.ui && typeof world.ui.toggleCodex === 'function') {
        world.ui.toggleCodex(false);
      } else {
        codexPanel.style.display = 'none';
      }
      return;
    }

    // 3. Panel de ajustes de mando (se abre sobre/desde Ajustes y no lo cerraba)
    const gamepadMenuEl = document.getElementById('gamepad-menu');
    if (gamepadMenuEl && gamepadMenuEl.style.display !== 'none' && ev.code === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      gamepadMenuEl.style.display = 'none';
      if (typeof openedFromSndMenu !== 'undefined' && openedFromSndMenu && typeof abrirSndMenu === 'function') {
        abrirSndMenu();
      }
      return;
    }

    // 4. Menú de sonido/ajustes (solo con Escape)
    const sndMenu = document.getElementById('sound-menu');
    if (sndMenu && sndMenu.style.display !== 'none' && ev.code === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof cerrarSndMenu === 'function') {
        cerrarSndMenu();
      } else {
        sndMenu.style.display = 'none';
      }
      return;
    }

    // 5. Abrir Códice en la pantalla de título si se pulsa C
    if (ev.code === 'KeyC' && (!window.world || !world.level || world.over)) {
      const titleScreen = document.getElementById('screen-title');
      if (titleScreen && titleScreen.style.display !== 'none') {
        const sndMenu = document.getElementById('sound-menu');
        if (
          (!codexPanel || codexPanel.style.display === 'none') &&
          (!changelogPanel || changelogPanel.style.display === 'none') &&
          (!sndMenu || sndMenu.style.display === 'none')
        ) {
          ev.preventDefault();
          ev.stopPropagation();
          if (world.ui && typeof world.ui.toggleCodex === 'function') {
            world.ui.toggleCodex(true);
          }
          return;
        }
      }
    }
  }, { capture: true });

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
  window.OPTS = {
  gamepadMap: {
    interact: 0,
    wait: 2,
    light: 3,
    handL: 4,
    handR: 5,
    backpack: 1,
    menu: 9,
    map: 6,
    log: 7,
    codex: 8,
    journal: 11,
    chat: 12
  },
  cursorSpeed: 8, dado: true, mostrarFps: false,
  // en táctil el arrastre se siente invertido respecto al ratón en PC (el
  // gesto natural es "arrastro el mundo", no "muevo la mirada"); por defecto
  // solo la primera vez — si el jugador ya guardó una preferencia (incluso
  // desactivándolo a mano), storedOpts la pisa más abajo
  camaraModo: 'libre',
  camaraInvertir: !!(window.matchMedia && matchMedia('(pointer: coarse)').matches),
  camaraSens: 100, camaraSeguimiento: 8, resolucion: 'auto16x9', fpsMax: 'vsync', menuMusica: 'menu1' };
  try { 
    const storedOpts = JSON.parse(localStorage.getItem('backrooms-opts')) || {};
    if (storedOpts.gamepadMap) {
      Object.assign(window.OPTS.gamepadMap, storedOpts.gamepadMap);
      delete storedOpts.gamepadMap;
    }
    Object.assign(window.OPTS, storedOpts);
  } catch (e) { /* opciones corruptas: valores por defecto */ }
  const optDado = document.getElementById('opt-dado');
  optDado.checked = OPTS.dado;
  optDado.onchange = () => {
    OPTS.dado = optDado.checked;
    try { localStorage.setItem('backrooms-opts', JSON.stringify(OPTS)); } catch (e) {}
  };

  // contador de FPS en pantalla (v30.7): tick en Ajustes; el propio bucle de
  // frames lo alimenta (media de ~500 ms para que no baile)
  const optFpsVer = document.getElementById('opt-fps-ver');
  const fpsEl = document.createElement('div');
  fpsEl.id = 'fps-counter';
  fpsEl.style.cssText = 'position:fixed;top:6px;right:8px;z-index:70;display:none;' +
    'font:16px VT323,monospace;color:#d9c66e;background:rgba(10,9,6,.6);' +
    'padding:1px 7px;border:1px solid #3a352a;pointer-events:none;';
  document.body.appendChild(fpsEl);
  function aplicarFpsVer() { fpsEl.style.display = OPTS.mostrarFps ? 'block' : 'none'; }
  if (optFpsVer) {
    optFpsVer.checked = !!OPTS.mostrarFps;
    aplicarFpsVer();
    optFpsVer.onchange = () => {
      OPTS.mostrarFps = optFpsVer.checked;
      aplicarFpsVer();
      try { localStorage.setItem('backrooms-opts', JSON.stringify(OPTS)); } catch (e) {}
    };
  }
  let fpsFrames = 0, fpsDesde = 0;
  window.contarFrameFps = (t) => {
    if (!OPTS.mostrarFps) return;
    fpsFrames++;
    if (!fpsDesde) fpsDesde = t;
    if (t - fpsDesde >= 500) {
      fpsEl.textContent = Math.round(fpsFrames * 1000 / (t - fpsDesde)) + ' fps';
      fpsFrames = 0;
      fpsDesde = t;
    }
  };

  const optCamaraModo = document.getElementById('opt-camara-modo');
  const rowCamaraSeguimiento = document.getElementById('row-camara-seguimiento');
  const optCamaraSeguimiento = document.getElementById('opt-camara-seguimiento');
  const optCamaraSeguimientoV = document.getElementById('opt-camara-seguimiento-v');

  function actualizarVisibilidadSeguimiento() {
    if (rowCamaraSeguimiento) {
      rowCamaraSeguimiento.style.display = OPTS.camaraModo === 'bloqueada' ? 'flex' : 'none';
    }
  }

  if (optCamaraModo) {
    optCamaraModo.value = OPTS.camaraModo || 'libre';
    actualizarVisibilidadSeguimiento();
    optCamaraModo.onchange = () => {
      OPTS.camaraModo = optCamaraModo.value;
      try { localStorage.setItem('backrooms-opts', JSON.stringify(OPTS)); } catch (e) {}
      actualizarVisibilidadSeguimiento();
      if (OPTS.camaraModo !== 'libre' && document.pointerLockElement) {
        document.exitPointerLock();
      }
    };
  }

  if (optCamaraSeguimiento) {
    optCamaraSeguimiento.value = OPTS.camaraSeguimiento !== undefined ? OPTS.camaraSeguimiento : 8;
    if (optCamaraSeguimientoV) optCamaraSeguimientoV.textContent = optCamaraSeguimiento.value;
    optCamaraSeguimiento.oninput = () => {
      OPTS.camaraSeguimiento = parseInt(optCamaraSeguimiento.value, 10);
      if (optCamaraSeguimientoV) optCamaraSeguimientoV.textContent = OPTS.camaraSeguimiento;
    };
    optCamaraSeguimiento.onchange = () => {
      try { localStorage.setItem('backrooms-opts', JSON.stringify(OPTS)); } catch (e) {}
    };
  }
  const optCamaraInvertir = document.getElementById('opt-camara-invertir');
  if (optCamaraInvertir) {
    optCamaraInvertir.checked = !!OPTS.camaraInvertir;
    optCamaraInvertir.onchange = () => {
      OPTS.camaraInvertir = optCamaraInvertir.checked;
      try { localStorage.setItem('backrooms-opts', JSON.stringify(OPTS)); } catch (e) {}
    };
  }
  const optCamaraSens = document.getElementById('opt-camara-sens');
  const optCamaraSensV = document.getElementById('opt-camara-sens-v');
  if (optCamaraSens) {
    optCamaraSens.value = OPTS.camaraSens !== undefined ? OPTS.camaraSens : 100;
    if (optCamaraSensV) optCamaraSensV.textContent = optCamaraSens.value + '%';
    optCamaraSens.oninput = () => {
      OPTS.camaraSens = parseInt(optCamaraSens.value, 10);
      if (optCamaraSensV) optCamaraSensV.textContent = OPTS.camaraSens + '%';
    };
    optCamaraSens.onchange = () => {
      try { localStorage.setItem('backrooms-opts', JSON.stringify(OPTS)); } catch (e) {}
    };
  }

  const optResolucion = document.getElementById('opt-resolucion');
  if (optResolucion) {
    let rVal = OPTS.resolucion || 'auto16x9';
    if (rVal === 'auto') rVal = 'auto16x9';
    optResolucion.value = rVal;
    optResolucion.onchange = () => {
      OPTS.resolucion = optResolucion.value;
      try { localStorage.setItem('backrooms-opts', JSON.stringify(OPTS)); } catch (e) {}
      ajustarLienzo();
    };
  }

  const optFps = document.getElementById('opt-fps');
  if (optFps) {
    optFps.value = OPTS.fpsMax || 'vsync';
    optFps.onchange = () => {
      OPTS.fpsMax = optFps.value;
      try { localStorage.setItem('backrooms-opts', JSON.stringify(OPTS)); } catch (e) {}
    };
  }

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
    // «Noclipearse a la realidad» solo tiene sentido DENTRO de una partida
    const btnNoclip = document.getElementById('btn-noclip-menu');
    if (btnNoclip) btnNoclip.style.display = enJuego ? '' : 'none';
    sndMenu.style.display = 'flex';
    if (enJuego) world.busy = true;
  }
  function cerrarSndMenu() {
    sndMenu.style.display = 'none';
    if (world.level && !world.over &&
        document.getElementById('exit-modal').style.display === 'none' &&
        document.getElementById('dice-overlay').style.display === 'none') world.busy = false;
  }
  // ESC: cierra lo que esté abierto; si no hay nada, abre/cierra Ajustes.
  // La comparte el teclado (online y offline) y el botón táctil #btn-esc
  // (no hay tecla ESC física en móvil).
  function simularEscape() {
    if (document.pointerLockElement) { document.exitPointerLock(); return; }
    if (Minimap.visible) Minimap.toggleBig(false);
    else if (document.getElementById('backpack-panel').style.display !== 'none') world.ui.toggleBackpack(false);
    else if (sndMenu.style.display !== 'none') cerrarSndMenu();
    else abrirSndMenu();
  }
  const btnEsc = document.getElementById('btn-esc');
  if (btnEsc) {
    btnEsc.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      Sfx.unlock();
      simularEscape();
    }, { passive: false });
    if (window.Icons) Icons.set(btnEsc, 'engranaje', 15);
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
  // Noclipearse a la realidad (v30.14): salir de la partida y volver al menú.
  // La recarga cierra el WebSocket limpio y deja la portada sin estados
  // residuales (HUD, música, reconexiones) — el guardado por perfil persiste.
  const btnNoclip = document.getElementById('btn-noclip-menu');
  if (btnNoclip) btnNoclip.onclick = () => location.reload();

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
    // 1. Obtener la resolución elegida y su ratio
    let resW = 960;
    let resH = 600;
    let auto = true;
    let ratio = 16 / 9; // Por defecto auto 16:9
    
    let resOpt = (window.OPTS && window.OPTS.resolucion) || 'auto16x9';
    if (resOpt === 'auto') resOpt = 'auto16x9'; // Fallback para guardado viejo
    
    if (resOpt === 'auto16x9') {
      ratio = 16 / 9;
      auto = true;
    } else if (resOpt === 'auto16x10') {
      ratio = 16 / 10;
      auto = true;
    } else {
      const parts = resOpt.split('x');
      if (parts.length === 2) {
        resW = parseInt(parts[0], 10);
        resH = parseInt(parts[1], 10);
        auto = false;
        ratio = resW / resH;
      }
    }

    // 2. Calcular el tamaño de pantalla del contenedor (layout size)
    let w = fs ? Math.max(320, window.innerWidth) : 960;
    let h = fs ? Math.max(200, window.innerHeight) : 600;
    if (!fs) {
      const vv = window.visualViewport;
      const vw = Math.max(320, Math.floor(vv ? vv.width : window.innerWidth));
      const vh = Math.max(200, Math.floor(vv ? vv.height : window.innerHeight));
      const esTactil = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      const margen = esTactil ? 0 : 24;
      
      // Ajustar el contenedor al viewport respetando el ratio
      w = vw - margen;
      h = vh - margen;
      if (w / h > ratio) w = Math.floor(h * ratio);
      else h = Math.floor(w / ratio);
      
      w = Math.max(320, w);
      h = Math.max(200, h);
    } else {
      // En pantalla completa, reajustar para mantener el ratio con barras negras (letterbox)
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      w = vw;
      h = vh;
      if (w / h > ratio) w = Math.floor(h * ratio);
      else h = Math.floor(w / ratio);
    }
    
    document.documentElement.style.setProperty('--game-w', `${w}px`);
    document.documentElement.style.setProperty('--game-h', `${h}px`);

    // 3. Establecer resolución interna del lienzo
    let rw, rh;
    if (auto) {
      // Si es auto, la resolución sigue exactamente al tamaño de pantalla
      rw = w;
      rh = h;
    } else {
      // Si es manual, se usa exactamente la resolución elegida
      rw = resW;
      rh = resH;
    }

    if (canvas.width !== rw || canvas.height !== rh) {
      canvas.width = rw; canvas.height = rh;
      if (use3D && Render3D.resize) Render3D.resize(rw, rh);
    }
    document.body.classList.toggle('fs', fs);
  }
  document.addEventListener('fullscreenchange', () => {
    const isFullscreen = !!document.fullscreenElement;
    btnFs.textContent = isFullscreen
      ? 'Salir de pantalla completa' : 'Pantalla completa';
    ajustarLienzo();
    // Captura la tecla Escape en pantalla completa: sin esto, al liberar el
    // Pointer Lock con ESC el navegador cierra TAMBIÉN la pantalla completa
    // de golpe (comportamiento nativo de seguridad). Con el teclado
    // capturado, Chrome exige mantener ESC pulsado un momento para forzar
    // la salida real de pantalla completa — nuestro propio handler sigue
    // liberando solo el Pointer Lock en la primera pulsación.
    if (isFullscreen) {
      if (navigator.keyboard && navigator.keyboard.lock) {
        navigator.keyboard.lock(['Escape']).catch((e) => {
          console.warn('Keyboard lock falló:', e);
        });
      }
    } else if (navigator.keyboard && navigator.keyboard.unlock) {
      navigator.keyboard.unlock();
    }
  });
  window.addEventListener('resize', ajustarLienzo);
  window.addEventListener('orientationchange', () => setTimeout(ajustarLienzo, 140));
  ajustarLienzo();

  // ---------- cámara libre con el RATÓN (v25, online 3ªP) ----------
  // Ajustes → OPTS.camaraModo: 'libre' (Pointer Lock, POR DEFECTO desde
  // v26.5: clic izquierdo engancha el puntero, ESC lo libera — sin chocar
  // con el borde de la pantalla) o 'clic' (clic derecho y arrastrar, estilo
  // Roblox). Inversión y sensibilidad se aplican a los tres caminos (clic,
  // libre y arrastre táctil) para que el gesto se sienta igual.
  {
    const wrap = document.getElementById('game-wrap');
    let arrastre = null;
    let arrastreTactil = null;
    let justLocked = false;
    wrap.addEventListener('contextmenu', (ev) => ev.preventDefault());
    wrap.addEventListener('mousedown', (ev) => {
      if (!world.online || !use3D || Render3D.modo !== 'tercera') return;
      if (world.busy) return;
      if (ev.target.closest('button, input, select, #backpack-panel, #log-panel, #journal-panel, #codex-panel, #changelog-panel, #sound-menu, .choice-modal, .modal-box')) return;
      const modo = window.OPTS.camaraModo || 'libre';
      if (modo === 'libre') {
        if (ev.button !== 0) return; // clic izquierdo engancha el puntero
        if (document.pointerLockElement !== wrap) wrap.requestPointerLock();
        return;
      }
      if (ev.button !== 2) return; // modo clic: solo el derecho arrastra
      arrastre = ev.clientX;
      wrap.classList.add('orbitando');
    });
    window.addEventListener('mousemove', (ev) => {
      const modo = window.OPTS.camaraModo || 'libre';
      const factor = window.OPTS.camaraInvertir ? 1 : -1;
      const sensMult = (window.OPTS.camaraSens !== undefined ? window.OPTS.camaraSens : 100) / 100;
      if (modo === 'libre' && document.pointerLockElement === wrap) {
        if (justLocked) { justLocked = false; return; } // tirón del centrado del navegador
        const dx = ev.movementX || 0;
        if (Math.abs(dx) > 200) return; // salto anómalo del cursor: se ignora
        Render3D.orbita(factor * dx * 0.0035 * sensMult);
        return;
      }
      if (arrastre === null) return;
      Render3D.orbita(factor * (arrastre - ev.clientX) * 0.0085 * sensMult);
      arrastre = ev.clientX;
    });
    window.addEventListener('mouseup', () => {
      arrastre = null;
      wrap.classList.remove('orbitando');
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === wrap) {
        justLocked = true;
      } else {
        arrastre = null;
        wrap.classList.remove('orbitando');
        teclas.clear();
        window.joyDx = 0; window.joyDy = 0;
        if (world.online && window.Net) Net.parar();
      }
    });
    wrap.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'mouse') return;
      if (!world.online || !use3D || Render3D.modo !== 'tercera') return;
      if (ev.target.closest('#touch-controls, button, input, select, #backpack-panel, #log-panel, #game-menu, #sound-menu, #item-modal')) return;
      ev.preventDefault();
      arrastreTactil = { id: ev.pointerId, x: ev.clientX };
      try { wrap.setPointerCapture(ev.pointerId); } catch (e) {}
      wrap.classList.add('orbitando');
    }, { passive: false });
    wrap.addEventListener('pointermove', (ev) => {
      if (!arrastreTactil || arrastreTactil.id !== ev.pointerId) return;
      ev.preventDefault();
      const factor = window.OPTS.camaraInvertir ? 1 : -1;
      const sensMult = (window.OPTS.camaraSens !== undefined ? window.OPTS.camaraSens : 100) / 100;
      Render3D.orbita(factor * (arrastreTactil.x - ev.clientX) * 0.010 * sensMult);
      arrastreTactil.x = ev.clientX;
    }, { passive: false });
    function finArrastreTactil(ev) {
      if (!arrastreTactil || arrastreTactil.id !== ev.pointerId) return;
      arrastreTactil = null;
      wrap.classList.remove('orbitando');
      try { wrap.releasePointerCapture(ev.pointerId); } catch (e) {}
    }
    wrap.addEventListener('pointerup', finArrastreTactil);
    wrap.addEventListener('pointercancel', finArrastreTactil);
  }

  // contraseña de guardián: valida contra el servidor (online) y desbloquea
  // el teleport de debug + las barras de salud/comida/bebida/cordura
  function actualizarAdminUI() {
    const admin = !!world.esAdmin;
    const enJuego = world.level && !world.over;
    document.getElementById('admin-row').style.display = admin ? 'none' : 'flex';
    document.getElementById('debug-container').style.display = admin && enJuego ? 'block' : 'none';
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

  // ---------- debug (v20.2→v23): teleport a cualquier nivel e items, solo guardián ----------
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

    const selObj = document.getElementById('debug-objeto');
    if (selObj) {
      const objetos = Object.entries(world.data.objects).sort((a, b) => a[1].nombre.localeCompare(b[1].nombre));
      for (const [id, obj] of objetos) {
        const o = document.createElement('option');
        o.value = id;
        o.textContent = obj.nombre || id;
        selObj.appendChild(o);
      }
      document.getElementById('btn-debug-item').onclick = () => {
        const id = selObj.value;
        if (!world.esAdmin || !world.level || world.over || !world.data.objects[id]) return;
        if (world.online && window.Net && Net.activo) {
          Net.give(id);
        } else {
          if (world.player.inv.length >= 6) {
            world.log('Mochila llena. No puedes añadir más objetos.', 'danger');
            return;
          }
          world.player.inv.push(id);
          world.log(`[Debug] Añadido: ${world.data.objects[id].nombre} a tu mochila.`, 'good');
          world.ui.updateHUD();
        }
      };
    }
  }
  // ---------- modo espectador (v30): barra, HUD fuera y cámara cenital ----------
  // Se entra desde la Sala de Control (/observatorio/mapa, botón 👁) o
  // programáticamente con Net.espectar(id); ←/→ cambian de objetivo, ESC sale.
  function cambiarObjetivoEsp(dir) {
    if (!world.espectador || !window.Net || !Net.activo) return;
    // v30.7: la rotación la resuelve el SERVIDOR sobre TODOS los errantes de
    // todas las instancias/niveles (antes solo se ciclaba la sala actual)
    Net.espectar(dir > 0 ? 'sig' : 'ant');
  }
  let yaEspectando = false; // el bloque de entrada solo la PRIMERA vez
  window.onEspectarCambia = (si, info) => {
    document.body.classList.toggle('espectando', !!si);
    const bar = document.getElementById('espectador-bar');
    if (bar) bar.style.display = si ? 'flex' : 'none';
    const nom = document.getElementById('esp-nombre');
    // v30.7: la barra muestra también EN QUÉ NIVEL está el observado (el
    // espectador viaja a su sala, así que world.level ya es el suyo)
    if (nom) nom.textContent = si && info
      ? `${info.nombre}${world.level ? ' — ' + (world.level.nombre || world.level.id) : ''}` : '';
    const entrando = si && !yaEspectando;
    yaEspectando = !!si;
    if (entrando) {
      // la vista pasa a ser del nivel, no del guardián: fuera paneles y movimiento
      if (Minimap.visible) Minimap.toggleBig(false);
      world.ui.toggleBackpack(false);
      cerrarSndMenu();
      if (document.pointerLockElement) document.exitPointerLock();
      world.log(`Observas a ${info ? info.nombre : '???'} desde fuera de la realidad.`, 'event');
    }
    // (al salir, el aviso «Vuelves a pisar la moqueta» ya lo manda el servidor)
  };
  {
    const b = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    b('esp-prev', () => cambiarObjetivoEsp(-1));
    b('esp-next', () => cambiarObjetivoEsp(1));
    b('esp-salir', () => { if (window.Net && Net.activo) Net.espectar(null); });
    // rueda del ratón: altura de la cámara cenital
    document.addEventListener('wheel', (ev) => {
      if (world.espectador && use3D && window.Render3D)
        Render3D.espAlt += Math.sign(ev.deltaY) * 1.5;
    }, { passive: true });
  }

  // mochila (v15): botón del HUD y cierre del panel
  const btnMochila = document.getElementById('btn-mochila');
  if (btnMochila) {
    if (window.Icons) btnMochila.appendChild(Icons.img('mochila', 26));
    btnMochila.onclick = () => world.ui.toggleBackpack();
  }
  const btnBpClose = document.getElementById('btn-backpack-close');
  if (btnBpClose) btnBpClose.onclick = () => world.ui.toggleBackpack(false);
  
  // ---------- ajustes de mando ----------
  const btnGamepadSettings = document.getElementById('btn-gamepad-settings');
  const gamepadMenu = document.getElementById('gamepad-menu');
  const gamepadList = document.getElementById('gamepad-mapping-list');
  const gamepadWaitMsg = document.getElementById('gamepad-wait-msg');
  const optCursorSpeed = document.getElementById('opt-cursor-speed');
  const optCursorSpeedV = document.getElementById('opt-cursor-speed-v');
  let isWaitingForButton = false;
  let currentActionToMap = null;

  let openedFromSndMenu = false;
  if (btnGamepadSettings) {
    btnGamepadSettings.onclick = () => {
      openedFromSndMenu = true;
      sndMenu.style.display = 'none';
      gamepadMenu.style.display = 'flex';
      optCursorSpeed.value = OPTS.cursorSpeed;
      optCursorSpeedV.textContent = OPTS.cursorSpeed;
      renderGamepadList();
    };
  }

  const btnGamepadTitle = document.getElementById('btn-gamepad-title');
  if (btnGamepadTitle) {
    btnGamepadTitle.onclick = () => {
      openedFromSndMenu = false;
      gamepadMenu.style.display = 'flex';
      optCursorSpeed.value = OPTS.cursorSpeed;
      optCursorSpeedV.textContent = OPTS.cursorSpeed;
      renderGamepadList();
    };
  }
  
  if (optCursorSpeed) {
    optCursorSpeed.oninput = () => {
      OPTS.cursorSpeed = parseInt(optCursorSpeed.value, 10);
      optCursorSpeedV.textContent = OPTS.cursorSpeed;
      guardarOpciones();
    };
  }
  
  const btnGamepadClose = document.getElementById('btn-gamepad-close');
  if (btnGamepadClose) {
    btnGamepadClose.onclick = () => {
      gamepadMenu.style.display = 'none';
      if (openedFromSndMenu) abrirSndMenu();
    };
  }

  const btnGamepadDefault = document.getElementById('btn-gamepad-default');
  if (btnGamepadDefault) {
    btnGamepadDefault.onclick = () => {
      OPTS.gamepadMap = { interact: 0, wait: 2, light: 3, handL: 4, handR: 5, backpack: 1, menu: 9, map: 6, log: 7, codex: 8, journal: 11, chat: 12 };
      OPTS.cursorSpeed = 8;
      optCursorSpeed.value = 8;
      optCursorSpeedV.textContent = 8;
      guardarOpciones();
      renderGamepadList();
    };
  }

  function renderGamepadList() {
    if (!gamepadList) return;
    gamepadList.innerHTML = '';
    const actions = [
      { id: 'interact', label: 'Interactuar / Aceptar / Cursor' },
      { id: 'wait', label: 'Esperar un turno' },
      { id: 'light', label: 'Encender/Apagar linterna' },
      { id: 'handL', label: 'Usar mano izquierda (Q)' },
      { id: 'handR', label: 'Usar mano derecha (E)' },
      { id: 'backpack', label: 'Mochila' },
      { id: 'map', label: 'Mapa (M/N)' },
      { id: 'log', label: 'Registro (L)' },
      { id: 'journal', label: 'Diario (J)' },
      { id: 'codex', label: 'Códice (C)' },
      { id: 'chat', label: 'Chat MMO (T)' },
      { id: 'menu', label: 'Menú / Cerrar' }
    ];
    for (const action of actions) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.marginBottom = '6px';
      
      const lbl = document.createElement('span');
      lbl.textContent = action.label;
      
      const btn = document.createElement('button');
      btn.className = 'btn-small';
      btn.style.marginTop = '0';
      btn.style.display = 'flex';
      btn.style.alignItems = 'center';
      btn.style.gap = '6px';
      if (window.Controllers) {
        // v28 — glifo del botón según el mando conectado (Xbox / PlayStation)
        const idx = OPTS.gamepadMap[action.id];
        const gl = Controllers.buttonGlyph(idx, 18, Controllers.activeGamepadType());
        gl.style.marginTop = '-1px';
        btn.appendChild(gl);
        const lbl = document.createElement('span');
        lbl.textContent = Controllers.buttonName(idx);
        btn.appendChild(lbl);
      } else {
        btn.textContent = 'Botón ' + OPTS.gamepadMap[action.id];
      }
      
      btn.onclick = () => {
        if (isWaitingForButton) return;
        isWaitingForButton = true;
        currentActionToMap = action.id;
        gamepadWaitMsg.style.display = 'block';
        btn.textContent = '...';
        btn.style.color = 'var(--amarillo)';
      };
      
      row.appendChild(lbl);
      row.appendChild(btn);
      gamepadList.appendChild(row);
    }
  }

  function isUIOpen() {
    if (document.getElementById('backpack-panel')?.style.display !== 'none') return true;
    if (document.getElementById('codex-panel')?.style.display !== 'none') return true;
    if (document.getElementById('changelog-panel')?.style.display !== 'none') return true;
    if (document.getElementById('journal-panel')?.style.display !== 'none') return true;
    if (document.getElementById('sound-menu')?.style.display !== 'none') return true;
    if (document.getElementById('gamepad-menu')?.style.display !== 'none') return true;
    return false;
  }
  const btnSndTitle = document.getElementById('btn-sound-menu-title');
  if (btnSndTitle) btnSndTitle.onclick = abrirSndMenu;

  // v22: conjunto de teclas de movimiento PULSADAS (keydown/keyup); el vector
  // de input se calcula en cada frame del bucle — movimiento libre y suave
  const teclas = new Set();
  // pila de teclas de movimiento sostenidas SOLO para el paso offline por
  // turnos (teclado PC): si hay dos direcciones pulsadas a la vez, el
  // auto-repeat del SO dispara keydown de AMBAS de forma entrelazada y el
  // sprite/paso alternaba entre las dos sin parar; con esta pila el paso
  // repetido solo obedece a la última tecla pulsada que sigue sostenida
  // (no toca el D-pad táctil ni el mando, que no pasan por aquí)
  const heldOffline = [];
  document.addEventListener('keyup', (ev) => {
    teclas.delete(ev.code);
    const i = heldOffline.indexOf(ev.code);
    if (i !== -1) heldOffline.splice(i, 1);
  });
  window.addEventListener('blur', () => {
    teclas.clear();
    heldOffline.length = 0;
    window.joyDx = 0; window.joyDy = 0;
    if (world.online && window.Net) Net.parar();
  });

  let lastStepT = 0; // mantener pulsado = velocidad CONSTANTE (v16)
  // tiempos mínimos entre pasos offline (teclado Y joystick táctil comparten
  // lastStepT/estas constantes para no poder ir más rápido combinando ambos)
  const autoRepeatTime2DMove = 150;
  const autoRepeatTime3DYMove = 150;
  const autoRepeatTime3DXMove = 600;
  // un paso offline (por turnos): en 3ª persona W/S avanzan/retroceden y A/D
  // giran; en 2D/cámara alta es un desplazamiento de 1 casilla en pantalla.
  // La comparte el teclado (keydown) y el joystick táctil (loop, ver abajo).
  function pasoOffline(sdx, sdy, tercera) {
    if (tercera) {
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
  }
  document.addEventListener('keydown', (ev) => {
    if (!world.level || world.over) return;
    if (document.getElementById('screen-card').style.display !== 'none') return;
    // escribiendo en el chat del MMO: el juego no oye nada
    if (window.Net && Net.chatAbierto && Net.chatAbierto()) return;
    const tercera = use3D && Render3D.modo === 'tercera';
    // ---------- modo online (BACKROOMS MMO v22): movimiento LIBRE ----------
    // las teclas de movimiento solo se apuntan; el vector se calcula por frame
    if (world.online) {
      // ---------- modo espectador (v30): solo mirar, cambiar de ojo y salir ----------
      if (world.espectador) {
        if (ev.code === 'ArrowLeft' || ev.code === 'KeyA') { ev.preventDefault(); cambiarObjetivoEsp(-1); }
        else if (ev.code === 'ArrowRight' || ev.code === 'KeyD') { ev.preventDefault(); cambiarObjetivoEsp(1); }
        else if (ev.code === 'Escape') { if (!ev.repeat && window.Net) Net.espectar(null); }
        else if (ev.code === 'KeyL') world.ui.toggleLog();
        else if (ev.code === 'KeyM' || ev.code === 'KeyN') Minimap.toggleBig();
        return;
      }
      if (KEYS[ev.code]) {
        ev.preventDefault();
        teclas.add(ev.code);
      } else if (ev.code === 'KeyT' || ev.code === 'Enter') {
        ev.preventDefault();
        if (document.pointerLockElement) document.exitPointerLock();
        Net.abrirChat();
      } else if (ev.code === 'Space') {
        ev.preventDefault();
        Net.accion(); // contextual: esconderse, romper, reabrir la oferta de salida
      } else if (ev.code === 'KeyQ' || ev.code === 'KeyE') {
        if (tercera || !use3D) {
          const m = ev.code === 'KeyQ' ? 0 : 1;
          Net.usar(m);
          world.ui.pulsarMano(m);
        } else Render3D.rotar(ev.code === 'KeyQ' ? 1 : -1);
      } else if (ev.code === 'KeyF') Net.luzToggle();
      else if (/^Digit[1-6]$/.test(ev.code)) Game.useItem(parseInt(ev.code.slice(5), 10) - 1);
      else if (ev.code === 'KeyB') { if (document.pointerLockElement) document.exitPointerLock(); world.ui.toggleBackpack(); }
      else if (ev.code === 'KeyL') { if (document.pointerLockElement) document.exitPointerLock(); world.ui.toggleLog(); }
      else if (ev.code === 'KeyC') { if (document.pointerLockElement) document.exitPointerLock(); world.ui.toggleCodex(); }
      else if (ev.code === 'KeyM' || ev.code === 'KeyN') { if (document.pointerLockElement) document.exitPointerLock(); Minimap.toggleBig(); }
      else if (ev.code === 'Escape') {
        if (ev.repeat) return;
        simularEscape();
      }
      // (X=esperar no aplica online: el mundo ya no espera por nadie)
      return;
    }
    if (KEYS[ev.code]) {
      ev.preventDefault();
      if (!ev.repeat) {
        const i = heldOffline.indexOf(ev.code);
        if (i !== -1) heldOffline.splice(i, 1);
        heldOffline.push(ev.code); // la más reciente manda
      } else if (ev.code !== heldOffline[heldOffline.length - 1]) {
        return; // otra tecla pulsada después sigue sostenida: ignora este auto-repeat
      }
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
      pasoOffline(sdx, sdy, tercera);
    } else if (ev.code === 'KeyQ' || ev.code === 'KeyE') {
      // v19: Q usa la mano izquierda, E la derecha (en ?cam=alta rotan la cámara)
      if (tercera || !use3D) {
        const m = ev.code === 'KeyQ' ? 0 : 1;
        Game.usarMano(m);
        world.ui.pulsarMano(m);
      } else Render3D.rotar(ev.code === 'KeyQ' ? 1 : -1);
    } else if (ev.code === 'Space') {
      ev.preventDefault();
      Game.interact();
    } else if (ev.code === 'KeyX') Game.wait();
    else if (ev.code === 'KeyF') Game.toggleLuz();
    else if (ev.code === 'KeyB') world.ui.toggleBackpack();
    else if (ev.code === 'KeyL') world.ui.toggleLog();
    else if (ev.code === 'KeyJ') world.ui.toggleJournal();
    else if (ev.code === 'KeyC') world.ui.toggleCodex();
    else if (ev.code === 'KeyM' || ev.code === 'KeyN') Minimap.toggleBig();
    else if (ev.code === 'Escape') simularEscape();
    else if (/^Digit[1-6]$/.test(ev.code)) Game.useItem(parseInt(ev.code.slice(5), 10) - 1);
  });

  // ---------- bucle de animación (y, online, también el input continuo) ----------
  function lerp(a, b, f) { return a + (b - a) * f; }

  // castea el vector de input combinado (teclado + gamepad + joystick) a una
  // de las 8 direcciones cardinales/diagonales por ÁNGULO, no por eje: con
  // Math.sign() por separado, cualquier deriva mínima en un eje (arrastrar
  // el joystick o el stick de un mando casi nunca cae EXACTO en vertical/
  // horizontal) se redondeaba a ±1 completo en ese eje también → "adelante"
  // con un pelín de lateral acababa siendo diagonal completa y el personaje
  // miraba de lado. Además normaliza (cos/sin) en vez de sumar ±1 crudos,
  // así la diagonal no queda más rápida que un cardinal (√2).
  function snap8(x, y) {
    if (Math.hypot(x, y) < 0.15) return [0, 0];
    const paso = Math.PI / 4;
    const ang = Math.round(Math.atan2(y, x) / paso) * paso;
    const r = (v) => Math.round(v * 1000) / 1000;
    return [r(Math.cos(ang)), r(Math.sin(ang))];
  }

  // última tecla de movimiento del TECLADO que sigue sostenida (Set conserva
  // el orden de inserción: el último elemento es la más reciente que no se
  // ha soltado). El SPRITE online (PC) se guía por ella en vez del vector
  // combinado: con dos direcciones a la vez el vector mezclado caía justo en
  // el borde entre dos encuadres del sprite y parpadeaba cada frame por
  // ruido de coma flotante. El movimiento real (Net.setInput/setRot/p.rot)
  // sigue usando el vector combinado sin tocar — esto es solo visual, y no
  // afecta al mando ni al joystick táctil (no pasan por `teclas`).
  function rotaPantalla(x, y) {
    if (!(use3D && Render3D.rot)) return [x, y];
    const th = -Render3D.rot * Math.PI / 2;
    return [Math.cos(th) * x - Math.sin(th) * y, Math.sin(th) * x + Math.cos(th) * y];
  }
  function ultimaTeclaMov() {
    let last = null;
    for (const c of teclas) last = c;
    return last;
  }

  // (la velocidad de giro online vive en Fisica.GIRO_JUGADOR: cliente y
  // servidor DEBEN integrar el rumbo con la misma constante)
  let lastFrameT = 0;
  let smilerThreatEl = null;

  function smilerThreatFrame() {
    const gameScreen = document.getElementById('screen-game');
    if (world.over || !gameScreen || gameScreen.style.display === 'none' ||
        !world.level || !world.player || !world.entities?.length) {
      if (smilerThreatEl) smilerThreatEl.style.opacity = '0';
      if (window.Sfx?.updateEntityLoops) Sfx.updateEntityLoops();
      return;
    }
    let best = null, bestD = Infinity;
    for (const e of world.entities) {
      if (!e.viva || e.def?.glyph !== 'smiler') continue;
      const ex = e.rx ?? e.x, ey = e.ry ?? e.y;
      const px = world.player.rx ?? world.player.x, py = world.player.ry ?? world.player.y;
      const d = Math.hypot((ex + 0.5) - (px + 0.5), (ey + 0.5) - (py + 0.5));
      if (d >= 8 || d >= bestD) continue;
      if (window.FOV && !FOV.los(world.map.grid,
        Math.round(e.x), Math.round(e.y),
        Math.round(world.player.x), Math.round(world.player.y))) continue;
      best = e;
      bestD = d;
    }
    if (!best) {
      if (smilerThreatEl) smilerThreatEl.style.opacity = '0';
      if (window.Sfx?.updateEntityLoops) Sfx.updateEntityLoops();
      return;
    }
    if (!smilerThreatEl) {
      smilerThreatEl = document.createElement('img');
      smilerThreatEl.id = 'smiler-threat';
      smilerThreatEl.src = 'assets/sprites/smiler.png?v=preview';
      smilerThreatEl.alt = 'Smiler';
      document.body.appendChild(smilerThreatEl);
    }
    const k = Math.max(0, Math.min(1, (8 - bestD) / 7));
    const escala = 0.45 + k * k * 7.5;
    smilerThreatEl.style.opacity = String(Math.max(0, Math.min(0.92, k * 1.15)));
    smilerThreatEl.style.transform = `translate(-50%, -50%) scale(${escala})`;
    if (window.Sfx?.entityLoop) Sfx.entityLoop('smiler', bestD, 8);
  }

  
  let vCursor = null;
  let cursorX = window.innerWidth / 2;
  let cursorY = window.innerHeight / 2;
  let aButtonDown = false;
  let dragTarget = null;
  
  let usingGamepad = false;
  let wasUIOpen = false;
  const hideGamepadCursor = () => { 
    usingGamepad = false; 
    if (window.Controllers) Controllers.setDevice('keyboard');
    if (vCursor) vCursor.style.display = 'none'; 
    const st = document.getElementById('no-cursor-style');
    if (st) st.remove();
  };
  document.addEventListener('mousemove', hideGamepadCursor);
  document.addEventListener('mousedown', hideGamepadCursor);
  document.addEventListener('wheel', hideGamepadCursor);
  // v28 — cualquier tecla cuenta como entrada de teclado/ratón
  window.addEventListener('keydown', () => { if (window.Controllers) Controllers.setDevice('keyboard'); });
  // si se desconecta el mando, volvemos a teclado/ratón
  window.addEventListener('gamepaddisconnected', () => { if (window.Controllers) Controllers.clearGamepad(); });

  window.gamepadDx = 0;
  window.gamepadDy = 0;
  let lastGamepadStepT = 0;
  const lastGamepadState = {};

  function pollGamepad(t) {
    window.gamepadDx = 0;
    window.gamepadDy = 0;

    if (!navigator.getGamepads) return;
    const gamepads = navigator.getGamepads();
    const gp = gamepads[0] || gamepads[1] || gamepads[2] || gamepads[3];
    if (!gp) return;

    const btns = gp.buttons;
    const pressed = (i) => btns[i] && btns[i].pressed;
    const justPressed = (i) => pressed(i) && !lastGamepadState[i];

    const uiOpen = isUIOpen();

    if (isWaitingForButton) {
      for (let i = 0; i < btns.length; i++) {
        if (justPressed(i)) {
          OPTS.gamepadMap[currentActionToMap] = i;
          isWaitingForButton = false;
          if (gamepadWaitMsg) gamepadWaitMsg.style.display = 'none';
          guardarOpciones();
          renderGamepadList();
          break;
        }
      }
      for (let i = 0; i < btns.length; i++) lastGamepadState[i] = pressed(i);
      return;
    }

    let dx = 0, dy = 0;
    if (pressed(14) || gp.axes[0] < -0.4) dx = -1;
    if (pressed(15) || gp.axes[0] > 0.4) dx = 1;
    if (pressed(12) || gp.axes[1] < -0.4) dy = -1;
    if (pressed(13) || gp.axes[1] > 0.4) dy = 1;

    if (uiOpen) {
      if (Math.abs(gp.axes[0]) > 0.1) dx = gp.axes[0];
      if (Math.abs(gp.axes[1]) > 0.1) dy = gp.axes[1];
    } else {
      // In game mode, use analog precision for movement vector (if supported)
      if (Math.abs(gp.axes[0]) > 0.1) dx = gp.axes[0];
      if (Math.abs(gp.axes[1]) > 0.1) dy = gp.axes[1];
      window.gamepadDx = dx;
      window.gamepadDy = dy;
    }

    let anyInput = false;
    for(let i=0; i<btns.length; i++) if (pressed(i)) anyInput = true;
    if (anyInput || Math.abs(gp.axes[0]) > 0.1 || Math.abs(gp.axes[1]) > 0.1) {
      if (!usingGamepad) {
        let st = document.getElementById('no-cursor-style');
        if (!st) {
          st = document.createElement('style');
          st.id = 'no-cursor-style';
          st.textContent = '* { cursor: none !important; }';
          document.head.appendChild(st);
        }
      }
      usingGamepad = true;
      if (window.Controllers) Controllers.setGamepad(gp);
    }

    if (uiOpen && !wasUIOpen) {
      cursorX = window.innerWidth / 2;
      cursorY = window.innerHeight / 2;
    }
    wasUIOpen = uiOpen;

    if (uiOpen) {
      if (!vCursor) {
        vCursor = document.getElementById('virtual-cursor');
        if (!vCursor) {
          vCursor = document.createElement('div');
          vCursor.id = 'virtual-cursor';
          document.body.appendChild(vCursor);
        }
      }
      
      if (usingGamepad) {
        if (vCursor.style.display !== 'block') {
          vCursor.style.display = 'block';
        }
      } else {
        if (vCursor.style.display === 'block') vCursor.style.display = 'none';
      }
      
      if (dx !== 0 || dy !== 0) {
        cursorX += dx * OPTS.cursorSpeed;
        cursorY += dy * OPTS.cursorSpeed;
        cursorX = Math.max(0, Math.min(window.innerWidth, cursorX));
        cursorY = Math.max(0, Math.min(window.innerHeight, cursorY));
        vCursor.style.left = cursorX + 'px';
        vCursor.style.top = cursorY + 'px';
      }

      const target = document.elementFromPoint(cursorX, cursorY);
      const aBtnIdx = OPTS.gamepadMap.interact;
      const bBtnIdx = OPTS.gamepadMap.menu;
      const bpBtnIdx = OPTS.gamepadMap.backpack;
      
      if (justPressed(aBtnIdx)) {
        aButtonDown = true;
        vCursor.classList.add('vc-active');
        if (target) {
          target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: cursorX, clientY: cursorY }));
          dragTarget = target;
        }
      } else if (pressed(aBtnIdx) && (dx !== 0 || dy !== 0) && aButtonDown) {
        if (target) {
          target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: cursorX, clientY: cursorY }));
        }
      } else if (!pressed(aBtnIdx) && aButtonDown) {
        aButtonDown = false;
        vCursor.classList.remove('vc-active');
        if (target) {
          target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: cursorX, clientY: cursorY }));
          if (dragTarget === target) {
            target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: cursorX, clientY: cursorY }));
          }
        }
        dragTarget = null;
      }

      if (justPressed(bBtnIdx) || justPressed(bpBtnIdx)) {
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
      }
    } else {
      if (vCursor && vCursor.style.display === 'block') {
        vCursor.style.display = 'none';
        if (aButtonDown) {
           aButtonDown = false;
           vCursor.classList.remove('vc-active');
           if (dragTarget) dragTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: cursorX, clientY: cursorY }));
           dragTarget = null;
        }
      }

      if (!world.level || world.over || world.busy) {
        for(let i=0; i<btns.length; i++) lastGamepadState[i] = pressed(i);
        return;
      }

      const third = use3D && window.Render3D && Render3D.modo === 'tercera';

      if (!world.online) {
        // Offline step movement
        if (dx !== 0 || dy !== 0) {
          if (t - lastGamepadStepT >= 150) {
            lastGamepadStepT = t;
            if (third) {
              if (dy < -0.5) Game.avanzar(1);
              else if (dy > 0.5) Game.avanzar(-1);
              else Game.girar(dx > 0 ? 1 : (dx < 0 ? -1 : 0));
            } else {
              let ndx = dx > 0.5 ? 1 : (dx < -0.5 ? -1 : 0);
              let ndy = dy > 0.5 ? 1 : (dy < -0.5 ? -1 : 0);
              if (use3D && window.Render3D && Render3D.rot) {
                const th = -Render3D.rot * Math.PI / 2;
                const rx = Math.round(Math.cos(th) * ndx - Math.sin(th) * ndy);
                const ry = Math.round(Math.sin(th) * ndx + Math.cos(th) * ndy);
                ndx = rx; ndy = ry;
              }
              Game.tryMove(ndx, ndy);
            }
          }
        }
      }

      // Actions
      if (justPressed(OPTS.gamepadMap.interact)) {
        if (world.online && window.Net) Net.accion();
        else Game.interact();
      }
      if (justPressed(OPTS.gamepadMap.wait)) {
        if (!world.online) Game.wait();
      }
      if (justPressed(OPTS.gamepadMap.light)) {
        if (world.online && window.Net) Net.luzToggle();
        else Game.toggleLuz();
      }
      if (justPressed(OPTS.gamepadMap.handL)) {
        if (third || !use3D) {
          if (world.online && window.Net) Net.usar(0);
          else Game.usarMano(0);
          world.ui.pulsarMano(0);
        } else {
          Render3D.rotar(1);
        }
      }
      if (justPressed(OPTS.gamepadMap.handR)) {
        if (third || !use3D) {
          if (world.online && window.Net) Net.usar(1);
          else Game.usarMano(1);
          world.ui.pulsarMano(1);
        } else {
          Render3D.rotar(-1);
        }
      }
      if (justPressed(OPTS.gamepadMap.backpack)) world.ui.toggleBackpack();
      if (justPressed(OPTS.gamepadMap.map)) Minimap.toggleBig();
      if (justPressed(OPTS.gamepadMap.log)) world.ui.toggleLog();
      if (justPressed(OPTS.gamepadMap.journal)) world.ui.toggleJournal();
      if (justPressed(OPTS.gamepadMap.codex)) world.ui.toggleCodex();
      if (justPressed(OPTS.gamepadMap.chat)) {
        if (world.online && window.Net) Net.abrirChat();
      }
      if (justPressed(OPTS.gamepadMap.menu)) document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    }

    for(let i=0; i<btns.length; i++) lastGamepadState[i] = pressed(i);
  }
  let lastRenderT = 0;
  function loop(t) {
    if (window.contarFrameFps) contarFrameFps(t);
    pollGamepad(t);
    
    // Limitación de FPS
    const maxFps = (window.OPTS && window.OPTS.fpsMax) || 'vsync';
    if (maxFps !== 'vsync') {
      const targetFps = parseInt(maxFps, 10);
      const fpsInterval = 1000 / targetFps;
      const elapsed = t - lastRenderT;
      if (elapsed < fpsInterval - 1) {
        requestAnimationFrame(loop);
        return;
      }
      lastRenderT = t - (elapsed % fpsInterval);
    } else {
      lastRenderT = t;
    }

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
    p.inputX = 0;
    p.inputY = 0;

    // Interpola a los jugadores remotos ANTES de que el espectador copie la
    // posición de su objetivo y antes de dibujar sus sprites. Antes ocurría al
    // final del overlay, de modo que cámara y actores usaban una muestra vieja.
    if (world.online && window.Otros) Otros.frame(t);

    // ---------- v22: vector de movimiento por frame (movimiento libre) ----------
    if (world.online && world.espectador && window.Net && Net.activo) {
      // modo espectador (v30): sin input — Net.frame pega la cámara al objetivo
      Net.frame(dtNet);
    } else if (world.online && window.Net && Net.activo &&
        !(Net.chatAbierto && Net.chatAbierto()) &&
        document.getElementById('screen-card').style.display === 'none') {
      // suma de las teclas pulsadas en coordenadas de PANTALLA
      let sx = (window.gamepadDx || 0) + (window.joyDx || 0);
      let sy = (window.gamepadDy || 0) + (window.joyDy || 0);
      for (const code of teclas) {
        const v = KEYS[code];
        if (v) { sx += v[0]; sy += v[1]; }
      }
      [sx, sy] = snap8(sx, sy);
      p.inputX = sx;
      p.inputY = sy;
      const tercera = use3D && Render3D.modo === 'tercera';
      const lastCode = ultimaTeclaMov();
      if (tercera) {
        // v25 — estilo Roblox: WASD mueve RELATIVO A LA CÁMARA (adelante/
        // atrás/izquierda/derecha); la cámara solo la mueve el ratón.
        const yaw = Render3D.yaw;
        const Lx = -Math.sin(yaw), Lz = -Math.cos(yaw);  // «adelante» de la cámara
        const Rx = Math.cos(yaw), Rz = -Math.sin(yaw);   // «derecha» de la cámara
        const dx = Lx * -sy + Rx * sx;
        const dy = Lz * -sy + Rz * sx;
        Net.setInput(dx, dy);
        if (dx || dy) p.rot = Math.atan2(dx, -dy); // rumbo real (movimiento/ataques): vector combinado
        // sprite: solo la última tecla sostenida (sin teclado —mando/joystick—, el vector real)
        const kv = lastCode ? KEYS[lastCode] : [sx, sy];
        const kdx = Lx * -kv[1] + Rx * kv[0];
        const kdy = Lz * -kv[1] + Rz * kv[0];
        if (kdx || kdy) p.rotSprite = Math.atan2(kdx, -kdy);
      } else {
        // 2D / cámara alta: 8 direcciones relativas a la pantalla
        const [dx, dy] = rotaPantalla(sx, sy);
        Net.setInput(dx, dy);
        if (dx || dy) Net.setRot(Math.atan2(dx, -dy)); // rumbo real: vector combinado
        // sprite: solo la última tecla sostenida
        const kv = lastCode ? KEYS[lastCode] : [sx, sy];
        const [sdx, sdy] = rotaPantalla(kv[0], kv[1]);
        if (sdx || sdy) {
          if (Math.abs(sdy) >= Math.abs(sdx)) p.dir = sdy > 0 ? 'down' : 'up';
          else { p.dir = 'side'; p.flip = sdx < 0; }
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
      smilerThreatFrame();
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
  if ((params.get('autostart') || params.get('selftest') || params.get('online') || params.get('local')) && !Game.Profiles.activeName())
    Game.Profiles.create(params.get('nombre') || 'Errante');
  // ---------- BACKROOMS MMO: ?online=1 conecta al mundo compartido ----------
  // ?local=1 = MISMO juego con el servidor local de la pestaña (modo offline)
  if (params.get('online') || params.get('local')) {
    if (params.get('local')) window.MODO_LOCAL = true;
    cargarOverridesDeJuego();
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
    cargarOverridesDeJuego();
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

  // ---------- autoprueba del modo LOCAL/ONLINE: ?local=1&selftest=300 ----------
  // bot de movimiento LIBRE: camina hacia la salida más cercana con Net.setInput,
  // entra a las tarjetas y responde las ofertas de cruce (70% CRUZAR)
  if (params.get('selftest') && (params.get('local') || params.get('online'))) {
    const errores = [];
    window.onerror = (msg, src, line) => { errores.push(`${msg} @${(src || '').split('/').pop()}:${line}`); };
    const N = parseInt(params.get('selftest'), 10) || 300;
    let ticks = 0;
    const visitados = new Set();
    let rumbo = null; // { nivel, dist } — dmap BFS hacia la salida elegida
    let huyeHasta = -1;      // hasta este tick: vagar lejos (anti-atasco)
    let huidaDir = null;
    let ultimaPos = '', quieto = 0;
    const iv2 = setInterval(() => {
      try {
        if (!Net.activo || !world.level || !world.map) return;
        visitados.add(world.level.id);
        if (ticks >= N) {
          clearInterval(iv2);
          window.joyDx = 0; window.joyDy = 0;
          Net.parar();
          const div = document.createElement('div');
          div.id = 'selftest-result';
          div.textContent = JSON.stringify({
            ticks,
            nivel: world.level?.id,
            visitados: [...visitados],
            posicion: [world.player?.x, world.player?.y],
            mapa: world.map ? [world.map.grid.w, world.map.grid.h] : null,
            salud: world.player?.salud,
            sed: world.player?.sed,
            cordura: world.player?.cordura,
            inv: world.player?.inv,
            entidadesVivas: world.entities.filter((e) => e.viva).length,
            errores,
            erroresRender: window.__renderErrors || [],
            // verdad del lado sala (solo en modo local): barras y rechazos
            local: window.MODO_LOCAL && window.Local && Local.jugador ? {
              sed: Local.jugador.sed, salud: Local.jugador.salud,
              cordura: Local.jugador.cordura,
              posSala: [Math.round(Local.jugador.x * 10) / 10, Math.round(Local.jugador.y * 10) / 10],
              caminado: Math.round(Local.jugador._sedAcum || 0),
              rechazos: Local.jugador.rechazos, stats: Local.stats,
            } : null,
          });
          document.body.appendChild(div);
          document.title = errores.length ? 'SELFTEST-ERRORES' : 'SELFTEST-OK';
          return;
        }
        ticks++;
        // tarjeta de nivel a la vista: entrar
        const card = document.getElementById('screen-card');
        if (card.style.display !== 'none') { document.getElementById('btn-enter').click(); return; }
        // oferta de salida (showChoice): CRUZAR al 70%; tras un «Aún no» hay
        // que ALEJARSE — si no, el bot se queda empujando la puerta: sin
        // desplazamiento no hay informes de posición ni re-oferta (atasco)
        const choice = document.getElementById('choice-modal');
        if (choice && choice.style.display !== 'none') {
          const btns = document.querySelectorAll('#choice-btns button');
          if (btns.length) {
            const cruza = Math.random() < 0.7;
            (cruza ? btns[0] : btns[btns.length - 1]).click();
            if (!cruza) huyeHasta = ticks + 25;
          }
          return;
        }
        // anti-atasco: ~2 s sin desplazarse (empujando pared/puerta) → vagar
        const posK = Math.round(world.player.x * 4) + ',' + Math.round(world.player.y * 4);
        if (posK === ultimaPos) {
          if (++quieto > 20 && huyeHasta < ticks) { huyeHasta = ticks + 15; quieto = 0; }
        } else { quieto = 0; ultimaPos = posK; }
        // rumbo: dmap BFS desde la salida más cercana (cache por nivel)
        const g = world.map.grid;
        const px = Math.round(world.player.x), py = Math.round(world.player.y);
        if ((!rumbo || rumbo.nivel !== world.level.id) && world.map.exits.length) {
          let best = null, bestD = Infinity;
          for (const ex of world.map.exits) {
            const dist = MapGen.bfsDist(g, ex.x, ex.y);
            const v = dist[py * g.w + px];
            if (v >= 0 && v < bestD) { bestD = v; best = dist; }
          }
          if (best) rumbo = { nivel: world.level.id, dist: best };
        }
        let dx = 0, dy = 0;
        if (ticks < huyeHasta) {
          if (!huidaDir || Math.random() < 0.1) {
            const a = Math.random() * Math.PI * 2;
            huidaDir = [Math.cos(a), Math.sin(a)];
          }
          dx = huidaDir[0]; dy = huidaDir[1];
        } else if (rumbo && rumbo.nivel === world.level.id && Math.random() < 0.85) {
          const actual = rumbo.dist[py * g.w + px];
          for (const [mx, my] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const nx = px + mx, ny = py + my;
            if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
            const v = rumbo.dist[ny * g.w + nx];
            if (v >= 0 && (actual < 0 || v < actual)) { dx = mx; dy = my; break; }
          }
        }
        if (!dx && !dy) {
          const a = Math.random() * Math.PI * 2;
          dx = Math.cos(a); dy = Math.sin(a);
        }
        // el bot «mueve el joystick táctil»: el bucle de frames suma joyDx/
        // joyDy al vector de input (llamar a Net.setInput directamente no
        // sirve — el bucle lo recalcula y pisa en cada frame)
        const n = Math.hypot(dx, dy) || 1;
        window.joyDx = dx / n;
        window.joyDy = dy / n;
      } catch (e) {
        errores.push(String(e && e.message || e));
        ticks++;
      }
    }, 100);
  }

  // ---------- autoprueba clásica (modo por turnos): ?selftest=200 ----------
  if (params.get('selftest') && !params.get('local') && !params.get('online')) {
    const errores = [];
    window.onerror = (msg, src, line) => { errores.push(`${msg} @${(src || '').split('/').pop()}:${line}`); };
    const N = parseInt(params.get('selftest'), 10) || 100;
    cargarOverridesDeJuego();
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
  let esperaConexion = null;

  function salaPrivadaTitulo() {
    return ($id('room-input')?.value || '').trim();
  }

  function validarSalaPrivada(salaPrivada) {
    if (!salaPrivada || /^[a-z0-9_-]{3,32}$/i.test(salaPrivada)) return true;
    const errNet = $id('title-net');
    errNet.textContent = 'Código de sala privada inválido. Usa 3-32 letras, números, _ o -.';
    errNet.style.display = 'block';
    $id('room-input')?.focus();
    return false;
  }

  // ---------- caída hacia las Backrooms (v30.14, idea del PR #81) ----------
  // Tapa la conexión con líneas radiales que nacen del punto de fuga; se
  // desvanece al estar DENTRO (con un mínimo para que no parpadee) o al
  // instante si la conexión falla (el error debe verse en la portada).
  const fallScreen = document.getElementById('fall-screen');
  const REDUCE_CAIDA = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let fallDesde = 0;
  function mostrarCaida() {
    if (!fallScreen || REDUCE_CAIDA) return;
    const lines = document.getElementById('fall-lines');
    if (lines && !lines.childElementCount) {
      const N = 64;
      for (let i = 0; i < N; i++) {
        // rayo = contenedor rotado al ángulo; dentro, el trazo <i> se aleja.
        // Separar rotate (padre) de translateY (hijo) evita que el keyframe
        // pise la dirección de cada línea.
        const ray = document.createElement('span');
        ray.className = 'ray';
        const ang = (i / N) * Math.PI * 2 + Math.random() * 0.2;
        ray.style.setProperty('--ang', ang.toFixed(3) + 'rad');
        const trazo = document.createElement('i');
        // retardo negativo repartido: que no latan todas a la vez
        trazo.style.animationDelay = (-Math.random() * 1.1).toFixed(2) + 's';
        trazo.style.opacity = (0.4 + Math.random() * 0.6).toFixed(2);
        ray.appendChild(trazo);
        lines.appendChild(ray);
      }
    }
    fallDesde = Date.now();
    fallScreen.hidden = false;
    void fallScreen.offsetWidth; // fuerza reflujo: la transición de opacidad arranca
    fallScreen.classList.add('activa');
    if (window.Sfx) { try { Sfx.play('caida'); } catch (e) {} }
  }
  function ocultarCaida(inmediato) {
    if (!fallScreen || fallScreen.hidden) return;
    const espera = inmediato ? 0 : Math.max(0, 2600 - (Date.now() - fallDesde));
    setTimeout(() => {
      fallScreen.classList.remove('activa');
      fallScreen.classList.add('saliendo');
      setTimeout(() => { fallScreen.hidden = true; fallScreen.classList.remove('saliendo'); }, 400);
    }, espera);
  }

  function conectarAlServidor(btnOrigen) {
    cargarOverridesDeJuego(); // los assets del juego se piden AL entrar, no en la portada
    if (!P.activeName()) P.create($id('profile-name').value.trim() || 'Errante');
    refreshTitle();
    // DESPUÉS de refreshTitle: esta llama a playMenuMusic() al final (para
    // los demás usos legítimos, como cambiar de perfil), y como la pantalla
    // de título sigue visible durante "CRUZANDO LA REALIDAD…" eso reactivaba
    // la música justo después de pararla — aquí queda la última palabra.
    if (window.Sfx) Sfx.stopMenu();
    const salaPrivada = salaPrivadaTitulo();
    if (!validarSalaPrivada(salaPrivada)) return;
    const btnStart = $id('btn-start');
    const btnContinue = $id('btn-continue');
    const btnOffline = $id('btn-offline');
    const btn = btnOrigen || btnStart;
    const errNet = $id('title-net');
    // los botones de modo llevan <span> dentro (v30.14): se guarda el HTML
    // del botón pulsado para restaurarlo tal cual tras conectar o fallar
    const htmlBtn = btn.innerHTML;
    const textoContinue = btnContinue.textContent;
    btnStart.disabled = true;
    btnContinue.disabled = true;
    btnOffline.disabled = true;
    btn.textContent = 'CRUZANDO LA REALIDAD…';
    errNet.style.display = 'none';
    mostrarCaida();
    if (esperaConexion) clearInterval(esperaConexion);
    Net.iniciar(P.activeName(), salaPrivada || undefined);
    const t0 = Date.now();
    const restaurar = () => {
      btnStart.disabled = false;
      btnContinue.disabled = false;
      btnOffline.disabled = false;
      btnContinue.textContent = textoContinue;
      btn.innerHTML = htmlBtn; // el último: cubre también btn === btnContinue
    };
    esperaConexion = setInterval(() => {
      if (Net.activo) {
        clearInterval(esperaConexion);
        esperaConexion = null;
        restaurar();
        errNet.style.display = 'none';
        ocultarCaida(false);
      } else if (Net.ultimoError || Date.now() - t0 > 10000) {
        clearInterval(esperaConexion);
        esperaConexion = null;
        restaurar();
        ocultarCaida(true);
        errNet.textContent = Net.ultimoError ||
          'No se pudo conectar con las Backrooms. ¿El servidor está despierto?';
        errNet.style.display = 'block';
      }
    }, 200);
  }

  const CANCIONES_MENU = [
    { id: 'menu1', titulo: 'Menú Tema 1', autor: '@cris_fon', archivo: 'assets/sounds/Menu/menu1.mp3' },
    { id: 'thehub', titulo: 'The Hub (Ambiente)', autor: 'Banda Sonora', archivo: 'assets/sounds/niveles/the-hub.mp3' },
    { id: 'ninguna', titulo: 'Ninguna (Silencio)', autor: '—', archivo: null }
  ];

  function playMenuMusic() {
    if (document.getElementById('screen-title').style.display === 'none') return;
    // con la conexión en curso («CRUZANDO LA REALIDAD…») el título sigue
    // visible, pero arrancar música aquí la dejaría sonando dentro de la
    // partida: es el caso del PRIMER clic de la sesión directo en DESPERTAR —
    // el listener {once:true} de desbloqueo de audio burbujea DESPUÉS del
    // onclick del botón (y de su stopMenu) y reactivaba la pista (v30.1)
    if (document.getElementById('btn-start').disabled) return;
    let trackId = OPTS.menuMusica || 'menu1';
    const track = CANCIONES_MENU.find(t => t.id === trackId) || CANCIONES_MENU[0];
    if (track && track.archivo && window.Sfx) {
      Sfx.playMenu(track.archivo);
    } else if (window.Sfx) {
      Sfx.stopMenu();
    }
  }

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
      btn.textContent = `Continuar en servidor (${saveData.levelId})`;
      btn.onclick = () => conectarAlServidor(btn);
    } else btn.style.display = 'none';

    playMenuMusic();
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
  $id('btn-codex').onclick = () => world.ui.toggleCodex(true);
  $id('btn-changelog').onclick = () => {
    if (window.Changelog) Changelog.marcarVisto();
    world.ui.toggleChangelog(true);
  };

  // ---------- Selector de Música de Menú ----------
  const btnMusicMenu = $id('btn-music-menu');
  const panelMusic = $id('music-menu');
  const btnMusicClose = $id('btn-music-close');
  const listMusic = $id('music-list');

  if (btnMusicMenu) {
    btnMusicMenu.onclick = () => {
      listMusic.innerHTML = '';
      const currentTrack = OPTS.menuMusica || 'menu1';

      CANCIONES_MENU.forEach(track => {
        const item = document.createElement('div');
        item.className = 'music-item' + (track.id === currentTrack ? ' active' : '');
        
        const info = document.createElement('div');
        info.className = 'music-info';
        
        const title = document.createElement('div');
        title.className = 'music-title';
        title.textContent = track.titulo;
        
        const author = document.createElement('div');
        author.className = 'music-author';
        author.textContent = 'por ' + track.autor;
        
        info.appendChild(title);
        info.appendChild(author);
        
        const status = document.createElement('div');
        status.className = 'music-status';
        if (track.id === currentTrack) {
          status.textContent = '🔊 SONANDO';
        }
        
        item.appendChild(info);
        item.appendChild(status);
        
        item.onclick = () => {
          OPTS.menuMusica = track.id;
          try { localStorage.setItem('backrooms-opts', JSON.stringify(OPTS)); } catch (e) {}
          playMenuMusic();
          btnMusicMenu.click(); // refrescar
        };
        
        listMusic.appendChild(item);
      });
      
      panelMusic.style.display = 'flex';
    };
  }

  if (btnMusicClose) {
    btnMusicClose.onclick = () => {
      panelMusic.style.display = 'none';
    };
  }

  $id('btn-start').onclick = () => {
    conectarAlServidor($id('btn-start'));
  };
  // modo offline (partida en solitario, sin servidor): el MISMO juego online
  // con el servidor LOCAL de la pestaña (net/local.js) — mismas reglas,
  // mismo movimiento libre, misma cámara. El modo por turnos clásico queda
  // aparcado tras ?autostart=1 (referencia y selftest).
  $id('btn-offline').onclick = () => {
    window.MODO_LOCAL = true;
    conectarAlServidor($id('btn-offline'));
  };
  $id('btn-again').onclick = () => {
    refreshTitle();
    world.ui.show('title');
  };
  $id('btn-journal-close').onclick = () => world.ui.toggleJournal();
  $id('btn-end-codex').onclick = () => world.ui.toggleCodex(true);
  $id('btn-end-title').onclick = () => { world.ui.show('title'); refreshTitle(); };

  // ---------- controles táctiles ----------
  {
    const capaTactil = document.getElementById('touch-controls');
    const wrap = document.getElementById('game-wrap');
    for (const el of [capaTactil, wrap]) {
      if (!el) continue;
      for (const evName of ['contextmenu', 'selectstart', 'dragstart']) {
        el.addEventListener(evName, (ev) => {
          if (evName === 'dragstart' && ev.target.closest('#backpack-panel, .mano-slot, .eq-slot, .inv-slot')) {
            return;
          }
          ev.preventDefault();
        });
      }
    }
    // online = joystick (movimiento libre, el vector continuo encaja bien);
    // offline por turnos = D-pad (cada toque es un paso/giro YA, sin la
    // espera del auto-repeat, que se sentía poco fluido al girar sostenido).
    // El flujo NORMAL (botón Start del título) siempre conecta al servidor
    // (Net.iniciar en conectarAlServidor) — offline SOLO existe vía
    // ?autostart=1, que es la única señal fiable en el momento de montar
    // estos controles (world.online aún no se sabe: se fija async al
    // recibir 'bienvenida' del servidor, después de que esto se ejecuta).
    if (capaTactil && params.get('autostart')) capaTactil.classList.add('modo-dpad');
  }
  // ---------- D-pad táctil (offline por turnos) ----------
  document.querySelectorAll('#touch-dpad [data-dir]').forEach((btn) => {
    const dir = btn.dataset.dir;
    const [sdx, sdy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    btn.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      if (!world.level || world.over) return;
      if (document.getElementById('screen-card').style.display !== 'none') return;
      Sfx.unlock();
      const tercera = use3D && Render3D.modo === 'tercera';
      pasoOffline(sdx, sdy, tercera);
      lastStepT = performance.now(); // que el auto-repeat del teclado no vaya el doble de rápido justo después
    }, { passive: false });
  });
  const touch = {
    act: () => world.online ? Net.accion() : Game.interact(),
    q: () => { world.online ? Net.usar(0) : Game.usarMano(0); world.ui.pulsarMano(0); },
    e: () => { world.online ? Net.usar(1) : Game.usarMano(1); world.ui.pulsarMano(1); },
    bag: () => world.ui.toggleBackpack(),
    map: () => Minimap.toggleBig(),
  };
  document.querySelectorAll('[data-touch]').forEach((btn) => {
    const k = btn.dataset.touch;
    btn.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      Sfx.unlock();
      touch[k]?.();
    }, { passive: false });
  });

  // ---------- joystick táctil de movimiento ----------
  // online: alimenta window.joyDx/joyDy (analógico, se suma al vector de
  // input del bucle igual que el gamepad, ver loop()); offline (por turnos):
  // un paso discreto por eje dominante, mismo ritmo que el auto-repeat de
  // teclado (también en loop(), pasoOffline() comparte lógica con keydown).
  window.joyDx = 0;
  window.joyDy = 0;
  {
    const baseEl = document.querySelector('#touch-joystick .joy-base');
    const stickEl = document.querySelector('#touch-joystick .joy-stick');
    let joyPointerId = null;
    const mover = (ev) => {
      const r = baseEl.getBoundingClientRect();
      const max = r.width / 2;
      let dx = ev.clientX - (r.left + max), dy = ev.clientY - (r.top + max);
      const dist = Math.hypot(dx, dy);
      if (dist > max) { dx = dx / dist * max; dy = dy / dist * max; }
      window.joyDx = dx / max;
      window.joyDy = dy / max;
      if (stickEl) stickEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };
    const soltar = (ev) => {
      if (ev.pointerId !== joyPointerId) return;
      joyPointerId = null;
      window.joyDx = 0; window.joyDy = 0;
      if (stickEl) stickEl.style.transform = 'translate(-50%, -50%)';
      if (baseEl) baseEl.classList.remove('activo');
      if (world.online && window.Net) Net.parar();
    };
    if (baseEl) {
      baseEl.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        Sfx.unlock();
        joyPointerId = ev.pointerId;
        try { baseEl.setPointerCapture(joyPointerId); } catch (e) {}
        baseEl.classList.add('activo');
        mover(ev);
      }, { passive: false });
      baseEl.addEventListener('pointermove', (ev) => {
        if (ev.pointerId !== joyPointerId) return;
        ev.preventDefault();
        mover(ev);
      }, { passive: false });
      baseEl.addEventListener('pointerup', soltar);
      baseEl.addEventListener('pointercancel', soltar);
    }
  }
  refreshTitle();
})();
