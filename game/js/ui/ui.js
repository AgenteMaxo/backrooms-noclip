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

  // ---------- HUD (v15: limpio y contextual — manos + mochila, sin barras) ----------
  const ICONOS_INV = {
    agua_almendras: 'refresco', botiquin: 'botiquin', linterna: 'linterna',
    chaqueta: 'chaqueta', amuleto: 'cuadro', llave_nivel: 'llave',
    tuberia: 'tuberia', fuego_griego: 'fuego', guante_paralisis: 'guante',
    detector: 'antena', trebol: 'trebol',
    mascara_gas: 'mascara', botas_reforzadas: 'bota',
  };

  function updateHUD() {
    if (!world.player || !world.level) return;
    renderManos();
    renderMoodles();
    renderDebugStats();
    if ($('backpack-panel').style.display !== 'none') {
      renderBackpack();
      renderEquipo();
      renderEfectos();
    }
  }

  // ---------- barras de guardián (v23): números exactos tras la contraseña ----------
  const DBG_BARRAS = [
    ['dbg-salud', (p) => p.salud, '#c94a3a'],
    ['dbg-comida', (p) => p.hambre, '#c9962f'],
    ['dbg-bebida', (p) => p.sed, '#4a7fbf'],
    ['dbg-cordura', (p) => p.cordura, '#9a6fc9'],
  ];
  function renderDebugStats() {
    const cont = $('debug-stats');
    if (!cont || cont.style.display === 'none' || !world.esAdmin) return;
    for (const [id, get, color] of DBG_BARRAS) {
      const v = Math.max(0, Math.min(100, Math.round(get(world.player) ?? 0)));
      const fill = $(id);
      fill.style.width = v + '%';
      fill.style.background = color;
      $(id + '-v').textContent = v;
    }
  }

  // ---------- moodles (v16): iconos de estado estilo Project Zomboid ----------
  // aparecen solo cuando el estado empeora; 3 niveles de gravedad por color
  const MOODLES = [
    ['corazon', 'Salud', (p) => p.salud, [60, 35, 15], ['Herido', 'Malherido', 'Crítico'],
      'Un botiquín (o el instinto Sangre amarilla) la recupera.'],
    ['yin', 'Cordura', (p) => p.cordura, [50, 35, 15], ['Inquieto', 'Alterado', 'Mente al límite'],
      'Descansa en niveles seguros, bebe agua de almendras o usa un recuerdo del hogar. A 0, te pierdes para siempre.'],
    ['gota', 'Sed', (p) => p.sed, [50, 30, 10], ['Sediento', 'Muy sediento', 'Deshidratado'],
      'Bebe agua de almendras (o arriésgate con los charcos). A 0, la deshidratación te mata.'],
    ['pan', 'Hambre', (p) => p.hambre, [50, 30, 10], ['Hambriento', 'Famélico', 'Inanición'],
      'Registra contenedores en busca de comida. A 0, la inanición te consume.'],
  ];
  function renderMoodles() {
    const cont = $('moodles');
    cont.innerHTML = '';
    // Sintonía (v18): el ojo amarillo — siempre visible en cuanto despierta
    const sint = world.player.sintonia || 0;
    if (sint >= 10) {
      const d = document.createElement('div');
      d.className = 'moodle moodle-sint tip-left';
      d.dataset.tip = `Sintonía ${sint}/100 — las Backrooms te reclaman. Las entidades corrientes te ignoran más… pero al ESCAPAR la realidad tira un dado contra tu Sintonía. El recuerdo del hogar la baja.`;
      if (window.Icons) d.appendChild(Icons.img('ojo', 20));
      cont.appendChild(d);
    }
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
      const k = document.createElement('span');
      k.className = 'k-mano';
      k.textContent = m === 0 ? 'Q' : 'E';
      el.appendChild(k);
    }
    if (window.Icons) {
      const hand = Icons.img('mano', tam, m === 1);
      hand.classList.add('mano-img');
      hand.style.marginLeft = (-tam / 2) + 'px';
      el.appendChild(hand);
    }
    const id = manos[m];
    const accion = enPanel ? 'clic: guardar en la mochila' : `clic o ${m === 0 ? 'Q' : 'E'}: usar`;
    if (id === '=') { el.title = `Ocupada por el objeto a dos manos (${enPanel ? 'clic: guardar' : 'clic o Q: usar'})`; return; }
    if (id) {
      const def = world.data.objects[id];
      if (window.Icons) {
        const itTam = Math.round(tam * 0.75);
        const it = Icons.img(ICONOS_INV[id] || 'interrogante', itTam);
        it.classList.add('mano-item');
        it.style.marginLeft = (-itTam / 2) + 'px';
        el.appendChild(it);
      }
      el.title = `${def.nombre} (${accion})`;
      if (id === 'linterna' && world.player.luz) el.classList.add('activa');
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
        slot.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', String(i)));
        slot.onclick = () => showItemInfo(i, ic);
      }
      cont.appendChild(slot);
    }
  }

  // ---------- equipamiento vestible (v20): cara / cuerpo / pies ----------
  function renderEquipo() {
    const eq = world.player.equipo || {};
    for (const tipo of ['cara', 'cuerpo', 'pies']) {
      const el = $('eq-' + tipo);
      if (!el) continue;
      el.innerHTML = '';
      el.classList.toggle('puesto', !!eq[tipo]);
      if (eq[tipo]) {
        const def = world.data.objects[eq[tipo]];
        if (window.Icons) el.appendChild(Icons.img(ICONOS_INV[eq[tipo]] || 'interrogante', 26));
        el.title = `${def.nombre} (clic: quitártelo)`;
      } else {
        const ph = document.createElement('span');
        ph.className = 'eq-ph';
        ph.textContent = tipo;
        el.appendChild(ph);
        el.title = `Ranura de ${tipo} (arrastra aquí una prenda)`;
      }
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
    // instintos (buffs de la Sintonía)
    for (const id of p.instintos || []) {
      const inst = Game.INSTINTOS?.[id];
      if (inst) chip(inst.icono, inst.nombre, inst.desc, false);
    }
    // pasivos por llevarlos encima / puestos
    const PASIVOS = {
      trebol: ['trebol', 'Suerte', '+2 a todas tus tiradas de dado.'],
      detector: ['antena', 'Detector', 'Entidades cercanas visibles en el mapa (M).'],
      chaqueta: ['chaqueta', 'Abrigo', 'PUESTA: el frío no te daña.'],
      mascara_gas: ['mascara', 'Aire filtrado', 'PUESTA: desgaste mental ambiental a la mitad.'],
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
    if ((p.sintonia || 0) >= 20) chip('ojo', `Sintonía ${p.sintonia}`, 'Las Backrooms te reclaman: las entidades te ignoran más… pero escapar es más difícil.', true);
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

  // manos: en el HUD el clic USA (v19: como Q/E); en el panel de la mochila
  // el clic GUARDA. Soltar un objeto arrastrado equipa en ambos sitios, y
  // arrastrar una mano hasta la rejilla guarda el objeto en la mochila.
  for (const m of [0, 1]) {
    for (const el of [$('mano-' + m), $('bp-mano-' + m)]) {
      if (!el) continue;
      const enPanel = el.id.startsWith('bp-');
      el.onclick = () => (enPanel ? Game.desequipar(m) : Game.usarMano(m));
      el.draggable = true;
      el.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', 'mano:' + m));
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
    el.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', 'eq:' + tipo));
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
    if (e.salud) partes.push(`Restaura ${e.salud} ♥ de salud`);
    if (e.cordura) partes.push(`Restaura ${e.cordura} ☯ de cordura`);
    if (e.sed) partes.push(`Sacia ${e.sed} 💧 de sed`);
    if (e.toggle === 'luz') partes.push('Alterna la luz (+4 de visión; atrae Deathmoths)');
    if (e.activo === 'fuego') partes.push('USO ÚNICO: quema (−30) y ahuyenta todo en radio 3');
    if (e.activo === 'paralisis') partes.push('USO ÚNICO: paraliza 6 turnos a lo adyacente');
    if (e.pasivo === 'arma') partes.push('PASIVO: muévete HACIA una entidad adyacente para golpearla');
    if (e.pasivo === 'abrigo') partes.push('PUESTA (cuerpo): anula el daño por frío');
    if (e.pasivo === 'aire') partes.push('PUESTA (cara): reduce a la mitad el desgaste mental ambiental');
    if (e.pasivo === 'pisada') partes.push('PUESTAS (pies): inmune a charcos sirena · detección −1');
    if (e.pasivo === 'detector') partes.push('PASIVO: entidades cercanas visibles en el minimapa');
    if (e.pasivo === 'suerte') partes.push('PASIVO: +2 a todas tus tiradas de dado');
    if (e.pasivo === 'llave') partes.push('Se gasta al abrir una puerta de acero en The Hub');
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
    if (window.Icons && Icons.has(icono)) iconEl.appendChild(Icons.img(icono, 20));
    else iconEl.textContent = icono;
    $('item-name').textContent = def.nombre;
    $('item-desc').textContent = def.descripcion;
    $('item-effect').textContent = efectoLegible(def);
    const wiki = $('item-wiki');
    if (def.url) { wiki.style.display = 'inline'; wiki.href = def.url; }
    else wiki.style.display = 'none';
    const usable = def.efecto && (def.efecto.salud || def.efecto.cordura || def.efecto.sed ||
      def.efecto.toggle || def.efecto.activo);
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

  // ---------- tarjeta de nivel ----------
  function showLevelCard(def, cb) {
    show('card');
    if (window.Sfx) { Sfx.play('ui'); Sfx.idle(true); } // pad suave entre niveles
    const colores = ['#3fae6a', '#8bb944', '#d9a531', '#e0742c', '#d94a35', '#a12744'];
    $('card-danger').style.background = colores[def.peligro] || '#888';
    $('card-name').textContent = def.nombre;
    $('card-class').textContent = `${def.clase} · Peligro ${def.peligro}/5 · ${def.bioma}`;
    $('card-desc').textContent = def.descripcion;
    $('card-quote').textContent = '«' + def.cita + '»';
    const rulesEl = $('card-rules');
    rulesEl.innerHTML = '';
    const chip = (icono, texto) => {
      const span = document.createElement('span');
      const id = window.Icons ? (Icons.has(icono) ? icono : Icons.deEmoji(icono)) : null;
      if (id) span.appendChild(Icons.img(id, 13));
      else if (icono) span.appendChild(document.createTextNode(icono));
      span.appendChild(document.createTextNode(' ' + texto));
      return span;
    };
    for (const rid of def.reglas || []) {
      const r = Rules.get(rid);
      if (!r) continue;
      const span = chip(r.icono, r.nombre);
      span.title = r.desc;
      rulesEl.appendChild(span);
    }
    if (def.esEscape) {
      const span = chip('estrella', 'POSIBLE RUTA DE ESCAPE');
      span.style.borderColor = '#4ade80';
      span.style.color = '#8ae8a0';
      rulesEl.appendChild(span);
    }
    $('card-wiki').href = def.url;
    $('btn-enter').onclick = () => {
      if (window.Sfx) Sfx.idle(false);
      show('game');
      cb();
    };
  }

  // ---------- dado ----------
  function showDice(texto, cb, resultado) {
    // el resultado llega ya decidido por la lógica (determinista por semilla);
    // si no llega (dado personal online), se tira aquí
    const tirar = () => (Number.isInteger(resultado) ? resultado : 1 + Math.floor(Math.random() * 20));
    // la animación puede apagarse en Ajustes (v16): la tirada se resuelve igual
    if (window.OPTS && !window.OPTS.dado) {
      setTimeout(() => cb(tirar()), 120);
      return;
    }
    const ov = $('dice-overlay'), face = $('dice-face');
    $('dice-text').textContent = texto;
    ov.style.display = 'flex';
    face.classList.add('rolling');
    let ticks = 0;
    const iv = setInterval(() => {
      face.textContent = 1 + Math.floor(Math.random() * 20); // caras al vuelo: solo animación
      if (++ticks > 14) {
        clearInterval(iv);
        const result = tirar();
        face.textContent = result;
        face.classList.remove('rolling');
        setTimeout(() => { ov.style.display = 'none'; cb(result); }, 900);
      }
    }, 70);
  }

  // ---------- modal de salida ----------
  let exitDefShown = null;
  function showExitModal(def) {
    exitDefShown = def;
    world.busy = true;
    // colección: ver una salida la desbloquea en el códice (las de retorno no cuentan)
    if (def.tipo !== 'retorno' && world.level)
      Game.Profiles.registrarDescubierto('salidas', `${world.level.id}::${def.texto}`);
    $('exit-modal').style.display = 'flex';
    $('exit-text').textContent = def.texto;
    const warn = $('exit-warn');
    const destinoNombre = def.destino && world.data.levels[def.destino]
      ? world.data.levels[def.destino].wikiTitle : null;
    if (def.tipo === 'retorno')
      warn.textContent = `↩ Volver por donde viniste → ${destinoNombre ?? '???'}`;
    else if (def.tipo === 'escape') warn.textContent = '⭐ Parece un camino de vuelta a la realidad.';
    else if (def.tipo === 'sellada') warn.textContent = '⌀ El camino se pierde en niveles sin cartografiar.';
    else if (def.tipo === 'llave') warn.textContent = '🗝 Requiere una Llave de Nivel.';
    else if (def.tipo === 'arriesgada' && def.riesgoVoid > 0)
      warn.textContent = `⚠ Camino inestable (riesgo de caer al Vacío) → ${destinoNombre ?? '???'}`;
    else warn.textContent = destinoNombre ? `→ ${destinoNombre}` : '→ ¿?';
    $('btn-cross').onclick = () => { hideExitModal(); Game.crossExit(def); };
    $('btn-stay').onclick = hideExitModal;
  }
  function hideExitModal() {
    $('exit-modal').style.display = 'none';
    world.busy = false;
  }

  // ---------- selector de nivel (llave del Hub) ----------
  function showLevelPicker(ids, cb) {
    world.busy = true;
    const modal = $('exit-modal');
    modal.style.display = 'flex';
    $('exit-text').innerHTML = 'La Llave gira. ¿Qué puerta abres?<br><br>';
    const warn = $('exit-warn');
    warn.innerHTML = '';
    for (const id of ids) {
      const b = document.createElement('button');
      b.className = 'btn-small';
      b.style.margin = '3px';
      b.textContent = world.data.levels[id].wikiTitle;
      b.onclick = () => { modal.style.display = 'none'; world.busy = false; cb(id); };
      warn.appendChild(b);
    }
    $('btn-cross').onclick = null;
    $('btn-cross').style.display = 'none';
    $('btn-stay').onclick = () => {
      modal.style.display = 'none';
      $('btn-cross').style.display = '';
      world.busy = false;
    };
  }

  // ---------- Instintos (v18): elige 1 de 3 al cruzar un umbral de Sintonía ----------
  function showInstintos(umbral, ofertas, cb) {
    world.busy = true;
    $('instinto-nivel').textContent = umbral;
    const cont = $('instinto-cards');
    cont.innerHTML = '';
    for (const inst of ofertas) {
      const card = document.createElement('div');
      card.className = 'inst-card';
      if (window.Icons) card.appendChild(Icons.img(inst.icono, 26));
      const h = document.createElement('h4');
      h.textContent = inst.nombre;
      card.appendChild(h);
      const p = document.createElement('p');
      p.textContent = inst.desc;
      card.appendChild(p);
      card.onclick = () => {
        $('instinto-modal').style.display = 'none';
        if ($('exit-modal').style.display === 'none' && $('dice-overlay').style.display === 'none' &&
            $('choice-modal').style.display === 'none' && !backpackAbierta())
          world.busy = false;
        if (window.Sfx) Sfx.play('recoger');
        cb(inst.id);
      };
      cont.appendChild(card);
    }
    $('instinto-modal').style.display = 'flex';
    if (window.Sfx) Sfx.play('ui');
  }

  // ---------- elección libre (beber agua, rituales…) ----------
  function showChoice(titulo, texto, opciones) {
    world.busy = true;
    $('choice-title').textContent = titulo;
    $('choice-text').textContent = texto;
    const btns = $('choice-btns');
    btns.innerHTML = '';
    opciones.forEach((op, i) => {
      const b = document.createElement('button');
      b.className = i === 0 ? 'btn-big' : 'btn-small';
      if (i === 0) { b.style.fontSize = '12px'; b.style.padding = '11px 20px'; }
      b.textContent = op.label;
      b.onclick = () => {
        $('choice-modal').style.display = 'none';
        if ($('exit-modal').style.display === 'none' && $('dice-overlay').style.display === 'none')
          world.busy = false;
        if (window.Sfx) Sfx.play('ui');
        if (op.cb) op.cb();
      };
      btns.appendChild(b);
    });
    $('choice-modal').style.display = 'flex';
  }

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
    p.style.display = visible ? 'none' : 'block';
    if (!visible) renderJournal($('journal-list'));
  }

  // ---------- códice del errante (v19: compacto, con desplegables) ----------
  function renderCodex() {
    const P = Game.Profiles;
    const perfil = P.get();
    $('codex-name').textContent = P.activeName() || 'sin perfil';
    const recEl = $('codex-records'), lvEl = $('codex-levels'), hiEl = $('codex-history');
    lvEl.innerHTML = ''; hiEl.innerHTML = '';
    if (!perfil) { recEl.textContent = 'Crea un perfil para empezar tu expediente.'; return; }
    const r = perfil.records;
    recEl.textContent = `Expediciones: ${r.runs} · Récord de niveles en una expedición: ${r.maxNiveles} · Récord de turnos sobrevividos: ${r.maxTurnos} · Escapes logrados: ${r.escapes}`;
    const colores = ['#3fae6a', '#8bb944', '#d9a531', '#e0742c', '#d94a35', '#a12744'];
    const entries = Object.entries(perfil.codice).sort((a, b) => b[1].veces - a[1].veces);
    $('cdx-n-niveles').textContent = `${entries.length}/${Object.keys(world.data.levels).length}`;
    if (!entries.length) lvEl.innerHTML = '<p class="codex-records">Aún no has transitado ningún nivel.</p>';
    for (const [id, c] of entries) {
      const lv = world.data.levels[id];
      if (!lv) continue;
      const det = document.createElement('details');
      det.className = 'cdx-nivel';
      det.style.borderLeftColor = colores[lv.peligro] || '#888';
      const mejor = c.mejorTurnos !== null
        ? ` · mejor travesía: ${c.mejorTurnos} turnos` : ' · nunca lograste salir de él';
      det.innerHTML = `<summary><b>${lv.nombre}</b>${c.escapado ? ' ⭐' : ''}
          <span class="meta-min">peligro ${lv.peligro}/5 · ${c.veces}×</span></summary>
        <div class="cuerpo">
          <div class="meta">${lv.clase} · bioma: ${lv.bioma}</div>
          <div class="desc">${lv.descripcion}</div>
          <div class="stats">Transitado ${c.veces} ${c.veces === 1 ? 'vez' : 'veces'}${mejor}${c.escapado ? ' · ⭐ escapaste por aquí' : ''}</div>
          <a href="${lv.url}" target="_blank" rel="noopener">ficha original en la wiki ↗</a>
        </div>`;
      lvEl.appendChild(det);
    }
    const hist = perfil.historial || [];
    $('cdx-n-hist').textContent = hist.length || '—';
    for (const h of hist) {
      const li = document.createElement('li');
      li.textContent = `${h.fecha} · semilla «${h.semilla}» · ${h.niveles} niveles, ${h.turnos} turnos · ${h.resultado}`;
      hiEl.appendChild(li);
    }
    renderColeccion(perfil);
  }

  // ---------- Colección (v15): coleccionables con «???» hasta descubrirlos ----------
  function silueta(glyph) {
    const spr = Sprites.get(glyph, 0);
    if (!spr) return null;
    const c = document.createElement('canvas');
    c.width = spr.width; c.height = spr.height;
    const x = c.getContext('2d');
    x.drawImage(spr, 0, 0);
    x.globalCompositeOperation = 'source-in';   // solo tiñe los píxeles del sprite
    x.fillStyle = '#15130e';
    x.fillRect(0, 0, c.width, c.height);
    return c.toDataURL();
  }

  function renderColeccion(perfil) {
    const desc = perfil.descubiertos || { salidas: {}, entidades: {}, objetos: {} };

    // entidades: sprite real si la has visto; silueta negra y ??? si no
    const entEl = $('codex-entidades');
    entEl.innerHTML = '';
    let vistas = 0;
    const ents = Object.values(world.data.entities);
    for (const def of ents) {
      const visto = !!desc.entidades[def.id];
      if (visto) vistas++;
      const card = document.createElement('div');
      card.className = 'col-card' + (visto ? '' : ' col-locked');
      const spr = visto ? Sprites.get(def.glyph, 0) : null;
      const img = document.createElement('img');
      img.className = 'icono';
      img.style.width = img.style.height = '34px';
      img.src = spr ? spr.toDataURL() : (silueta(def.glyph) || (window.Icons ? Icons.url('interrogante') : ''));
      card.appendChild(img);
      const nom = document.createElement('div');
      nom.textContent = visto ? def.nombre : '???';
      card.appendChild(nom);
      if (visto) card.title = def.descripcion || def.nombre;
      if (visto && def.url && window.Icons) {
        const a = document.createElement('a');
        a.className = 'col-wiki';
        a.href = def.url; a.target = '_blank'; a.rel = 'noopener';
        a.title = 'Ficha real en la wiki ↗';
        a.appendChild(Icons.img('interrogante', 12));
        card.appendChild(a);
      }
      entEl.appendChild(card);
    }
    $('cdx-n-ent').textContent = `${vistas}/${ents.length}`;

    // objetos
    const objEl = $('codex-objetos');
    objEl.innerHTML = '';
    let habidos = 0;
    const objs = Object.values(world.data.objects);
    for (const def of objs) {
      const visto = !!desc.objetos[def.id];
      if (visto) habidos++;
      const card = document.createElement('div');
      card.className = 'col-card' + (visto ? '' : ' col-locked');
      if (window.Icons)
        card.appendChild(Icons.img(visto ? (ICONOS_INV[def.id] || 'interrogante') : 'interrogante', 32));
      const nom = document.createElement('div');
      nom.textContent = visto ? def.nombre : '???';
      card.appendChild(nom);
      if (visto) card.title = def.descripcion || def.nombre;
      if (visto && def.url && window.Icons) {
        const a = document.createElement('a');
        a.className = 'col-wiki';
        a.href = def.url; a.target = '_blank'; a.rel = 'noopener';
        a.title = 'Ficha real en la wiki ↗';
        a.appendChild(Icons.img('interrogante', 12));
        card.appendChild(a);
      }
      objEl.appendChild(card);
    }
    $('cdx-n-obj').textContent = `${habidos}/${objs.length}`;

    // salidas por nivel (solo niveles que ya pisaste: sin spoilers del resto)
    const salEl = $('codex-salidas');
    salEl.innerHTML = '';
    let salTot = 0, salDesc = 0;
    for (const id of Object.keys(perfil.codice)) {
      const lv = world.data.levels[id];
      if (!lv || !(lv.salidas || []).length) continue;
      const halladas = lv.salidas.filter((s) => desc.salidas[`${id}::${s.texto}`]);
      salTot += lv.salidas.length;
      salDesc += halladas.length;
      const det = document.createElement('details');
      det.className = 'cdx-nivel';
      det.style.borderLeftColor = '#8a7a3d';
      const ul = lv.salidas.map((s) =>
        desc.salidas[`${id}::${s.texto}`]
          ? `<li>${s.texto}</li>`
          : '<li class="col-locked">??? — sin descubrir</li>').join('');
      det.innerHTML = `<summary><b>${lv.wikiTitle}</b>
          <span class="meta-min">${halladas.length}/${lv.salidas.length}</span></summary>
        <div class="cuerpo"><ul>${ul}</ul></div>`;
      salEl.appendChild(det);
    }
    $('cdx-n-sal').textContent = salTot ? `${salDesc}/${salTot}` : '—';
    if (!salEl.children.length)
      salEl.innerHTML = '<p class="codex-records">Explora niveles para catalogar sus salidas.</p>';
  }

  let codexVisible = false;
  function toggleCodex(force) {
    codexVisible = force !== undefined ? force : !codexVisible;
    $('codex-panel').style.display = codexVisible ? 'flex' : 'none';
    if (codexVisible) renderCodex();
    // pausa el juego mientras el códice está abierto (sin pisar modales/dado)
    if (world.level && !world.over) {
      if (codexVisible) world.busy = true;
      else if ($('exit-modal').style.display === 'none' && $('dice-overlay').style.display === 'none')
        world.busy = false;
    }
  }
  $('btn-codex-close').onclick = () => toggleCodex(false);

  // ---------- fin ----------
  function showEnd(victoria, causa) {
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
    toggleBackpack, toggleLog, showInstintos,
    get flashT() { return flashT; },
  };
})();
