// Pantalla de inicio: alijo seguro ↔ mochila de salida (lo que llevas a la partida).
(function () {
  const ICONOS = {
    agua_almendras: 'gota', botiquin: 'corazon', amuleto: 'estrella', linterna: 'linterna',
    tuberia: 'tuberia', trebol: 'trebol', detector: 'antena', llave_nivel: 'llave',
    fuego_griego: 'fuego', guante_paralisis: 'rayo', chaqueta: 'chaqueta',
    mascara_gas: 'mascara', botas_reforzadas: 'bota',
  };

  function $(id) { return document.getElementById(id); }

  function datos() {
    const P = Game.Profiles;
    const alijo = P.cargarAlijo().inv;
    const loadout = P.cargarLoadout();
    return { alijo, loadout };
  }

  function guardar(alijo, loadout) {
    Game.Profiles.guardarAlijo(alijo);
    Game.Profiles.guardarLoadout(loadout.inv, loadout.manos, loadout.equipo);
  }

  function pintarSlot(cont, id, titulo, onClick) {
    const slot = document.createElement('div');
    slot.className = 'title-inv-slot' + (id ? '' : ' vacia');
    if (id) {
      const def = window.GAME_DATA?.objects[id];
      const ic = ICONOS[id] || 'interrogante';
      if (window.Icons) slot.appendChild(Icons.img(ic, 22));
      slot.title = def ? `${titulo}: ${def.nombre}` : titulo;
      slot.onclick = onClick;
    } else {
      slot.title = titulo;
    }
    cont.appendChild(slot);
  }

  function moverAlijoAloadout(i) {
    const { alijo, loadout } = datos();
    const id = alijo[i];
    if (!id) return;
    if (Inventario.espacioLibre(loadout.inv, loadout.manos, loadout.equipo) <= 0) return;
    alijo.splice(i, 1);
    loadout.inv.push(id);
    guardar(alijo, loadout);
    pintar();
  }

  function moverLoadoutAalijo(i) {
    const { alijo, loadout } = datos();
    const id = loadout.inv[i];
    if (!id) return;
    if (alijo.length >= Inventario.CAP_ALIJO) return;
    loadout.inv.splice(i, 1);
    alijo.push(id);
    guardar(alijo, loadout);
    pintar();
  }

  function guardarTodo() {
    const { alijo, loadout } = datos();
    while (loadout.inv.length && alijo.length < Inventario.CAP_ALIJO) {
      alijo.push(loadout.inv.shift());
    }
    guardar(alijo, loadout);
    pintar();
  }

  function llevarTodo() {
    const { alijo, loadout } = datos();
    while (alijo.length && Inventario.espacioLibre(loadout.inv, loadout.manos, loadout.equipo) > 0) {
      loadout.inv.push(alijo.shift());
    }
    guardar(alijo, loadout);
    pintar();
  }

  function pintar() {
    const box = $('title-inventory');
    if (!box) return;
    const p = Game.Profiles.get();
    box.style.display = p ? 'block' : 'none';
    if (!p) return;

    const { alijo, loadout } = datos();
    const libre = Inventario.espacioLibre(loadout.inv, loadout.manos, loadout.equipo);
    const alijoEl = $('title-alijo-slots');
    const loadEl = $('title-loadout-slots');
    const warn = $('title-inv-warn');
    if (!alijoEl || !loadEl) return;

    alijoEl.innerHTML = '';
    loadEl.innerHTML = '';
    for (let i = 0; i < Inventario.CAP_ALIJO; i++) {
      pintarSlot(alijoEl, alijo[i], 'Alijo vacío', alijo[i] ? () => moverAlijoAloadout(i) : null);
    }
    for (let i = 0; i < Inventario.CAP_MOCHILA; i++) {
      pintarSlot(loadEl, loadout.inv[i], 'Ranura vacía', loadout.inv[i] ? () => moverLoadoutAalijo(i) : null);
    }

    $('title-alijo-count').textContent = `${alijo.length}/${Inventario.CAP_ALIJO}`;
    $('title-loadout-count').textContent = `${loadout.inv.length + (Inventario.CAP_MOCHILA - libre) - loadout.inv.length}/${Inventario.CAP_MOCHILA}`;
    // cuenta total en loadout (manos/equipo suelen ir vacíos en el título)
    const totalLlevar = Inventario.cuentaTotal(loadout.inv, loadout.manos, loadout.equipo);
    $('title-loadout-count').textContent = `${totalLlevar}/${Inventario.CAP_MOCHILA}`;

    if (warn) {
      warn.style.display = totalLlevar > 0 ? 'block' : 'none';
    }
  }

  function syncDesdeServidor(alijoInv, inv, manos, equipo) {
    if (Array.isArray(alijoInv)) Game.Profiles.guardarAlijo(alijoInv);
    Game.Profiles.guardarLoadout(inv || [], manos || [null, null], equipo || Inventario.vacio().equipo);
    pintar();
  }

  function payloadHola() {
    const alijo = Game.Profiles.cargarAlijo().inv;
    const l = Game.Profiles.cargarLoadout();
    return { alijo, loadout: { inv: l.inv, manos: l.manos, equipo: l.equipo } };
  }

  window.TitleStash = { pintar, syncDesdeServidor, payloadHola, guardarTodo, llevarTodo };
})();
