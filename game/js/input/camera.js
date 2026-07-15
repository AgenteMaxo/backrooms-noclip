// Adaptador de entrada de cámara: ratón, Pointer Lock y arrastre táctil.
(function () {
  'use strict';

  function init({ world, use3D, onRelease }) {
    const wrap = document.getElementById('game-wrap');
    const opts = window.Options.valores;
    let arrastre = null;
    let arrastreTactil = null;
    let justLocked = false;

    // el chunk 3D se carga bajo demanda: se lee el global al usarlo, nunca se
    // captura la referencia al inicializar (window.Render3D aún no existiría)
    const renderer = () => window.Render3D;
    const usa3D = () => typeof use3D === 'function' ? use3D() : use3D;
    const disponible = () => world.online && usa3D() && renderer()?.modo === 'tercera';
    const factor = () => opts.camaraInvertir ? 1 : -1;
    const sensibilidad = () => (opts.camaraSens ?? 100) / 100;

    wrap.addEventListener('contextmenu', (event) => event.preventDefault());
    wrap.addEventListener('mousedown', (event) => {
      if (!disponible() || world.busy) return;
      if (event.target.closest('button, input, select, #backpack-panel, #log-panel, ' +
          '#journal-panel, #codex-panel, #changelog-panel, #sound-menu, .choice-modal, .modal-box')) return;
      if (opts.camaraModo === 'libre') {
        if (event.button === 0 && document.pointerLockElement !== wrap) wrap.requestPointerLock();
        return;
      }
      if (event.button !== 2) return;
      arrastre = event.clientX;
      wrap.classList.add('orbitando');
    });

    window.addEventListener('mousemove', (event) => {
      if (opts.camaraModo === 'libre' && document.pointerLockElement === wrap) {
        if (justLocked) { justLocked = false; return; }
        const dx = event.movementX || 0;
        if (Math.abs(dx) <= 200) renderer().orbita(factor() * dx * 0.0035 * sensibilidad());
        return;
      }
      if (arrastre === null) return;
      renderer().orbita(factor() * (arrastre - event.clientX) * 0.0085 * sensibilidad());
      arrastre = event.clientX;
    });

    window.addEventListener('mouseup', () => {
      arrastre = null;
      wrap.classList.remove('orbitando');
    });

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === wrap) {
        justLocked = true;
        return;
      }
      arrastre = null;
      wrap.classList.remove('orbitando');
      onRelease();
    });

    wrap.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' || !disponible()) return;
      if (event.target.closest('#touch-controls, button, input, select, #backpack-panel, ' +
          '#log-panel, #game-menu, #sound-menu, #item-modal')) return;
      event.preventDefault();
      arrastreTactil = { id: event.pointerId, x: event.clientX };
      try { wrap.setPointerCapture(event.pointerId); } catch (e) {}
      wrap.classList.add('orbitando');
    }, { passive: false });

    wrap.addEventListener('pointermove', (event) => {
      if (!arrastreTactil || arrastreTactil.id !== event.pointerId) return;
      event.preventDefault();
      renderer().orbita(factor() * (arrastreTactil.x - event.clientX) * 0.010 * sensibilidad());
      arrastreTactil.x = event.clientX;
    }, { passive: false });

    function finArrastreTactil(event) {
      if (!arrastreTactil || arrastreTactil.id !== event.pointerId) return;
      arrastreTactil = null;
      wrap.classList.remove('orbitando');
      try { wrap.releasePointerCapture(event.pointerId); } catch (e) {}
    }
    wrap.addEventListener('pointerup', finArrastreTactil);
    wrap.addEventListener('pointercancel', finArrastreTactil);
  }

  window.CameraInput = { init };
})();
