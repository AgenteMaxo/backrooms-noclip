// Arranque: input, bucle de animación y pantalla de título.
(function () {
  // versión visible del juego (Ajustes); súbela con cada tanda de cambios
  window.VERSION_JUEGO = 'v30.14';
  const world = Game.world;
  const OPTS = window.Options.valores;
  const guardarOpciones = window.Options.guardar;
  const input = window.InputState;
  let gamepadSettings;
  world.data = window.GAME_DATA;

  // Presentación de v30.14: se cierra sola o con el primer gesto.
  (function iniciarSplash() {
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
    requestAnimationFrame(() => splash.classList.add('mostrar'));
    setTimeout(cerrarSplash, reduce ? 600 : 3200);
    window.addEventListener('pointerdown', cerrarSplash, { once: true });
    window.addEventListener('keydown', cerrarSplash, { once: true });
  })();

  window.addEventListener('levelassetsready', (event) => {
    const levelId = event.detail?.levelId;
    if (!levelId || world.level?.id !== levelId) return;
    window.Render3D?.invalidateTextures();
    world.mapaVersion = (world.mapaVersion || 0) + 1;
  });

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
  // El chunk 3D se carga BAJO DEMANDA (Cargador), así que use3D no puede
  // depender de que window.Render3D exista ya: se decide sondeando WebGL con un
  // canvas de usar y tirar, sin Three.js de por medio.
  const CHUNK_3D = [
    'js/lib/three.min.js',
    'js/lib/shaders/CopyShader.js',
    'js/lib/shaders/LuminosityHighPassShader.js',
    'js/lib/shaders/GammaCorrectionShader.js',
    'js/lib/postprocessing/EffectComposer.js',
    'js/lib/postprocessing/RenderPass.js',
    'js/lib/postprocessing/ShaderPass.js',
    'js/lib/postprocessing/UnrealBloomPass.js',
    'js/engine/atmos3d.js',
    'js/engine/render3d-painters.js',
    'js/engine/render3d.js',
  ];
  const paramsPre = new URLSearchParams(location.search);
  const glCanvas = document.getElementById('gl-canvas');
  function hayWebGL() {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) { return false; }
  }
  let use3D = paramsPre.get('render') !== '2d' && hayWebGL();
  // Hasta que el chunk EJECUTA, window.Render3D no existe: todo acceso al 3D
  // está tras `use3D && window.Render3D` y el bucle salta el frame. No hay que
  // esperar a nadie — como mucho se pierden los primeros frames, tapados por la
  // tarjeta del nivel.
  let carga3D = null;
  function cargar3D() {
    if (!use3D) return Promise.resolve(false);
    if (carga3D) return carga3D;
    const cargarChunk = () => window.Cargador.scripts(CHUNK_3D);
    carga3D = cargarChunk().catch((error) => {
      console.warn('Primer intento de carga 3D fallido; reintentando', error);
      return cargarChunk();
    }).then(() => {
      Render3D.init(glCanvas, canvas);
      // DisplaySettings ya ajustó el overlay mientras el chunk aún no
      // existía. Sin este resize el WebGL conservaba 960×600 dentro de una
      // interfaz 16:9 y quedaba estirado/desalineado.
      Render3D.resize(canvas.width, canvas.height);
      glCanvas.style.display = 'block';
      document.getElementById('game-wrap').classList.add('modo3d');
      return true;
    }).catch((err) => {
      console.warn('3D no disponible; usando render 2D', err);
      use3D = false;
      glCanvas.style.display = 'none';
      return false;
    });
    return carga3D;
  }
  const displaySettings = window.DisplaySettings.init({ canvas, use3D: () => use3D });

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
    // solo los SFX genéricos: los de entidad los trae cada nivel según su ficha
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
  document.addEventListener('keydown', () => { Sfx.unlock(); titleController.playMusic(); }, { once: true });
  document.addEventListener('click', () => { Sfx.unlock(); titleController.playMusic(); }, { once: true });

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
    if (gamepadSettings?.isOpen() && ev.code === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      gamepadSettings.close();
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
  gamepadSettings = window.GamepadSettings.init({ soundMenu: sndMenu, openSoundMenu: abrirSndMenu });
  const btnSndTitle = document.getElementById('btn-sound-menu-title');
  if (btnSndTitle) btnSndTitle.onclick = abrirSndMenu;

  // v22: conjunto de teclas de movimiento PULSADAS (keydown/keyup); el vector
  // de input se calcula en cada frame del bucle — movimiento libre y suave
  const teclas = new Set();
  window.CameraInput.init({
    world,
    use3D: () => use3D,
    onRelease: () => {
      teclas.clear();
      input.reset('touch');
      if (world.online && window.Net) Net.parar();
    },
  });
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
    input.reset('touch');
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
      if (use3D && window.Render3D?.rot) {
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
    const tercera = use3D && window.Render3D?.modo === 'tercera';
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
        } else window.Render3D?.rotar(ev.code === 'KeyQ' ? 1 : -1);
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
      } else window.Render3D?.rotar(ev.code === 'KeyQ' ? 1 : -1);
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
    if (!(use3D && window.Render3D?.rot)) return [x, y];
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

  const gamepadInput = window.GamepadInput.init({
    world, use3D: () => use3D, settings: gamepadSettings, input,
  });
  let lastRenderT = 0;
  function loop(t) {
    displaySettings.frame(t);
    gamepadInput.frame(t);
    
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
    // el chunk 3D aún viene por el cable: saltamos el frame en vez de pintar
    // un 2D a medias (la tarjeta del nivel tapa estos milisegundos)
    if (use3D && !window.Render3D) return;
    const p = world.player;
    p.inputX = 0;
    p.inputY = 0;

    // ---------- v22: vector de movimiento por frame (movimiento libre) ----------
    if (world.online && world.espectador && window.Net && Net.activo) {
      // modo espectador (v30): sin input — Net.frame pega la cámara al objetivo
      Net.frame(dtNet);
    } else if (world.online && window.Net && Net.activo &&
        !(Net.chatAbierto && Net.chatAbierto()) &&
        document.getElementById('screen-card').style.display === 'none') {
      // suma de las teclas pulsadas en coordenadas de PANTALLA
      let sx = input.x;
      let sy = input.y;
      for (const code of teclas) {
        const v = KEYS[code];
        if (v) { sx += v[0]; sy += v[1]; }
      }
      [sx, sy] = snap8(sx, sy);
      p.inputX = sx;
      p.inputY = sy;
      const tercera = use3D && window.Render3D?.modo === 'tercera';
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

    window.Levels?.frame(world.level, world, t);

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

  // Los arranques directos necesitan el render de inmediato. En la portada se
  // solicita al pulsar empezar/continuar/offline: permanecer en el menú no
  // descarga ni ejecuta Three.js.
  const arranqueDirecto = params.get('autostart') || params.get('selftest') ||
    params.get('online') || params.get('local');
  if (arranqueDirecto) cargar3D();

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

  window.SelfTest.init({ params, world, input, cargarOverrides: cargarOverridesDeJuego });

  const titleController = window.TitleController.init({
    world,
    cargarOverrides: cargarOverridesDeJuego,
    prepararRender: cargar3D,
  });

  // El flujo normal usa joystick continuo; ?autostart es el modo offline por
  // turnos y muestra el D-pad. La regla de movimiento sigue siendo compartida.
  window.TouchControls.init({
    world,
    modoDpad: !!params.get('autostart'),
    pasoOffline: (sdx, sdy) => {
      const tercera = use3D && window.Render3D?.modo === 'tercera';
      pasoOffline(sdx, sdy, tercera);
      lastStepT = performance.now();
    },
  });
  titleController.refresh();
})();
