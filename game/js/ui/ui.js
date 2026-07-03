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
    for (const [k, el] of Object.entries(screens))
      el.style.display = k === name ? 'flex' : 'none';
    if (name === 'game') screens.game.style.display = 'flex';
  }

  // ---------- registro ----------
  function log(msg, cls) {
    const logEl = $('game-log');
    const p = document.createElement('p');
    p.textContent = msg;
    if (cls) p.className = cls;
    logEl.prepend(p);
    while (logEl.children.length > 5) logEl.removeChild(logEl.lastChild);
  }

  // ---------- HUD ----------
  function updateHUD() {
    if (!world.player || !world.level) return;
    $('bar-salud').style.width = world.player.salud + '%';
    $('bar-cordura').style.width = world.player.cordura + '%';
    $('bar-sed').style.width = world.player.sed + '%';
    $('bar-hambre').style.width = world.player.hambre + '%';
    $('hud-level').textContent = `${world.level.wikiTitle} · Peligro ${world.level.peligro}/5`;
    $('hud-turn').textContent = `Turno ${world.turn}`;
    $('hud-seed').textContent = `🎲 ${world.runSeed}`;

    const inv = $('hud-inv');
    inv.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      const id = world.player.inv[i];
      if (id) {
        const def = world.data.objects[id];
        const ic = {
          agua_almendras: '🥤', botiquin: '🩹', linterna: '🔦', chaqueta: '🧥',
          amuleto: '🖼', llave_nivel: '🗝', tuberia: '🔧', fuego_griego: '🔥',
          guante_paralisis: '🧤', detector: '📡', trebol: '🍀',
        }[id] || '❓';
        slot.innerHTML = `<span class="k">${i + 1}</span><span class="n">${ic}</span>`;
        slot.title = `${def.nombre} — ${def.descripcion}`;
        if (id === 'linterna' && world.player.luz) slot.classList.add('active');
        slot.onclick = () => showItemInfo(i, ic);
      } else {
        slot.innerHTML = `<span class="k">${i + 1}</span>`;
      }
      inv.appendChild(slot);
    }
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
    if (e.pasivo === 'abrigo') partes.push('PASIVO: anula el daño por frío');
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
    $('item-icon').textContent = icono;
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
    btnUse.onclick = () => { cerrarItemInfo(); Game.useItem(slot); };
    $('btn-item-close').onclick = cerrarItemInfo;
    $('item-modal').style.display = 'flex';
  }
  function cerrarItemInfo() {
    $('item-modal').style.display = 'none';
    if ($('exit-modal').style.display === 'none' && $('dice-overlay').style.display === 'none')
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
    for (const rid of def.reglas || []) {
      const r = Rules.get(rid);
      if (!r) continue;
      const span = document.createElement('span');
      span.textContent = `${r.icono} ${r.nombre}`;
      span.title = r.desc;
      rulesEl.appendChild(span);
    }
    if (def.esEscape) {
      const span = document.createElement('span');
      span.textContent = '⭐ POSIBLE RUTA DE ESCAPE';
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
  function showDice(texto, cb) {
    const ov = $('dice-overlay'), face = $('dice-face');
    $('dice-text').textContent = texto;
    ov.style.display = 'flex';
    face.classList.add('rolling');
    let ticks = 0;
    const iv = setInterval(() => {
      face.textContent = 1 + Math.floor(Math.random() * 20);
      if (++ticks > 14) {
        clearInterval(iv);
        const result = 1 + Math.floor(Math.random() * 20);
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
    $('exit-modal').style.display = 'flex';
    $('exit-text').textContent = def.texto;
    const warn = $('exit-warn');
    const destinoNombre = def.destino && world.data.levels[def.destino]
      ? world.data.levels[def.destino].wikiTitle : null;
    if (def.tipo === 'escape') warn.textContent = '⭐ Parece un camino de vuelta a la realidad.';
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

  // ---------- códice del errante ----------
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
    if (!entries.length) lvEl.innerHTML = '<p class="codex-records">Aún no has transitado ningún nivel.</p>';
    for (const [id, c] of entries) {
      const lv = world.data.levels[id];
      if (!lv) continue;
      const div = document.createElement('div');
      div.className = 'codex-level';
      div.style.borderLeftColor = colores[lv.peligro] || '#888';
      const mejor = c.mejorTurnos !== null
        ? ` · mejor travesía: ${c.mejorTurnos} turnos` : ' · nunca lograste salir de él';
      div.innerHTML = `<h4>${lv.nombre}${c.escapado ? ' ⭐' : ''}</h4>
        <div class="meta">${lv.clase} · Peligro ${lv.peligro}/5 · bioma: ${lv.bioma}</div>
        <div class="desc">${lv.descripcion}</div>
        <div class="stats">Transitado ${c.veces} ${c.veces === 1 ? 'vez' : 'veces'}${mejor}${c.escapado ? ' · ⭐ escapaste por aquí' : ''}</div>
        <a href="${lv.url}" target="_blank" rel="noopener">ficha original en la wiki ↗</a>`;
      lvEl.appendChild(div);
    }
    for (const h of perfil.historial || []) {
      const li = document.createElement('li');
      li.textContent = `${h.fecha} · semilla «${h.semilla}» · ${h.niveles} niveles, ${h.turnos} turnos · ${h.resultado}`;
      hiEl.appendChild(li);
    }
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
    showExitModal, showLevelPicker, toggleJournal, showEnd, show, toggleCodex,
    get flashT() { return flashT; },
  };
})();
