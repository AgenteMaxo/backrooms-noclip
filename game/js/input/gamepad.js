// Adaptador completo de mando: movimiento, acciones y cursor virtual.
(function () {
  'use strict';

  function init({ world, use3D, settings, input }) {
    const opts = window.Options.valores;
    const usa3D = () => typeof use3D === 'function' ? use3D() : use3D;
    let virtualCursor = null;
    let cursorX = window.innerWidth / 2;
    let cursorY = window.innerHeight / 2;
    let acceptDown = false;
    let dragTarget = null;
    let usingGamepad = false;
    let wasUiOpen = false;
    let lastStepAt = 0;
    const previousButtons = [];

    function hideCursor() {
      usingGamepad = false;
      window.Controllers?.setDevice('keyboard');
      if (virtualCursor) virtualCursor.style.display = 'none';
      document.getElementById('no-cursor-style')?.remove();
    }

    document.addEventListener('mousemove', hideCursor);
    document.addEventListener('mousedown', hideCursor);
    document.addEventListener('wheel', hideCursor);
    window.addEventListener('keydown', () => window.Controllers?.setDevice('keyboard'));
    window.addEventListener('gamepaddisconnected', () => window.Controllers?.clearGamepad());

    function guardarBotones(buttons) {
      previousButtons.length = buttons.length;
      for (let i = 0; i < buttons.length; i++) previousButtons[i] = !!buttons[i]?.pressed;
    }

    function mandoActivo() {
      if (!navigator.getGamepads) return null;
      const gamepads = navigator.getGamepads();
      for (let i = 0; i < gamepads.length; i++) if (gamepads[i]) return gamepads[i];
      return null;
    }

    function mostrarUsoDeMando(gamepad) {
      if (!usingGamepad) {
        let style = document.getElementById('no-cursor-style');
        if (!style) {
          style = document.createElement('style');
          style.id = 'no-cursor-style';
          style.textContent = '* { cursor: none !important; }';
          document.head.appendChild(style);
        }
      }
      usingGamepad = true;
      window.Controllers?.setGamepad(gamepad);
    }

    function obtenerCursor() {
      if (virtualCursor) return virtualCursor;
      virtualCursor = document.getElementById('virtual-cursor');
      if (!virtualCursor) {
        virtualCursor = document.createElement('div');
        virtualCursor.id = 'virtual-cursor';
        document.body.appendChild(virtualCursor);
      }
      return virtualCursor;
    }

    function cursorFrame(dx, dy, pressed, justPressed) {
      const cursor = obtenerCursor();
      cursor.style.display = usingGamepad ? 'block' : 'none';
      if (dx || dy) {
        cursorX = Math.max(0, Math.min(window.innerWidth, cursorX + dx * opts.cursorSpeed));
        cursorY = Math.max(0, Math.min(window.innerHeight, cursorY + dy * opts.cursorSpeed));
        cursor.style.left = `${cursorX}px`;
        cursor.style.top = `${cursorY}px`;
      }

      const target = document.elementFromPoint(cursorX, cursorY);
      const accept = opts.gamepadMap.interact;
      if (justPressed(accept)) {
        acceptDown = true;
        cursor.classList.add('vc-active');
        target?.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true, cancelable: true, clientX: cursorX, clientY: cursorY,
        }));
        dragTarget = target;
      } else if (pressed(accept) && (dx || dy) && acceptDown) {
        target?.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true, cancelable: true, clientX: cursorX, clientY: cursorY,
        }));
      } else if (!pressed(accept) && acceptDown) {
        acceptDown = false;
        cursor.classList.remove('vc-active');
        target?.dispatchEvent(new MouseEvent('mouseup', {
          bubbles: true, cancelable: true, clientX: cursorX, clientY: cursorY,
        }));
        if (target && dragTarget === target) target.dispatchEvent(new MouseEvent('click', {
          bubbles: true, cancelable: true, clientX: cursorX, clientY: cursorY,
        }));
        dragTarget = null;
      }

      if (justPressed(opts.gamepadMap.menu) || justPressed(opts.gamepadMap.backpack)) {
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
      }
    }

    function ocultarCursorActivo() {
      if (!virtualCursor || virtualCursor.style.display !== 'block') return;
      virtualCursor.style.display = 'none';
      if (!acceptDown) return;
      acceptDown = false;
      virtualCursor.classList.remove('vc-active');
      dragTarget?.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true, cancelable: true, clientX: cursorX, clientY: cursorY,
      }));
      dragTarget = null;
    }

    function movimientoOffline(dx, dy, now, thirdPerson) {
      if (world.online || (!dx && !dy) || now - lastStepAt < 150) return;
      lastStepAt = now;
      if (thirdPerson) {
        if (dy < -0.5) window.Game.avanzar(1);
        else if (dy > 0.5) window.Game.avanzar(-1);
        else window.Game.girar(dx > 0 ? 1 : (dx < 0 ? -1 : 0));
        return;
      }
      let moveX = dx > 0.5 ? 1 : (dx < -0.5 ? -1 : 0);
      let moveY = dy > 0.5 ? 1 : (dy < -0.5 ? -1 : 0);
      if (usa3D() && window.Render3D?.rot) {
        const angle = -window.Render3D.rot * Math.PI / 2;
        const rotatedX = Math.round(Math.cos(angle) * moveX - Math.sin(angle) * moveY);
        const rotatedY = Math.round(Math.sin(angle) * moveX + Math.cos(angle) * moveY);
        moveX = rotatedX;
        moveY = rotatedY;
      }
      window.Game.tryMove(moveX, moveY);
    }

    function acciones(justPressed, thirdPerson) {
      const map = opts.gamepadMap;
      if (justPressed(map.interact)) world.online ? window.Net?.accion() : window.Game.interact();
      if (justPressed(map.wait) && !world.online) window.Game.wait();
      if (justPressed(map.light)) world.online ? window.Net?.luzToggle() : window.Game.toggleLuz();
      if (justPressed(map.handL)) {
        if (thirdPerson || !usa3D()) {
          world.online ? window.Net?.usar(0) : window.Game.usarMano(0);
          world.ui.pulsarMano(0);
        } else window.Render3D.rotar(1);
      }
      if (justPressed(map.handR)) {
        if (thirdPerson || !usa3D()) {
          world.online ? window.Net?.usar(1) : window.Game.usarMano(1);
          world.ui.pulsarMano(1);
        } else window.Render3D.rotar(-1);
      }
      if (justPressed(map.backpack)) world.ui.toggleBackpack();
      if (justPressed(map.map)) window.Minimap.toggleBig();
      if (justPressed(map.log)) world.ui.toggleLog();
      if (justPressed(map.journal)) world.ui.toggleJournal();
      if (justPressed(map.codex)) world.ui.toggleCodex();
      if (justPressed(map.chat) && world.online) window.Net?.abrirChat();
      if (justPressed(map.menu)) document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    }

    function frame(now) {
      input.reset('gamepad');
      const gamepad = mandoActivo();
      if (!gamepad) return;
      const buttons = gamepad.buttons;
      const pressed = (index) => !!buttons[index]?.pressed;
      const justPressed = (index) => pressed(index) && !previousButtons[index];

      if (settings.isWaiting()) {
        for (let i = 0; i < buttons.length; i++) {
          if (justPressed(i)) { settings.capture(i); break; }
        }
        guardarBotones(buttons);
        return;
      }

      const axisX = gamepad.axes[0] || 0;
      const axisY = gamepad.axes[1] || 0;
      let dx = pressed(14) || axisX < -0.4 ? -1 : (pressed(15) || axisX > 0.4 ? 1 : 0);
      let dy = pressed(12) || axisY < -0.4 ? -1 : (pressed(13) || axisY > 0.4 ? 1 : 0);
      if (Math.abs(axisX) > 0.1) dx = axisX;
      if (Math.abs(axisY) > 0.1) dy = axisY;

      const uiOpen = settings.isAnyUiOpen();
      if (!uiOpen) input.set('gamepad', dx, dy);
      let anyButton = false;
      for (let i = 0; i < buttons.length; i++) if (pressed(i)) { anyButton = true; break; }
      if (anyButton || Math.abs(axisX) > 0.1 || Math.abs(axisY) > 0.1) mostrarUsoDeMando(gamepad);

      if (uiOpen && !wasUiOpen) {
        cursorX = window.innerWidth / 2;
        cursorY = window.innerHeight / 2;
      }
      wasUiOpen = uiOpen;
      if (uiOpen) cursorFrame(dx, dy, pressed, justPressed);
      else {
        ocultarCursorActivo();
        if (!world.level || world.over || world.busy) { guardarBotones(buttons); return; }
        const thirdPerson = usa3D() && window.Render3D?.modo === 'tercera';
        movimientoOffline(dx, dy, now, thirdPerson);
        acciones(justPressed, thirdPerson);
      }
      guardarBotones(buttons);
    }

    return { frame };
  }

  window.GamepadInput = { init };
})();
