// Adaptador de controles táctiles. Traduce eventos del DOM a acciones del
// juego y al estado de entrada compartido; no contiene reglas de movimiento.
(function () {
  'use strict';

  function calcularVector(rect, clientX, clientY) {
    const radius = Math.max(1, rect.width / 2);
    let offsetX = clientX - (rect.left + radius);
    let offsetY = clientY - (rect.top + radius);
    const distance = Math.hypot(offsetX, offsetY);
    if (distance > radius) {
      offsetX = offsetX / distance * radius;
      offsetY = offsetY / distance * radius;
    }
    return {
      x: offsetX / radius,
      y: offsetY / radius,
      offsetX,
      offsetY,
    };
  }

  function bloquearGestos(capaTactil, gameWrap) {
    for (const element of [capaTactil, gameWrap]) {
      if (!element) continue;
      for (const eventName of ['contextmenu', 'selectstart', 'dragstart']) {
        element.addEventListener(eventName, (event) => {
          if (eventName === 'dragstart' &&
              event.target.closest('#backpack-panel, .mano-slot, .eq-slot, .inv-slot')) return;
          event.preventDefault();
        });
      }
    }
  }

  function init({ world, modoDpad, pasoOffline }) {
    const capaTactil = document.getElementById('touch-controls');
    bloquearGestos(capaTactil, document.getElementById('game-wrap'));
    if (capaTactil && modoDpad) capaTactil.classList.add('modo-dpad');

    const directions = {
      up: [0, -1],
      down: [0, 1],
      left: [-1, 0],
      right: [1, 0],
    };
    document.querySelectorAll('#touch-dpad [data-dir]').forEach((button) => {
      const direction = directions[button.dataset.dir];
      if (!direction) return;
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        if (!world.level || world.over) return;
        if (document.getElementById('screen-card').style.display !== 'none') return;
        window.Sfx?.unlock?.();
        pasoOffline(...direction);
      }, { passive: false });
    });

    const actions = {
      act: () => world.online ? window.Net?.accion() : window.Game.interact(),
      q: () => {
        if (world.online) window.Net?.usar(0);
        else window.Game.usarMano(0);
        world.ui.pulsarMano(0);
      },
      e: () => {
        if (world.online) window.Net?.usar(1);
        else window.Game.usarMano(1);
        world.ui.pulsarMano(1);
      },
      bag: () => world.ui.toggleBackpack(),
      map: () => window.Minimap.toggleBig(),
    };
    document.querySelectorAll('[data-touch]').forEach((button) => {
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        window.Sfx?.unlock?.();
        actions[button.dataset.touch]?.();
      }, { passive: false });
    });

    const base = document.querySelector('#touch-joystick .joy-base');
    const stick = document.querySelector('#touch-joystick .joy-stick');
    let pointerId = null;
    window.InputState.reset('touch');

    function mover(event) {
      const vector = calcularVector(base.getBoundingClientRect(), event.clientX, event.clientY);
      window.InputState.set('touch', vector.x, vector.y);
      if (stick) {
        stick.style.transform = `translate(calc(-50% + ${vector.offsetX}px), ` +
          `calc(-50% + ${vector.offsetY}px))`;
      }
    }

    function soltar(event) {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      window.InputState.reset('touch');
      if (stick) stick.style.transform = 'translate(-50%, -50%)';
      base.classList.remove('activo');
      if (world.online) window.Net?.parar();
    }

    if (base) {
      base.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        window.Sfx?.unlock?.();
        pointerId = event.pointerId;
        try { base.setPointerCapture(pointerId); } catch (e) {}
        base.classList.add('activo');
        mover(event);
      }, { passive: false });
      base.addEventListener('pointermove', (event) => {
        if (event.pointerId !== pointerId) return;
        event.preventDefault();
        mover(event);
      }, { passive: false });
      base.addEventListener('pointerup', soltar);
      base.addEventListener('pointercancel', soltar);
    }
  }

  window.TouchControls = { init, calcularVector };
})();
