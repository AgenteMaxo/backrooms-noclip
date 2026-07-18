// Interfaz del Taller de Mods. El contenido se instala desde la portada,
// pero el runtime queda bloqueado fuera de UN JUGADOR.
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  let selectedId = null;
  let preview = null;

  function addModeGuards() {
    const online = document.getElementById('btn-start');
    const offline = document.getElementById('btn-offline');
    online?.addEventListener('click', () => { window.MODO_LOCAL = false; ModRuntime?.setOfflineMode(false); }, true);
    offline?.addEventListener('click', () => { window.MODO_LOCAL = true; ModRuntime?.setOfflineMode(true); }, true);
  }

  function buildButton() {
    if (document.getElementById('btn-mod-workshop')) return;
    const offline = document.getElementById('btn-offline');
    if (!offline) return;
    const button = document.createElement('button');
    button.id = 'btn-mod-workshop';
    button.className = 'btn-mode btn-mode-mods';
    button.type = 'button';
    button.title = 'Contenido local: nunca se aplica al multijugador';
    button.innerHTML = '<span class="btn-mode-title">MODS · TALLER ALPHA</span><span class="btn-mode-sub">modelos Blockbench · solo UN JUGADOR</span>';
    offline.insertAdjacentElement('afterend', button);
    button.addEventListener('click', open);
  }

  function buildPanel() {
    if (document.getElementById('mod-workshop')) return;
    const panel = el('div', 'mod-workshop');
    panel.id = 'mod-workshop';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="mod-workshop-box" role="dialog" aria-modal="true" aria-labelledby="mod-workshop-title">
        <button class="mod-close" type="button" aria-label="Cerrar">×</button>
        <header>
          <p class="mod-kicker">ARCHIVO LOCAL · SIN CONEXIÓN</p>
          <h2 id="mod-workshop-title">Taller de Mods</h2>
          <p>Los modelos se guardan en este navegador y solo se montan en <b>UN JUGADOR</b>. Nunca se transmiten al servidor MMO.</p>
        </header>
        <div class="mod-toolbar">
          <label class="btn-small mod-import">IMPORTAR<input id="mod-file" type="file" accept=".brmod,.bbmodel,.glb,.gltf,application/json" hidden></label>
          <button id="mod-example" class="btn-small" type="button">INSTALAR EJEMPLO</button>
          <a class="btn-small" href="assets/tools/backrooms_no_clip_exporter.js" download="backrooms_no_clip_exporter.js">PLUGIN BLOCKBENCH</a>
        </div>
        <p id="mod-status" class="mod-status" aria-live="polite"></p>
        <div class="mod-grid">
          <section class="mod-library"><h3>Biblioteca</h3><div id="mod-list"></div></section>
          <section class="mod-inspector">
            <canvas id="mod-preview" width="480" height="320"></canvas>
            <div id="mod-detail" class="mod-detail"><p>Importa o selecciona un mod.</p></div>
          </section>
        </div>
      </div>`;
    document.body.appendChild(panel);
    $('.mod-close', panel).addEventListener('click', close);
    panel.addEventListener('pointerdown', (ev) => { if (ev.target === panel) close(); });
    $('#mod-file', panel).addEventListener('change', async (ev) => {
      const file = ev.target.files?.[0];
      ev.target.value = '';
      if (!file) return;
      try { setStatus('Leyendo archivo…'); const rec = await ModSystem.installFile(file); selectedId = rec.id; setStatus(`Instalado: ${rec.name}`); await render(); }
      catch (err) { setStatus(err.message || String(err), true); }
    });
    $('#mod-example', panel).addEventListener('click', async () => {
      try { const rec = await ModSystem.installExample(); selectedId = rec.id; setStatus('Ejemplo instalado.'); await render(); }
      catch (err) { setStatus(err.message || String(err), true); }
    });
    initPreview();
  }

  function setStatus(text, error = false) {
    const node = document.getElementById('mod-status');
    if (!node) return;
    node.textContent = text;
    node.classList.toggle('is-error', !!error);
  }

  async function render() {
    const list = document.getElementById('mod-list');
    if (!list) return;
    const mods = await ModSystem.list();
    if (selectedId && !mods.some((m) => m.id === selectedId)) selectedId = mods[0]?.id || null;
    if (!selectedId) selectedId = mods[0]?.id || null;
    list.innerHTML = '';
    if (!mods.length) list.append(el('p', 'mod-empty', 'No hay mods instalados.'));
    for (const mod of mods) {
      const card = el('button', `mod-card${mod.id === selectedId ? ' is-selected' : ''}`);
      card.type = 'button';
      card.innerHTML = `<span class="mod-card-name"></span><span class="mod-card-meta"></span><span class="mod-card-state"></span>`;
      $('.mod-card-name', card).textContent = mod.name;
      $('.mod-card-meta', card).textContent = `${mod.author} · v${mod.version}`;
      $('.mod-card-state', card).textContent = mod.enabled ? 'ACTIVO' : 'DESACTIVADO';
      card.addEventListener('click', () => { selectedId = mod.id; render(); });
      list.append(card);
    }
    await renderDetail(selectedId ? mods.find((m) => m.id === selectedId) : null);
  }

  async function renderDetail(mod) {
    const detail = document.getElementById('mod-detail');
    if (!detail) return;
    clearPreview();
    if (!mod) { detail.innerHTML = '<p>Importa o selecciona un mod.</p>'; return; }
    const runtimeItems = (mod.manifest.content || []).filter((x) => ModSystem.isRuntimeType(x.type));
    detail.innerHTML = '';
    const title = el('h3', '', mod.name);
    const desc = el('p', 'mod-description', mod.manifest.description || 'Sin descripción.');
    const facts = el('dl', 'mod-facts');
    const addFact = (a, b) => { facts.append(el('dt', '', a), el('dd', '', b)); };
    addFact('ID', mod.id); addFact('Contenido', (mod.manifest.content || []).map((x) => x.type).join(', ')); addFact('Runtime alpha', runtimeItems.length ? 'objetos visuales offline' : 'solo importación y previsualización');
    const actions = el('div', 'mod-actions');
    const toggle = el('button', 'btn-small', mod.enabled ? 'DESACTIVAR' : 'ACTIVAR');
    const test = el('button', 'btn-small', 'PROBAR EN PRÓXIMA PARTIDA');
    const del = el('button', 'btn-small mod-danger', 'ELIMINAR');
    toggle.addEventListener('click', async () => { await ModSystem.setEnabled(mod.id, !mod.enabled); await render(); });
    test.disabled = !runtimeItems.length;
    test.addEventListener('click', async () => { await ModSystem.setEnabled(mod.id, true); await ModSystem.setPreviewNext(mod.id, true); setStatus('Listo: inicia UN JUGADOR para ver el modelo cerca del comienzo.'); await render(); });
    del.addEventListener('click', async () => { if (!confirm(`¿Eliminar «${mod.name}» de este navegador?`)) return; await ModSystem.remove(mod.id); selectedId = null; await render(); });
    actions.append(toggle, test, del);
    detail.append(title, desc, facts, actions);
    const first = runtimeItems[0] || mod.manifest.content?.[0];
    if (first) {
      try { const object = await ModRuntime.createObject(mod, first); showPreview(object); }
      catch (err) { setStatus(`Previsualización: ${err.message}`, true); }
    }
  }

  function initPreview() {
    const canvas = document.getElementById('mod-preview');
    if (!canvas || !window.THREE) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(canvas.width, canvas.height, false);
    renderer.outputEncoding = THREE.sRGBEncoding;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, canvas.width / canvas.height, 0.05, 100);
    camera.position.set(2.8, 2.1, 3.2);
    scene.add(new THREE.HemisphereLight(0xfff2cb, 0x1b1814, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(2, 4, 3); scene.add(key);
    let object = null, dragging = false, lastX = 0;
    canvas.addEventListener('pointerdown', (ev) => { dragging = true; lastX = ev.clientX; canvas.setPointerCapture?.(ev.pointerId); });
    canvas.addEventListener('pointermove', (ev) => { if (!dragging || !object) return; object.rotation.y += (ev.clientX - lastX) * 0.012; lastX = ev.clientX; });
    canvas.addEventListener('pointerup', () => { dragging = false; });
    canvas.addEventListener('wheel', (ev) => { ev.preventDefault(); camera.position.multiplyScalar(ev.deltaY > 0 ? 1.08 : 0.92); }, { passive: false });
    const loop = () => { requestAnimationFrame(loop); renderer.render(scene, camera); };
    requestAnimationFrame(loop);
    preview = {
      scene, camera,
      set(obj) { if (object) scene.remove(object); object = obj; if (object) { scene.add(object); object.rotation.y = -0.5; } },
      clear() { if (object) scene.remove(object); object = null; },
    };
  }

  function showPreview(object) { preview?.set(object); }
  function clearPreview() { preview?.clear(); }

  async function open() {
    buildPanel();
    document.getElementById('mod-workshop').hidden = false;
    selectedId = selectedId || (await ModSystem.list())[0]?.id || null;
    setStatus('');
    await render();
  }
  function close() { const p = document.getElementById('mod-workshop'); if (p) p.hidden = true; clearPreview(); }

  addModeGuards();
  buildButton();
  buildPanel();
  window.addEventListener('backrooms-mods-changed', () => { if (!document.getElementById('mod-workshop')?.hidden) render(); });
  window.ModWorkshop = { open, close };
})();
