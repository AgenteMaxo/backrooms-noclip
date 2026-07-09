// Pantalla de inicio: alijo seguro ↔ mochila de salida (lo que llevas a la partida).
(function () {
  const ICONOS = {
    agua_almendras: 'gota', botiquin: 'corazon', amuleto: 'estrella', linterna: 'linterna',
    tuberia: 'tuberia', trebol: 'trebol', detector: 'antena', llave_nivel: 'llave',
    fuego_griego: 'fuego', guante_paralisis: 'rayo', chaqueta: 'chaqueta',
    mascara_gas: 'mascara', botas_reforzadas: 'bota',
  };

  function $(id) { return document.getElementById(id); }
  function objeto(id) { return window.GAME_DATA?.objects?.[id]; }

  function datos() {
    const P = Game.Profiles;
    return { alijo: P.cargarAlijo().inv, loadout: P.cargarLoadout() };
  }

  function guardar(alijo, loadout) {
    Game.Profiles.guardarAlijo(alijo);
    Game.Profiles.guardarLoadout(loadout.inv, loadout.manos, loadout.equipo);
  }

  function parseRef(s) {
    const i = s.indexOf(':');
    if (i < 0) return { zona: s, idx: '' };
    return { zona: s.slice(0, i), idx: s.slice(i + 1) };
  }

  function idxEn(arr, idx) {
    const n = parseInt(idx, 10);
    if (Number.isNaN(n) || n < 0 || n >= arr.length) return null;
    const v = arr[n];
    return v != null && v !== '' ? v : null;
  }

  function idEn(alijo, loadout, ref) {
    if (!ref) return null;
    const { zona, idx } = ref;
    if (zona === 'alijo') return idxEn(alijo, idx);
    if (zona === 'inv') return idxEn(loadout.inv, idx);
    if (zona === 'mano') {
      const m = parseInt(idx, 10);
      if (loadout.manos[1] === '=') return loadout.manos[0];
      const v = loadout.manos[m];
      return v && v !== '=' ? v : null;
    }
    if (zona === 'eq') return loadout.equipo[idx] || null;
    return null;
  }

  function quitarDe(alijo, loadout, ref) {
    const id = idEn(alijo, loadout, ref);
    if (!id) return null;
    const { zona, idx } = ref;
    if (zona === 'alijo') { alijo.splice(parseInt(idx, 10), 1); return id; }
    if (zona === 'inv') { loadout.inv.splice(parseInt(idx, 10), 1); return id; }
    if (zona === 'mano') {
      if (loadout.manos[1] === '=') loadout.manos = [null, null];
      else loadout.manos[parseInt(idx, 10)] = null;
      return id;
    }
    if (zona === 'eq') { loadout.equipo[idx] = null; return id; }
    return null;
  }

  function manoLibre(loadout) {
    if (loadout.manos[1] === '=') return -1;
    if (!loadout.manos[0]) return 0;
    if (!loadout.manos[1]) return 1;
    return -1;
  }

  function colocarEn(alijo, loadout, ref, id) {
    if (!ref || !id) return false;
    const def = objeto(id);
    let { zona, idx } = ref;

    if (zona === 'alijo') {
      if (alijo.length >= Inventario.CAP_ALIJO) return false;
      alijo.push(id);
      return true;
    }
    if (zona === 'inv') {
      if (loadout.inv.length >= Inventario.CAP_MOCHILA) return false;
      loadout.inv.push(id);
      return true;
    }
    if (zona === 'mano') {
      if (!def?.manos) return false;
      if (def.manos === 2) {
        if (loadout.manos[0] || loadout.manos[1]) return false;
        loadout.manos = [id, '='];
        return true;
      }
      if (loadout.manos[1] === '=') return false;
      let m = idx !== '' ? parseInt(idx, 10) : manoLibre(loadout);
      if (m < 0 || loadout.manos[m]) return false;
      loadout.manos[m] = id;
      return true;
    }
    if (zona === 'eq') {
      if (!def?.equipo) return false;
      const tipo = idx || def.equipo;
      if (def.equipo !== tipo) return false;
      const prev = loadout.equipo[tipo];
      loadout.equipo[tipo] = id;
      if (prev) loadout.inv.push(prev);
      return true;
    }
    return false;
  }

  function mismoSitio(origen, destino) {
    if (origen === destino) return true;
    const o = parseRef(origen);
    const d = parseRef(destino);
    if (!o || !d || o.zona !== d.zona) return false;
    if (o.zona === 'alijo' || o.zona === 'inv') return d.idx === '' || d.idx === o.idx;
    if (o.zona === 'mano') {
      const { loadout } = datos();
      if (loadout.manos[1] === '=') return true;
      return d.idx === '' || d.idx === o.idx;
    }
    if (o.zona === 'eq') return !d.idx || d.idx === o.idx;
    return false;
  }

  function partidaActiva() {
    const w = Game.world;
    if (w.level && !w.over) return true;
    if (Game.loadSave && Game.loadSave()) return true;
    return false;
  }

  function soltar(origen, destino) {
    if (partidaActiva()) return;
    if (!origen || !destino || mismoSitio(origen, destino)) return;
    let o = parseRef(origen);
    const d = parseRef(destino);
    if (!o || !d) return;

    const { alijo, loadout } = datos();
    if (o.zona === 'mano' && loadout.manos[1] === '=') o = { zona: 'mano', idx: '0' };

    const id = idEn(alijo, loadout, o);
    if (!id) return;

    const bak = {
      alijo: [...alijo],
      inv: [...loadout.inv],
      manos: [...loadout.manos],
      equipo: { ...loadout.equipo },
    };
    quitarDe(alijo, loadout, o);
    if (!colocarEn(alijo, loadout, d, id)) {
      alijo.length = 0;
      alijo.push(...bak.alijo);
      loadout.inv = [...bak.inv];
      loadout.manos = [...bak.manos];
      loadout.equipo = { ...bak.equipo };
      return;
    }
    guardar(alijo, loadout);
    pintar();
  }

  function crearSlot(cont, opts) {
    const { id, titulo, drag, extraClass, onClick } = opts;
    const slot = document.createElement('div');
    slot.className = 'title-inv-slot' + (id ? '' : ' vacia') + (extraClass ? ' ' + extraClass : '');
    if (id) {
      const def = objeto(id);
      const ic = ICONOS[id] || 'interrogante';
      if (window.Icons) {
        const icEl = Icons.img(ic, 22);
        icEl.draggable = false;
        slot.appendChild(icEl);
      }
      slot.title = def ? `${titulo}: ${def.nombre}` : titulo;
      if (drag) {
        slot.draggable = true;
        slot.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', drag);
          e.stopPropagation();
        });
      }
      if (onClick) slot.onclick = onClick;
    } else {
      slot.title = titulo;
    }
    cont.appendChild(slot);
    return slot;
  }

  let zonasCableadas = false;
  function cablearZonas() {
    if (zonasCableadas) return;
    zonasCableadas = true;
    const box = $('title-inventory');
    if (!box) return;

    box.addEventListener('dragover', (e) => {
      const z = e.target.closest('.title-drop-zone');
      if (!z) return;
      e.preventDefault();
      for (const el of box.querySelectorAll('.title-drop-zone.sobre')) el.classList.remove('sobre');
      z.classList.add('sobre');
    });
    box.addEventListener('dragleave', (e) => {
      const z = e.target.closest('.title-drop-zone');
      if (z && !z.contains(e.relatedTarget)) z.classList.remove('sobre');
    });
    box.addEventListener('drop', (e) => {
      const z = e.target.closest('.title-drop-zone');
      if (!z) return;
      e.preventDefault();
      e.stopPropagation();
      for (const el of box.querySelectorAll('.title-drop-zone.sobre')) el.classList.remove('sobre');
      const origen = e.dataTransfer.getData('text/plain');
      if (origen) soltar(origen, z.dataset.zone);
    });
  }

  function moverAlijoAloadout(i) {
    soltar(`alijo:${i}`, 'inv');
  }

  function moverLoadoutAalijo(i) {
    soltar(`inv:${i}`, 'alijo');
  }

  function guardarTodo() {
    if (partidaActiva()) return;
    const { alijo, loadout } = datos();
    while (loadout.inv.length && alijo.length < Inventario.CAP_ALIJO) {
      alijo.push(loadout.inv.shift());
    }
    if (loadout.manos[1] === '=' && loadout.manos[0] && alijo.length < Inventario.CAP_ALIJO) {
      alijo.push(loadout.manos[0]);
      loadout.manos = [null, null];
    } else {
      for (let m = 0; m < 2; m++) {
        const id = loadout.manos[m];
        if (!id || id === '=') continue;
        if (alijo.length >= Inventario.CAP_ALIJO) break;
        loadout.manos[m] = null;
        alijo.push(id);
      }
    }
    for (const tipo of ['cara', 'cuerpo', 'pies']) {
      const id = loadout.equipo[tipo];
      if (!id || alijo.length >= Inventario.CAP_ALIJO) continue;
      loadout.equipo[tipo] = null;
      alijo.push(id);
    }
    guardar(alijo, loadout);
    pintar();
  }

  function llevarTodo() {
    if (partidaActiva()) return;
    const { alijo, loadout } = datos();
    while (alijo.length && loadout.inv.length < Inventario.CAP_MOCHILA) {
      loadout.inv.push(alijo.shift());
    }
    guardar(alijo, loadout);
    pintar();
  }

  function pintar() {
    cablearZonas();
    const box = $('title-inventory');
    if (!box) return;
    const p = Game.Profiles.get();
    box.style.display = p ? 'block' : 'none';
    if (!p) return;

    const bloqueado = partidaActiva();
    box.classList.toggle('title-inv-bloqueado', bloqueado);
    const lock = $('title-inv-lock');
    if (lock) lock.style.display = bloqueado ? 'block' : 'none';
    const bs = $('btn-stash-all');
    const bl = $('btn-loadout-all');
    const { alijo, loadout } = datos();
    if (bs) bs.disabled = bloqueado;
    if (bl) bl.disabled = bloqueado || (alijo.length > 0 && loadout.inv.length >= Inventario.CAP_MOCHILA);

    const alijoEl = $('title-alijo-slots');
    const loadEl = $('title-loadout-slots');
    const manoEl = $('title-mano-slots');
    const eqEl = $('title-eq-slots');
    const warn = $('title-inv-warn');
    if (!alijoEl || !loadEl) return;

    alijoEl.innerHTML = '';
    loadEl.innerHTML = '';
    if (manoEl) manoEl.innerHTML = '';
    if (eqEl) eqEl.innerHTML = '';

    for (let i = 0; i < Inventario.CAP_ALIJO; i++) {
      const id = alijo[i];
      crearSlot(alijoEl, {
        id, titulo: 'Alijo vacío',
        drag: !bloqueado && id ? `alijo:${i}` : null,
        onClick: !bloqueado && id ? () => moverAlijoAloadout(i) : null,
      });
    }
    for (let i = 0; i < Inventario.CAP_MOCHILA; i++) {
      const id = loadout.inv[i];
      crearSlot(loadEl, {
        id, titulo: 'Ranura vacía',
        drag: !bloqueado && id ? `inv:${i}` : null,
        onClick: !bloqueado && id ? () => moverLoadoutAalijo(i) : null,
      });
    }

    if (manoEl) {
      const dosManos = loadout.manos[1] === '=';
      for (let m = 0; m < 2; m++) {
        const id = dosManos ? loadout.manos[0] : (loadout.manos[m] === '=' ? null : loadout.manos[m]);
        const titulo = m === 0 ? 'Mano izquierda (Q)' : 'Mano derecha (E)';
        crearSlot(manoEl, {
          id,
          titulo: dosManos && m === 1 ? 'Mano derecha — agarrada al arma' : titulo,
          drag: !bloqueado && id ? `mano:${m}` : null,
          extraClass: dosManos && m === 1 ? 'atado' : '',
          onClick: !bloqueado && id ? () => soltar(`mano:${m}`, 'inv') : null,
        });
      }
    }

    if (eqEl) {
      for (const tipo of ['cara', 'cuerpo', 'pies']) {
        const id = loadout.equipo[tipo];
        if (id) {
          crearSlot(eqEl, {
            id,
            titulo: tipo,
            drag: bloqueado ? null : `eq:${tipo}`,
            extraClass: 'title-wear-slot',
            onClick: bloqueado ? null : () => soltar(`eq:${tipo}`, 'inv'),
          });
        } else {
          const slot = document.createElement('div');
          slot.className = 'title-inv-slot title-wear-slot vacia';
          slot.title = `Ranura de ${tipo} vacía`;
          const ph = document.createElement('span');
          ph.className = 'eq-ph';
          ph.textContent = tipo;
          slot.appendChild(ph);
          eqEl.appendChild(slot);
        }
      }
    }

    $('title-alijo-count').textContent = `${alijo.length}/${Inventario.CAP_ALIJO}`;
    $('title-loadout-count').textContent = `${loadout.inv.length}/${Inventario.CAP_MOCHILA}`;
    const hayCarga = loadout.inv.length > 0 || Inventario.cuentaTotal([], loadout.manos, loadout.equipo) > 0;
    if (warn) warn.style.display = bloqueado ? 'none' : (hayCarga ? 'block' : 'none');
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

  window.TitleStash = {
    pintar, syncDesdeServidor, payloadHola, guardarTodo, llevarTodo, partidaActiva,
  };
})();
