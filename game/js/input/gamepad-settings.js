// Menú y reasignación del mando. El sondeo del dispositivo vive en el
// adaptador de entrada; este módulo solo administra configuración y DOM.
(function () {
  'use strict';

  const ACTIONS = [
    ['interact', 'Interactuar / Aceptar / Cursor'],
    ['wait', 'Esperar un turno'],
    ['light', 'Encender/Apagar linterna'],
    ['handL', 'Usar mano izquierda (Q)'],
    ['handR', 'Usar mano derecha (E)'],
    ['backpack', 'Mochila'],
    ['map', 'Mapa (M/N)'],
    ['log', 'Registro (L)'],
    ['journal', 'Diario (J)'],
    ['codex', 'Códice (C)'],
    ['chat', 'Chat MMO (T)'],
    ['menu', 'Menú / Cerrar'],
  ];

  const UI_PANELS = [
    'backpack-panel', 'codex-panel', 'changelog-panel', 'journal-panel',
    'sound-menu', 'gamepad-menu',
  ];

  function init({ soundMenu, openSoundMenu }) {
    const opts = window.Options.valores;
    const menu = document.getElementById('gamepad-menu');
    const list = document.getElementById('gamepad-mapping-list');
    const waitMessage = document.getElementById('gamepad-wait-msg');
    const speed = document.getElementById('opt-cursor-speed');
    const speedValue = document.getElementById('opt-cursor-speed-v');
    let waitingAction = null;
    let openedFromSound = false;

    function updateSpeed() {
      if (speed) speed.value = opts.cursorSpeed;
      if (speedValue) speedValue.textContent = opts.cursorSpeed;
    }

    function render() {
      if (!list) return;
      list.textContent = '';
      for (const [id, label] of ACTIONS) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;' +
          'align-items:center;margin-bottom:6px';

        const text = document.createElement('span');
        text.textContent = label;
        const button = document.createElement('button');
        button.className = 'btn-small';
        button.style.cssText = 'margin-top:0;display:flex;align-items:center;gap:6px';

        const controllers = window.Controllers;
        if (controllers) {
          const buttonIndex = opts.gamepadMap[id];
          const glyph = controllers.buttonGlyph(buttonIndex, 18, controllers.activeGamepadType());
          glyph.style.marginTop = '-1px';
          button.appendChild(glyph);
          const name = document.createElement('span');
          name.textContent = controllers.buttonName(buttonIndex);
          button.appendChild(name);
        } else {
          button.textContent = `Botón ${opts.gamepadMap[id]}`;
        }

        button.onclick = () => {
          if (waitingAction) return;
          waitingAction = id;
          if (waitMessage) waitMessage.style.display = 'block';
          button.textContent = '...';
          button.style.color = 'var(--amarillo)';
        };
        row.appendChild(text);
        row.appendChild(button);
        list.appendChild(row);
      }
    }

    function open(fromSound) {
      openedFromSound = !!fromSound;
      if (openedFromSound && soundMenu) soundMenu.style.display = 'none';
      if (menu) menu.style.display = 'flex';
      updateSpeed();
      render();
    }

    function close() {
      if (menu) menu.style.display = 'none';
      waitingAction = null;
      if (waitMessage) waitMessage.style.display = 'none';
      if (openedFromSound) openSoundMenu();
      openedFromSound = false;
    }

    function capture(buttonIndex) {
      if (!waitingAction) return false;
      opts.gamepadMap[waitingAction] = buttonIndex;
      waitingAction = null;
      if (waitMessage) waitMessage.style.display = 'none';
      window.Options.guardar();
      render();
      return true;
    }

    document.getElementById('btn-gamepad-settings')?.addEventListener('click', () => open(true));
    document.getElementById('btn-gamepad-title')?.addEventListener('click', () => open(false));
    document.getElementById('btn-gamepad-close')?.addEventListener('click', close);
    document.getElementById('btn-gamepad-default')?.addEventListener('click', () => {
      window.Options.restaurarMando();
      updateSpeed();
      render();
    });
    if (speed) {
      speed.oninput = () => {
        opts.cursorSpeed = Number(speed.value);
        updateSpeed();
        window.Options.guardar();
      };
    }

    return {
      capture,
      close,
      isOpen: () => !!menu && menu.style.display !== 'none',
      isWaiting: () => !!waitingAction,
      isAnyUiOpen: () => UI_PANELS.some((id) => {
        const panel = document.getElementById(id);
        return panel && panel.style.display !== 'none';
      }),
    };
  }

  window.GamepadSettings = { init };
})();
