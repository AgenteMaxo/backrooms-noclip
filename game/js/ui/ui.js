// Interfaz: pantallas, HUD, registro, dados, modales y diario.
(function () {
  const $ = (id) => document.getElementById(id);
  const world = Game.world;

  const screens = {
    title: $('screen-title'),
    card: $('screen-card'),
    game: $('screen-game'),
    end: $('screen-end'),
  };

  function show(name) {
    // salir de la pantalla de título apaga SIEMPRE su música, venga por donde
    // venga el arranque (DESPERTAR, continuar, autostart…) — cinturón además
    // del stopMenu de conectarAlServidor, que las carreras del primer clic
    // podían esquivar (v30.1)
    if (name !== 'title' && window.Sfx) Sfx.stopMenu();
    if (name !== 'end') document.body.classList.remove('smiler-death');
    // el CSS de controles táctiles/aviso de orientación cuelga de estas
    // clases en <body> (game-active, card-active) — sin esto #touch-controls
    // se queda en display:none para siempre pese al media query pointer:coarse
    document.body.classList.toggle('game-active', name === 'game');
    document.body.classList.toggle('card-active', name === 'card');
    // fundido cosmético; el swap de display es SÍNCRONO (el selftest lo exige)
    const fade = $('fade');
    if (fade && !window.NOFX) {
      fade.style.opacity = '1';
      requestAnimationFrame(() => requestAnimationFrame(() => { fade.style.opacity = '0'; }));
    }
    for (const [k, el] of Object.entries(screens))
      el.style.display = k === name ? 'flex' : 'none';
    if (name === 'game') screens.game.style.display = 'flex';
    if (name === 'card') {
      // re-dispara la animación de entrada de la tarjeta
      const card = screens.card.querySelector('.level-card');
      if (card) { card.classList.remove('card-in'); void card.offsetWidth; card.classList.add('card-in'); }
    }
  }

  // ---------- registro (v16): mensajes pequeños arriba a la izquierda que se
  // desvanecen solos; el historial completo vive tras el botón-pergamino (L) ----------
  const historia = [];
  function log(msg, cls) {
    historia.push({ msg, cls });
    if (historia.length > 300) historia.shift();
    const logEl = $('game-log');
    const p = document.createElement('p');
    p.textContent = msg;
    if (cls) p.className = cls;
    logEl.prepend(p);
    while (logEl.children.length > 4) logEl.removeChild(logEl.lastChild);
    setTimeout(() => p.classList.add('log-out'), 5000);
    setTimeout(() => p.remove(), 6100);
    if ($('log-panel').style.display !== 'none') renderLogFull();
  }

  function renderLogFull() {
    const el = $('log-full');
    el.innerHTML = '';
    for (let i = historia.length - 1; i >= 0; i--) {
      const p = document.createElement('p');
      p.textContent = historia[i].msg;
      if (historia[i].cls) p.className = historia[i].cls;
      el.appendChild(p);
    }
  }
  function toggleLog(force) {
    const panel = $('log-panel');
    const vis = force !== undefined ? force : panel.style.display === 'none';
    panel.style.display = vis ? 'block' : 'none';
    if (vis) renderLogFull();
    if (window.Sfx) Sfx.play('ui');
  }
  $('btn-log').onclick = () => toggleLog();
  $('btn-log-close').onclick = () => toggleLog(false);
  if (window.Icons) Icons.set($('btn-log'), 'pergamino', 15);

  // ---------- HUD (v15+: limpio y contextual — manos, equipo y mochila) ----------
  const ICONOS_INV = {
    agua_almendras: 'refresco', botiquin: 'botiquin', linterna: 'linterna',
    chaqueta: 'chaqueta', amuleto: 'cuadro', llave_nivel: 'llave',
    tuberia: 'tuberia', fuego_griego: 'fuego', guante_paralisis: 'guante',
    detector: 'antena', trebol: 'trebol',
    mascara_gas: 'mascara', botas_reforzadas: 'bota',
  };

  function spriteObjeto(id, tam) {
    if (!window.Sprites || !Sprites.tiene(id)) return null;
    const spr = Sprites.get(id, 0);
    if (!spr) return null;
    const c = document.createElement('canvas');
    c.width = tam; c.height = tam;
    c.className = 'icono';
    c.style.width = tam + 'px';
    c.style.height = tam + 'px';
    c.style.imageRendering = 'pixelated';
    c.getContext('2d').drawImage(spr, 0, 0, tam, tam);
    return c;
  }

  function updateHUD() {
    if (!world.player || !world.level) return;
    renderManos();
    renderEquipo();
    renderMoodles();
    renderDebugStats();
    if ($('backpack-panel').style.display !== 'none') {
      renderBackpack();
      renderEfectos();
    }
  }

  // ---------- barras de guardián (v23): números exactos tras la contraseña ----------
  const DBG_BARRAS = [
    ['dbg-salud', (p) => p.salud, '#c94a3a'],
    ['dbg-comida', (p) => p.hambre, '#c9962f'],
    ['dbg-bebida', (p) => p.sed, '#4a7fbf'],
    ['dbg-cordura', (p) => p.cordura, '#9a6fc9'],
    ['dbg-aguante', (p) => p.agotamiento, '#4aa06a'],
  ];
  // clic en la barra: fija el valor directamente (streamer probando escenarios)
  function fijarDebugStat(id, pct) {
    if (id === 'dbg-salud') world.player.salud = pct;
    else if (id === 'dbg-comida') world.player.hambre = pct;
    else if (id === 'dbg-bebida') world.player.sed = pct;
    else if (id === 'dbg-cordura') world.sanity(pct - world.player.cordura);
    else if (id === 'dbg-aguante') world.player.agotamiento = pct;
    updateHUD();
  }
  function renderDebugStats() {
    const cont = $('debug-stats');
    if (!cont || cont.style.display === 'none' || !world.esAdmin) return;
    cont.style.pointerEvents = 'auto'; // el CSS del panel lo desactiva por defecto
    for (const [id, get, color] of DBG_BARRAS) {
      const v = Math.max(0, Math.min(100, Math.round(get(world.player) ?? 0)));
      const fill = $(id);
      fill.style.width = v + '%';
      fill.style.background = color;
      $(id + '-v').textContent = v;
      const track = fill.parentElement;
      if (track && !track._clickBound) {
        track._clickBound = true;
        track.style.cursor = 'pointer';
        track.addEventListener('click', (ev) => {
          const rect = track.getBoundingClientRect();
          const pct = Math.max(0, Math.min(100, Math.round(((ev.clientX - rect.left) / rect.width) * 100)));
          fijarDebugStat(id, pct);
        });
      }
    }
  }

  // ---------- moodles (v16): iconos de estado estilo Project Zomboid ----------
  // aparecen solo cuando el estado empeora; 3 niveles de gravedad por color
  const MOODLES = [
    ['corazon', 'Salud', (p) => p.salud, [60, 35, 15], ['Herido', 'Malherido', 'Crítico'],
      'Un botiquín la recupera.'],
    ['yin', 'Cordura', (p) => p.cordura, [50, 35, 15], ['Inquieto', 'Alterado', 'Mente al límite'],
      'Descansa en niveles seguros, bebe agua de almendras o usa un recuerdo del hogar. A 0, te pierdes para siempre.'],
    ['gota', 'Sed', (p) => p.sed, [50, 30, 10], ['Sediento', 'Muy sediento', 'Deshidratado'],
      'Bebe agua de almendras (o arriésgate con los charcos). A 0, la deshidratación te mata.'],
    ['pan', 'Hambre', (p) => p.hambre, [50, 30, 10], ['Hambriento', 'Famélico', 'Inanición'],
      'Registra contenedores en busca de comida. A 0, la inanición te consume.'],
    ['energia', 'Aguante', (p) => p.agotamiento, [50, 30, 10], ['Cansado', 'Agotado', 'Exhausto'],
      'Párate a descansar (mejor escondido o en la Sala Manila) para recuperarlo. A 0, el agotamiento te desgasta.'],
  ];
  function renderMoodles() {
    const cont = $('moodles');
    cont.innerHTML = '';
    for (const [icono, etiqueta, get, umbrales, nombres, consejo] of MOODLES) {
      const v = get(world.player);
      let lvl = 0;
      for (let i = 0; i < umbrales.length; i++) if (v <= umbrales[i]) lvl = i + 1;
      if (!lvl) continue;
      const d = document.createElement('div');
      d.className = 'moodle moodle-' + lvl + ' tip-left';
      d.dataset.tip = `${nombres[lvl - 1]} — ${etiqueta} ${v}/100. ${consejo}`;
      if (window.Icons) d.appendChild(Icons.img(icono, 20));
      cont.appendChild(d);
    }
  }

  // pinta UNA casilla de mano; enPanel=true (mochila) el clic GUARDA,
  // en el HUD el clic USA (v19) — con su atajo Q/E en la esquina
  function pintarMano(el, m, tam, enPanel) {
    const manos = world.player.manos || [null, null];
    el.innerHTML = '';
    el.classList.remove('activa', 'vacia');
    if (!enPanel) {
      // v28 — atajo dibujado según el dispositivo activo (Q/E, LB/L1…)
      if (window.Controllers) {
        const gl = Controllers.handGlyph(m, 13);
        gl.className = 'k-mano';
        el.appendChild(gl);
      } else {
        const k = document.createElement('span');
        k.className = 'k-mano';
        k.textContent = m === 0 ? 'Q' : 'E';
        el.appendChild(k);
      }
    }
    if (window.Icons) {
      const hand = Icons.img('mano', tam, m === 1);
      hand.classList.add('mano-img');
      hand.style.marginLeft = (-tam / 2) + 'px';
      el.appendChild(hand);
    }
    const id = manos[m];
    const atajoTxt = window.Controllers ? Controllers.handKeyText(m) : (m === 0 ? 'Q' : 'E');
    const accion = enPanel ? 'clic: guardar en la mochila' : `clic o ${atajoTxt}: usar`;
    if (id === '=') { el.title = `Ocupada por el objeto a dos manos (${enPanel ? 'clic: guardar' : 'clic o Q: usar'})`; return; }
    if (id) {
      const def = world.data.objects[id];
      const itTam = Math.round(tam * 0.75);
      const it = spriteObjeto(id, itTam) ||
        (window.Icons ? Icons.img(ICONOS_INV[id] || 'interrogante', itTam) : null);
      if (it) {
        it.classList.add('mano-item');
        it.style.marginLeft = (-itTam / 2) + 'px';
        el.appendChild(it);
      }
      el.title = `${def.nombre} (${accion})`;
      if (def.efecto?.toggle === 'luz' && world.player.luz) el.classList.add('activa');
    } else {
      el.classList.add('vacia');
      el.title = (m === 0 ? 'Mano izquierda' : 'Mano derecha') + ' (vacía)';
    }
  }

  function renderManos() {
    for (let m = 0; m < 2; m++) {
      pintarMano($('mano-' + m), m, 30, false);
      const bp = $('bp-mano-' + m);
      if (bp) pintarMano(bp, m, 40, true);
      // v28 — etiqueta de atajo en la mochila según el dispositivo activo
      const bpKey = $('bp-key-' + m);
      if (bpKey) bpKey.textContent = window.Controllers ? Controllers.handKeyText(m) : (m === 0 ? 'tecla Q' : 'tecla E');
    }
  }

  function highlightSlots(active, itemId) {
    for (const id of [
      'bp-mano-0', 'bp-mano-1', 'mano-0', 'mano-1',
      'eq-cara', 'eq-cuerpo', 'eq-pies',
      'hud-eq-cara', 'hud-eq-cuerpo', 'hud-eq-pies',
    ]) {
      const el = $(id);
      if (el) el.classList.remove('slot-highlight-valid');
    }
    if (!active || !itemId) return;
    const def = world.data.objects[itemId];
    if (!def) return;
    if (def.equipo) {
      for (const id of ['eq-' + def.equipo, 'hud-eq-' + def.equipo]) {
        const el = $(id);
        if (el) el.classList.add('slot-highlight-valid');
      }
    } else {
      for (const id of ['bp-mano-0', 'bp-mano-1', 'mano-0', 'mano-1']) {
        const el = $(id);
        if (el) el.classList.add('slot-highlight-valid');
      }
    }
  }

  function highlightBackpackGrid(active) {
    const el = $('backpack-slots');
    if (el) {
      if (active) el.classList.add('slot-highlight-valid');
      else el.classList.remove('slot-highlight-valid');
    }
  }

  function renderBackpack() {
    const cont = $('backpack-slots');
    cont.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      const id = world.player.inv[i];
      const k = document.createElement('span');
      k.className = 'k'; k.textContent = i + 1;
      slot.appendChild(k);
      if (id) {
        const def = world.data.objects[id];
        const ic = ICONOS_INV[id] || 'interrogante';
        slot.appendChild(window.Icons ? Icons.img(ic, 28) : document.createTextNode('?'));
        const nom = document.createElement('span');
        nom.className = 'nombre';
        nom.textContent = def.nombre;
        slot.appendChild(nom);
        slot.title = `${def.nombre} — ${def.descripcion}`;
        slot.draggable = true;
        slot.addEventListener('dragstart', (e) => {
          e.stopPropagation();
          e.dataTransfer.setData('text/plain', String(i));
          setTimeout(() => {
            highlightSlots(true, id);
          }, 0);
        });
        slot.addEventListener('dragend', () => {
          highlightSlots(false);
        });
        slot.onclick = () => showItemInfo(i, ic);
      }
      cont.appendChild(slot);
    }
  }

  // ---------- equipamiento vestible (v20): cara / cuerpo / pies ----------
  function pintarRanuraEquipo(el, tipo, objetoId, enHud) {
    if (!el) return;
    el.innerHTML = '';
    el.classList.toggle('puesto', !!objetoId);
    if (objetoId) {
      const def = world.data.objects[objetoId];
      if (window.Icons) el.appendChild(Icons.img(ICONOS_INV[objetoId] || 'interrogante', 26));
      el.title = enHud ? `${def.nombre} (${tipo})` : `${def.nombre} (clic: quitártelo)`;
    } else {
      const ph = document.createElement('span');
      ph.className = 'eq-ph';
      ph.textContent = tipo;
      el.appendChild(ph);
      el.title = enHud
        ? `${tipo}: no llevas nada`
        : `Ranura de ${tipo} (arrastra aquí una prenda)`;
    }
  }
  function renderEquipo() {
    const eq = world.player.equipo || {};
    for (const tipo of ['cara', 'cuerpo', 'pies']) {
      const id = eq[tipo];
      pintarRanuraEquipo($('eq-' + tipo), tipo, id, false);
      pintarRanuraEquipo($('hud-eq-' + tipo), tipo, id, true);
    }
  }

  // buffs y debuffs activos del personaje (v20) — con descripción al pasar el ratón
  function renderEfectos() {
    const cont = $('bp-efectos');
    if (!cont) return;
    cont.innerHTML = '';
    const p = world.player;
    const chip = (icono, nombre, tip, mala) => {
      const s = document.createElement('span');
      s.className = 'fx tip-up' + (mala ? ' fx-mal' : '');
      if (window.Icons && Icons.has(icono)) s.appendChild(Icons.img(icono, 13));
      s.appendChild(document.createTextNode(' ' + nombre));
      s.dataset.tip = tip;
      cont.appendChild(s);
    };
    // pasivos por llevarlos encima / puestos
    const PASIVOS = {
      trebol: ['trebol', 'Suerte', '+2 a todas tus tiradas de dado.'],
      detector: ['antena', 'Detector', 'Entidades cercanas visibles en el mapa (M).'],
      chaqueta: ['chaqueta', 'Abrigo', 'PUESTA: el frío no te daña.'],
      mascara_gas: ['mascara', 'Aire filtrado', 'PUESTA: bloquea el aire contaminado · desgaste mental ambiental a la mitad.'],
      botas_reforzadas: ['bota', 'Pisada firme', 'PUESTAS: inmune a charcos sirena · detección −1.'],
    };
    for (const [id, [icono, nombre, tip]] of Object.entries(PASIVOS)) {
      const esRopa = !!world.data.objects[id]?.equipo;
      if (esRopa ? world.equipado(id) : world.hasItem(id)) chip(icono, nombre, tip, false);
    }
    if (p.luz) chip('linterna', 'Linterna', '+4 de visión… y atrae a las Deathmoths.', false);
    // debuffs: estados y reglas del nivel que te afectan AHORA
    if (p.salud < 60) chip('corazon', 'Herido', `Salud ${p.salud}/100. Busca un botiquín.`, true);
    if (p.cordura < 50) chip('yin', 'Mente frágil', `Cordura ${p.cordura}/100. Descansa en niveles seguros o usa un recuerdo del hogar.`, true);
    if (p.sed < 50) chip('gota', 'Sed', `Sed ${p.sed}/100. Bebe agua de almendras.`, true);
    if (p.hambre < 50) chip('pan', 'Hambre', `Hambre ${p.hambre}/100. Encuentra comida.`, true);
    if (p.agotamiento < 50) chip('energia', 'Cansado', `Aguante ${p.agotamiento}/100. Párate a descansar.`, true);
    for (const rid of world.level?.reglas || []) {
      const r = window.Rules?.get(rid);
      if (!r || !r.turno) continue; // solo las que actúan cada turno
      const id2 = window.Icons ? (Icons.has(r.icono) ? r.icono : Icons.deEmoji(r.icono)) : null;
      chip(id2 || 'interrogante', r.nombre, r.desc, true);
    }
  }

  function backpackAbierta() { return $('backpack-panel').style.display !== 'none'; }
  function toggleBackpack(force) {
    const vis = force !== undefined ? force : !backpackAbierta();
    if (vis && document.pointerLockElement) document.exitPointerLock();
    $('backpack-panel').style.display = vis ? 'flex' : 'none';
    if (vis) { renderBackpack(); renderManos(); renderEquipo(); renderEfectos(); }
    if (window.Sfx) Sfx.play('ui');
    if (world.level && !world.over) {
      if (vis) world.busy = true;
      else if ($('exit-modal').style.display === 'none' &&
               $('dice-overlay').style.display === 'none' &&
               $('choice-modal').style.display === 'none' &&
               $('item-modal').style.display === 'none') world.busy = false;
    }
  }

  // feedback de «botón pulsado» en la mano del HUD al usarla (clic, tecla,
  // mando o botón táctil — cualquier camino que llame a usarMano/Net.usar)
  function pulsarMano(m) {
    const el = $('mano-' + m);
    if (!el) return;
    el.classList.remove('pulsada');
    void el.offsetWidth; // reinicia la animación si se repite rápido
    el.classList.add('pulsada');
    setTimeout(() => el.classList.remove('pulsada'), 180);
  }

  // manos: en el HUD el clic USA (v19: como Q/E); en el panel de la mochila
  // el clic GUARDA. Soltar un objeto arrastrado equipa en ambos sitios, y
  // arrastrar una mano hasta la rejilla guarda el objeto en la mochila.
  for (const m of [0, 1]) {
    for (const el of [$('mano-' + m), $('bp-mano-' + m)]) {
      if (!el) continue;
      const enPanel = el.id.startsWith('bp-');
      el.onclick = () => {
        if (enPanel) return Game.desequipar(m);
        pulsarMano(m);
        return Game.usarMano(m);
      };
      el.draggable = true;
      el.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        e.dataTransfer.setData('text/plain', 'mano:' + m);
        setTimeout(() => {
          highlightBackpackGrid(true);
        }, 0);
      });
      el.addEventListener('dragend', () => {
        highlightBackpackGrid(false);
      });
      el.addEventListener('dragover', (e) => e.preventDefault());
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        const s = e.dataTransfer.getData('text/plain');
        if (s !== '' && !s.startsWith('mano:')) Game.equipar(parseInt(s, 10));
      });
    }
  }
  const bpSlots = $('backpack-slots');
  bpSlots.addEventListener('dragover', (e) => e.preventDefault());
  bpSlots.addEventListener('drop', (e) => {
    e.preventDefault();
    const s = e.dataTransfer.getData('text/plain');
    if (s.startsWith('mano:')) Game.desequipar(parseInt(s.slice(5), 10));
    else if (s.startsWith('eq:')) Game.quitarEquipo(s.slice(3));
  });

  // ranuras de ropa (v20): clic quita; soltar un objeto arrastrado lo pone
  for (const tipo of ['cara', 'cuerpo', 'pies']) {
    const el = $('eq-' + tipo);
    if (!el) continue;
    el.onclick = () => Game.quitarEquipo(tipo);
    el.draggable = true;
    el.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      e.dataTransfer.setData('text/plain', 'eq:' + tipo);
      setTimeout(() => {
        highlightBackpackGrid(true);
      }, 0);
    });
    el.addEventListener('dragend', () => {
      highlightBackpackGrid(false);
    });
    el.addEventListener('dragover', (e) => e.preventDefault());
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      const s = e.dataTransfer.getData('text/plain');
      if (s !== '' && !s.startsWith('mano:') && !s.startsWith('eq:'))
        Game.ponerEquipo(parseInt(s, 10));
    });
  }

  // ---------- ventana de información de objeto ----------
  function efectoLegible(def) {
    const e = def.efecto || {};
    const partes = [];
    if (e.salud) partes.push(e.salud > 0 ? `Restaura ${e.salud} ♥ de salud` : `Daña ${Math.abs(e.salud)} ♥`);
    if (e.cordura) partes.push(e.cordura > 0 ? `Restaura ${e.cordura} de cordura` : `Reduce ${Math.abs(e.cordura)} de cordura`);
    if (e.sed) partes.push(e.sed > 0 ? `Sacia ${e.sed} de sed` : `Aumenta la sed ${Math.abs(e.sed)}`);
    if (e.ruido) partes.push(`Genera ruido ${e.ruido}`);
    if (e.toggle === 'luz') partes.push('Alterna la luz (+4 de visión; atrae Deathmoths)');
    if (e.activo === 'fuego') partes.push(`USO: quema y ahuyenta en radio ${e.radio || 3}`);
    if (e.activo === 'fuego_menor') partes.push(`USO: quema en radio ${e.radio || 1}`);
    if (e.activo === 'toxina' || e.activo === 'gas') partes.push(`USO: nube peligrosa en radio ${e.radio || 2}`);
    if (e.activo === 'paralisis') partes.push('USO REUTILIZABLE: paraliza lo adyacente');
    if (e.activo === 'disparo') partes.push(`USO: disparo frontal, daño ${e.dano || 34}`);
    if (e.activo === 'flash') partes.push(`USO: revela y aturde en radio ${e.radio || 4}`);
    if (e.activo === 'ruido') partes.push(`USO: distracción sonora en radio ${e.radio || 9}`);
    if (e.activo === 'repeler' || e.activo === 'sellar') partes.push(`USO: repele amenazas cercanas`);
    if (e.activo === 'salida') partes.push('USO: intenta abrir una ruta de nivel');
    if (e.activo === 'blink') partes.push('USO: desplazamiento espacial corto');
    if (e.activo === 'claridad') partes.push('USO: aporta información del entorno');
    if (e.activo === 'glitch') partes.push('USO: distorsiona señales y revela anomalías');
    if (e.activo === 'celeridad') partes.push('USO: acelera reflejos');
    if (e.activo === 'ocultar' || e.activo === 'refugio') partes.push('USO: cobertura temporal');
    if (e.activo === 'riesgo') partes.push('USO PELIGROSO: reacción anómala');
    if (e.pasivo === 'arma') partes.push('PASIVO: muévete HACIA una entidad adyacente para golpearla');
    if (e.pasivo === 'abrigo') partes.push('PUESTA (cuerpo): anula el daño por frío');
    if (e.pasivo === 'aire') partes.push('PUESTA (cara): reduce a la mitad el desgaste mental ambiental');
    if (e.pasivo === 'pisada') partes.push('PUESTAS (pies): inmune a charcos sirena · detección −1');
    if (e.pasivo === 'detector') partes.push('PASIVO: entidades cercanas visibles en el minimapa');
    if (e.pasivo === 'suerte') partes.push('PASIVO: +2 a todas tus tiradas de dado');
    if (e.pasivo === 'llave') partes.push('Se gasta al abrir una puerta de acero en The Hub');
    if (e.pasivo === 'proteccion_quimica') partes.push('PASIVO: protección frente a corrosión/toxinas');
    if (e.pasivo === 'traje_hostil') partes.push('PUESTO: protección de entorno hostil');
    if (e.pasivo === 'fuerza') partes.push('PASIVO: mejora acciones físicas y golpes');
    return partes.join(' · ') || 'Efecto desconocido.';
  }

  function showItemInfo(slot, icono) {
    const id = world.player.inv[slot];
    if (!id) return;
    const def = world.data.objects[id];
    world.busy = true;
    if (window.Sfx) Sfx.play('ui');
    const iconEl = $('item-icon');
    iconEl.textContent = '';
    const sprIcon = spriteObjeto(id, 28);
    if (sprIcon) iconEl.appendChild(sprIcon);
    else if (window.Icons && Icons.has(icono)) iconEl.appendChild(Icons.img(icono, 20));
    else iconEl.textContent = icono;
    $('item-name').textContent = def.nombre;
    $('item-desc').textContent = def.descripcion;
    $('item-effect').textContent = efectoLegible(def);
    const wiki = $('item-wiki');
    if (def.url) { wiki.style.display = 'inline'; wiki.href = def.url; }
    else wiki.style.display = 'none';
    const usable = def.efecto && (def.efecto.salud || def.efecto.cordura || def.efecto.sed ||
      def.efecto.ruido || def.efecto.toggle || def.efecto.activo);
    const btnUse = $('btn-item-use');
    btnUse.style.display = usable ? 'inline-block' : 'none';
    // usar CIERRA también la mochila: si no, world.busy sigue activo y la
    // acción se tragaba sin hacer nada (bug v16)
    btnUse.onclick = () => { cerrarItemInfo(); toggleBackpack(false); Game.useItem(slot); };
    const btnEq = $('btn-item-equip');
    btnEq.style.display = (def.manos || def.equipo) ? 'inline-block' : 'none';
    btnEq.textContent = def.equipo ? 'PONERSE' : 'EMPUÑAR';
    btnEq.onclick = () => {
      cerrarItemInfo();
      if (def.equipo) Game.ponerEquipo(slot);
      else Game.equipar(slot);
    };
    $('btn-item-drop').onclick = () => { cerrarItemInfo(); Game.tirarItem(slot); };
    $('btn-item-throw').onclick = () => { cerrarItemInfo(); toggleBackpack(false); Game.arrojarItem(slot); };
    $('btn-item-close').onclick = cerrarItemInfo;
    $('item-modal').style.display = 'flex';
  }
  function cerrarItemInfo() {
    $('item-modal').style.display = 'none';
    if ($('exit-modal').style.display === 'none' && $('dice-overlay').style.display === 'none' &&
        $('choice-modal').style.display === 'none' && !backpackAbierta())
      world.busy = false;
  }

  let flashT = -99999;
  function flashDamage() { flashT = performance.now(); }

  // ---------- modales de juego ----------
  const modales = UiModals.create({ world, $, showScreen: show });
  const showLevelCard = modales.mostrarTarjetaNivel;
  const showDice = modales.mostrarDado;
  const showExitModal = modales.mostrarSalida;
  const showLevelPicker = modales.mostrarSelectorNivel;
  const showChoice = modales.mostrarEleccion;

  // ---------- diario ----------
  function renderJournal(listEl) {
    listEl.innerHTML = '';
    for (const j of world.journal) {
      const li = document.createElement('li');
      li.textContent = `${j.nombre} (${j.turnos} turnos) — ${j.salida}`;
      listEl.appendChild(li);
    }
    if (world.level && !world.over) {
      const li = document.createElement('li');
      li.textContent = `${world.level.wikiTitle} (${world.turn} turnos) — estás aquí`;
      li.style.color = '#d9c66e';
      listEl.appendChild(li);
    }
  }
  function toggleJournal() {
    const p = $('journal-panel');
    const visible = p.style.display !== 'none';
    if (!visible && document.pointerLockElement) document.exitPointerLock();
    p.style.display = visible ? 'none' : 'block';
    if (!visible) renderJournal($('journal-list'));
  }

  // ---------- códice del errante ----------
  const codex = UiCodex.create({ world, $, objectIcons: ICONOS_INV });
  const toggleCodex = codex.alternar;

  // ---------- changelog ----------
  let changelogVisible = false;
  function toggleChangelog(force) {
    changelogVisible = force !== undefined ? force : !changelogVisible;
    if (changelogVisible && document.pointerLockElement) document.exitPointerLock();
    $('changelog-panel').style.display = changelogVisible ? 'flex' : 'none';
    if (changelogVisible && window.Changelog) Changelog.render($('changelog-list'));
    if (world.level && !world.over) {
      if (changelogVisible) world.busy = true;
      else if ($('exit-modal').style.display === 'none' && $('dice-overlay').style.display === 'none')
        world.busy = false;
    }
  }
  if ($('btn-changelog-close-top')) $('btn-changelog-close-top').onclick = () => toggleChangelog(false);
  $('changelog-panel').onclick = (ev) => {
    if (ev.target === $('changelog-panel') || ev.target.classList.contains('codex-box-wrapper')) toggleChangelog(false);
  };

  // ---------- fin ----------
  function showEnd(victoria, causa) {
    if (!world._muerteSmiler) document.body.classList.remove('smiler-death');
    show('end');
    if (window.Sfx) setTimeout(() => Sfx.idle(true, victoria ? 'victoria' : 'muerte'), 1600);
    const t = $('end-title');
    t.textContent = victoria ? 'HAS ESCAPADO' : 'FIN DEL TRAYECTO';
    t.className = victoria ? 'victoria' : 'muerte';
    $('end-cause').textContent = causa;
    $('end-stats').innerHTML = `
      <div><b>${world.journal.length}</b>niveles</div>
      <div><b>${world.turnTotal}</b>turnos</div>
      <div><b>${world.runSeed}</b>semilla</div>`;
    renderJournal($('end-journal'));
  }

  world.ui = {
    log, updateHUD, flashDamage, showLevelCard, showDice,
    showExitModal, showLevelPicker, showChoice, toggleJournal, showEnd, show, toggleCodex,
    toggleBackpack, toggleLog, pulsarMano, toggleChangelog,
    get flashT() { return flashT; },
  };
})();
