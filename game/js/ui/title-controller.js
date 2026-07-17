// Portada, perfiles, conexión y música de menú.
(function () {
  'use strict';

  const TRACKS = [
    { id: 'menu1', titulo: 'Menú Tema 1', autor: '@cris_fon', archivo: 'assets/sounds/Menu/menu1.mp3' },
    { id: 'thehub', titulo: 'The Hub (Ambiente)', autor: 'Banda Sonora', archivo: 'assets/sounds/niveles/the-hub.mp3' },
    { id: 'ninguna', titulo: 'Ninguna (Silencio)', autor: '—', archivo: null },
  ];

  function init({ world, cargarOverrides, prepararRender }) {
    const byId = (id) => document.getElementById(id);
    const profiles = window.Game.Profiles;
    const opts = window.Options.valores;
    let connectionTimer = null;
    const fallScreen = byId('fall-screen');
    const reduceFall = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let fallStartedAt = 0;

    function showFall() {
      if (!fallScreen || reduceFall) return;
      const lines = byId('fall-lines');
      if (lines && !lines.childElementCount) {
        const total = 64;
        for (let index = 0; index < total; index++) {
          const ray = document.createElement('span');
          ray.className = 'ray';
          const angle = (index / total) * Math.PI * 2 + Math.random() * 0.2;
          ray.style.setProperty('--ang', `${angle.toFixed(3)}rad`);
          const stroke = document.createElement('i');
          stroke.style.animationDelay = `${(-Math.random() * 1.1).toFixed(2)}s`;
          stroke.style.opacity = (0.4 + Math.random() * 0.6).toFixed(2);
          ray.appendChild(stroke);
          lines.appendChild(ray);
        }
      }
      fallStartedAt = Date.now();
      fallScreen.hidden = false;
      void fallScreen.offsetWidth;
      fallScreen.classList.add('activa');
      try { window.Sfx?.play('caida'); } catch (error) {}
    }

    function hideFall(immediate) {
      if (!fallScreen || fallScreen.hidden) return;
      const delay = immediate ? 0 : Math.max(0, 2600 - (Date.now() - fallStartedAt));
      setTimeout(() => {
        fallScreen.classList.remove('activa');
        fallScreen.classList.add('saliendo');
        setTimeout(() => {
          fallScreen.hidden = true;
          fallScreen.classList.remove('saliendo');
        }, 400);
      }, delay);
    }

    function privateRoom() {
      return (byId('room-input')?.value || '').trim();
    }

    function validateRoom(room) {
      if (!room || /^[a-z0-9_-]{3,32}$/i.test(room)) return true;
      const error = byId('title-net');
      error.textContent = 'Código de sala privada inválido. Usa 3-32 letras, números, _ o -.';
      error.style.display = 'block';
      byId('room-input')?.focus();
      return false;
    }

    function playMusic() {
      if (byId('screen-title').style.display === 'none' || byId('btn-start').disabled) return;
      const track = TRACKS.find((item) => item.id === (opts.menuMusica || 'menu1')) || TRACKS[0];
      if (track.archivo) window.Sfx?.playMenu(track.archivo);
      else window.Sfx?.stopMenu();
    }

    function refresh() {
      const select = byId('profile-select');
      select.textContent = '';
      const names = profiles.list();
      for (const name of names) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        option.selected = name === profiles.activeName();
        select.appendChild(option);
      }
      if (!names.length) {
        const option = document.createElement('option');
        option.textContent = '— sin perfiles —';
        select.appendChild(option);
      }
      const profile = profiles.get();
      byId('profile-records').textContent = profile
        ? `Expediciones: ${profile.records.runs} · Niveles descubiertos: ${Object.keys(profile.codice).length} ` +
          `· Turnos récord: ${profile.records.maxTurnos} · Escapes: ${profile.records.escapes}`
        : 'Crea tu perfil para que el Códice registre tu expediente.';
      const save = window.Game.loadSave();
      const continueButton = byId('btn-continue');
      if (save && profile) {
        continueButton.style.display = 'inline-block';
        continueButton.textContent = `Continuar en servidor (${save.levelId})`;
        continueButton.onclick = () => connect(continueButton);
      } else continueButton.style.display = 'none';
      playMusic();
    }

    async function connect(originButton) {
      cargarOverrides();
      if (!profiles.activeName()) profiles.create(byId('profile-name').value.trim() || 'Errante');
      refresh();
      window.Sfx?.stopMenu();
      const room = privateRoom();
      if (!validateRoom(room)) return;
      const startButton = byId('btn-start');
      const continueButton = byId('btn-continue');
      const offlineButton = byId('btn-offline');
      const button = originButton || startButton;
      const error = byId('title-net');
      const buttonHtml = button.innerHTML;
      const continueText = continueButton.textContent;
      startButton.disabled = true;
      continueButton.disabled = true;
      offlineButton.disabled = true;
      button.textContent = 'PREPARANDO EL UMBRAL…';
      error.style.display = 'none';
      showFall();
      clearInterval(connectionTimer);
      await prepararRender();
      button.textContent = 'CRUZANDO LA REALIDAD…';
      window.Net.iniciar(profiles.activeName(), room || undefined);
      const startedAt = Date.now();
      connectionTimer = setInterval(() => {
        if (window.Net.activo) finishConnection();
        else if (window.Net.ultimoError || Date.now() - startedAt > 10000) {
          finishConnection();
          error.textContent = window.Net.ultimoError ||
            'No se pudo conectar con las Backrooms. ¿El servidor está despierto?';
          error.style.display = 'block';
        }
      }, 200);

      function finishConnection() {
        clearInterval(connectionTimer);
        connectionTimer = null;
        startButton.disabled = false;
        continueButton.disabled = false;
        offlineButton.disabled = false;
        continueButton.textContent = continueText;
        button.innerHTML = buttonHtml;
        if (window.Net.activo) error.style.display = 'none';
        hideFall(!window.Net.activo);
      }
    }

    function renderMusicList() {
      const list = byId('music-list');
      const current = opts.menuMusica || 'menu1';
      list.textContent = '';
      for (const track of TRACKS) {
        const item = document.createElement('div');
        item.className = `music-item${track.id === current ? ' active' : ''}`;
        const info = document.createElement('div');
        info.className = 'music-info';
        const title = document.createElement('div');
        title.className = 'music-title';
        title.textContent = track.titulo;
        const author = document.createElement('div');
        author.className = 'music-author';
        author.textContent = `por ${track.autor}`;
        const status = document.createElement('div');
        status.className = 'music-status';
        if (track.id === current) status.textContent = '🔊 SONANDO';
        info.appendChild(title);
        info.appendChild(author);
        item.appendChild(info);
        item.appendChild(status);
        item.onclick = () => {
          opts.menuMusica = track.id;
          window.Options.guardar();
          playMusic();
          renderMusicList();
        };
        list.appendChild(item);
      }
      byId('music-menu').style.display = 'flex';
    }

    byId('profile-select').onchange = (event) => { profiles.select(event.target.value); refresh(); };
    byId('btn-profile-create').onclick = () => {
      const input = byId('profile-name');
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      profiles.create(name);
      input.value = '';
      refresh();
    };
    byId('btn-profile-del').onclick = () => {
      const name = profiles.activeName();
      if (name && confirm(`¿Borrar el perfil «${name}» y todo su códice?`)) {
        profiles.remove(name);
        refresh();
      }
    };
    const exportButton = byId('btn-profile-export');
    if (exportButton) {
      exportButton.onclick = () => {
        const json = profiles.exportar();
        if (!json) return;
        const link = document.createElement('a');
        link.href = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
        link.download = `backrooms-perfil-${profiles.activeName()}.json`;
        link.click();
      };
    }
    const importButton = byId('btn-profile-import');
    const importInput = byId('profile-import-file');
    if (importButton && importInput) {
      importButton.onclick = () => importInput.click();
      importInput.onchange = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          if (profiles.importar(reader.result)) refresh();
          else alert('Ese archivo no parece un perfil válido.');
        };
        reader.readAsText(file);
        event.target.value = '';
      };
    }
    byId('btn-codex').onclick = () => world.ui.toggleCodex(true);
    byId('btn-changelog').onclick = () => {
      window.Changelog?.marcarVisto();
      world.ui.toggleChangelog(true);
    };
    byId('btn-music-menu')?.addEventListener('click', renderMusicList);
    byId('btn-music-close')?.addEventListener('click', () => { byId('music-menu').style.display = 'none'; });
    byId('btn-start').onclick = () => connect(byId('btn-start'));
    byId('btn-offline').onclick = () => {
      window.MODO_LOCAL = true;
      connect(byId('btn-offline'));
    };
    byId('btn-again').onclick = () => { refresh(); world.ui.show('title'); };
    byId('btn-journal-close').onclick = () => world.ui.toggleJournal();
    byId('btn-end-codex').onclick = () => world.ui.toggleCodex(true);
    byId('btn-end-title').onclick = () => { world.ui.show('title'); refresh(); };

    return { connect, playMusic, refresh };
  }

  window.TitleController = { init };
})();
