// Códice, historial y colección del perfil activo.
(function () {
  function create({ world, $, objectIcons }) {
    function silueta(glyph) {
      const sprite = Sprites.get(glyph, 0);
      if (!sprite) return null;
      const canvas = document.createElement('canvas');
      canvas.width = sprite.width;
      canvas.height = sprite.height;
      const context = canvas.getContext('2d');
      context.drawImage(sprite, 0, 0);
      context.globalCompositeOperation = 'source-in';
      context.fillStyle = '#15130e';
      context.fillRect(0, 0, canvas.width, canvas.height);
      return canvas.toDataURL();
    }

    function renderColeccion(profile) {
      const discovered = profile.descubiertos || { salidas: {}, entidades: {}, objetos: {} };
      const entitiesElement = $('codex-entidades');
      entitiesElement.innerHTML = '';
      let seenEntities = 0;
      const entities = Object.values(world.data.entities);

      for (const definition of entities) {
        const seen = !!discovered.entidades[definition.id];
        if (seen) seenEntities++;
        const card = document.createElement('div');
        card.className = 'col-card' + (seen ? '' : ' col-locked');
        const sprite = seen ? Sprites.get(definition.glyph, 0) : null;
        const image = document.createElement('img');
        image.className = 'icono';
        image.style.width = image.style.height = '34px';
        image.src = sprite
          ? sprite.toDataURL()
          : (silueta(definition.glyph) || (window.Icons ? Icons.url('interrogante') : ''));
        card.appendChild(image);
        const name = document.createElement('div');
        name.textContent = seen ? definition.nombre : '???';
        card.appendChild(name);
        if (seen) card.title = definition.descripcion || definition.nombre;
        agregarEnlaceWiki(card, seen && definition.url, definition.url);
        entitiesElement.appendChild(card);
      }
      $('cdx-n-ent').textContent = `${seenEntities}/${entities.length}`;

      const objectsElement = $('codex-objetos');
      objectsElement.innerHTML = '';
      let seenObjects = 0;
      const objects = Object.values(world.data.objects);
      for (const definition of objects) {
        const seen = !!discovered.objetos[definition.id];
        if (seen) seenObjects++;
        const card = document.createElement('div');
        card.className = 'col-card' + (seen ? '' : ' col-locked');
        if (window.Icons) {
          card.appendChild(Icons.img(
            seen ? (objectIcons[definition.id] || 'interrogante') : 'interrogante',
            32
          ));
        }
        const name = document.createElement('div');
        name.textContent = seen ? definition.nombre : '???';
        card.appendChild(name);
        if (seen) card.title = definition.descripcion || definition.nombre;
        agregarEnlaceWiki(card, seen && definition.url, definition.url);
        objectsElement.appendChild(card);
      }
      $('cdx-n-obj').textContent = `${seenObjects}/${objects.length}`;

      const exitsElement = $('codex-salidas');
      exitsElement.innerHTML = '';
      let totalExits = 0;
      let discoveredExits = 0;
      for (const id of Object.keys(profile.codice)) {
        const level = world.data.levels[id];
        if (!level || !(level.salidas || []).length) continue;
        const found = level.salidas.filter((exit) => discovered.salidas[`${id}::${exit.texto}`]);
        totalExits += level.salidas.length;
        discoveredExits += found.length;
        const details = document.createElement('details');
        details.className = 'cdx-nivel';
        details.style.borderLeftColor = '#8a7a3d';
        const list = level.salidas.map((exit) =>
          discovered.salidas[`${id}::${exit.texto}`]
            ? `<li>${exit.texto}</li>`
            : '<li class="col-locked">??? — sin descubrir</li>'
        ).join('');
        details.innerHTML = `<summary><b>${level.wikiTitle}</b>
          <span class="meta-min">${found.length}/${level.salidas.length}</span></summary>
          <div class="cuerpo"><ul>${list}</ul></div>`;
        exitsElement.appendChild(details);
      }
      $('cdx-n-sal').textContent = totalExits ? `${discoveredExits}/${totalExits}` : '—';
      if (!exitsElement.children.length) {
        exitsElement.innerHTML = '<p class="codex-records">Explora niveles para catalogar sus salidas.</p>';
      }
    }

    function agregarEnlaceWiki(card, visible, url) {
      if (!visible || !window.Icons) return;
      const link = document.createElement('a');
      link.className = 'col-wiki';
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.title = 'Ficha real en la wiki ↗';
      link.appendChild(Icons.img('interrogante', 12));
      card.appendChild(link);
    }

    function renderizar() {
      const profiles = Game.Profiles;
      const profile = profiles.get();
      $('codex-name').textContent = profiles.activeName() || 'sin perfil';
      const recordsElement = $('codex-records');
      const levelsElement = $('codex-levels');
      const historyElement = $('codex-history');
      levelsElement.innerHTML = '';
      historyElement.innerHTML = '';
      if (!profile) {
        recordsElement.textContent = 'Crea un perfil para empezar tu expediente.';
        return;
      }

      const records = profile.records;
      recordsElement.textContent = `Expediciones: ${records.runs} · Récord de niveles en una expedición: ${records.maxNiveles} · Récord de turnos sobrevividos: ${records.maxTurnos} · Escapes logrados: ${records.escapes}`;
      const dangerColors = ['#3fae6a', '#8bb944', '#d9a531', '#e0742c', '#d94a35', '#a12744'];
      const entries = Object.entries(profile.codice).sort((a, b) => b[1].veces - a[1].veces);
      $('cdx-n-niveles').textContent = `${entries.length}/${Object.keys(world.data.levels).length}`;
      if (!entries.length) {
        levelsElement.innerHTML = '<p class="codex-records">Aún no has transitado ningún nivel.</p>';
      }
      for (const [id, stats] of entries) {
        const level = world.data.levels[id];
        if (!level) continue;
        const details = document.createElement('details');
        details.className = 'cdx-nivel';
        details.style.borderLeftColor = dangerColors[level.peligro] || '#888';
        const best = stats.mejorTurnos !== null
          ? ` · mejor travesía: ${stats.mejorTurnos} turnos`
          : ' · nunca lograste salir de él';
        details.innerHTML = `<summary><b>${level.nombre}</b>${stats.escapado ? ' ⭐' : ''}
          <span class="meta-min">peligro ${level.peligro}/5 · ${stats.veces}×</span></summary>
          <div class="cuerpo">
            <div class="meta">${level.clase} · bioma: ${level.bioma}</div>
            <div class="desc">${level.descripcion}</div>
            <div class="stats">Transitado ${stats.veces} ${stats.veces === 1 ? 'vez' : 'veces'}${best}${stats.escapado ? ' · ⭐ escapaste por aquí' : ''}</div>
            <a href="${level.url}" target="_blank" rel="noopener">ficha original en la wiki ↗</a>
          </div>`;
        levelsElement.appendChild(details);
      }

      const history = profile.historial || [];
      $('cdx-n-hist').textContent = history.length || '—';
      for (const entry of history) {
        const item = document.createElement('li');
        item.textContent = `${entry.fecha} · semilla «${entry.semilla}» · ${entry.niveles} niveles, ${entry.turnos} turnos · ${entry.resultado}`;
        historyElement.appendChild(item);
      }
      renderColeccion(profile);
    }

    let visible = false;
    function alternar(force) {
      visible = force !== undefined ? force : !visible;
      if (visible && document.pointerLockElement) document.exitPointerLock();
      $('codex-panel').style.display = visible ? 'flex' : 'none';
      if (visible) renderizar();
      if (world.level && !world.over) {
        if (visible) world.busy = true;
        else if ($('exit-modal').style.display === 'none' && $('dice-overlay').style.display === 'none') {
          world.busy = false;
        }
      }
    }

    if ($('btn-codex-close')) $('btn-codex-close').onclick = () => alternar(false);
    if ($('btn-codex-close-top')) $('btn-codex-close-top').onclick = () => alternar(false);
    $('codex-panel').onclick = (event) => {
      if (event.target === $('codex-panel') || event.target.classList.contains('codex-box-wrapper')) {
        alternar(false);
      }
    };

    return { alternar, renderizar };
  }

  window.UiCodex = { create };
})();
