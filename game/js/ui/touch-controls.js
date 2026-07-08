// D-pad + ESC táctiles (v25/v25.1): solo movimiento y el ESC contextual
// (cierra paneles / abre Ajustes). En vez de reimplementar esa lógica, cada
// botón dispara los mismos KeyboardEvent que ya escucha main.js, así se
// comportan idéntico al teclado en los dos modos y en las tres cámaras.
(function () {
  const params = new URLSearchParams(location.search);
  const forzado = params.get('touch');
  const esTactil = forzado === '1' ? true : forzado === '0' ? false :
    ('ontouchstart' in window) || navigator.maxTouchPoints > 0 ||
    (window.matchMedia && matchMedia('(pointer: coarse)').matches);
  document.documentElement.classList.toggle('touch', !!esTactil);

  const REPEAT_MS = 60; // más rápido que el auto-repeat más corto de main.js (150ms)

  function disparar(code, repeat) {
    document.dispatchEvent(new KeyboardEvent('keydown', { code, repeat, bubbles: true }));
  }

  document.querySelectorAll('.tc-btn[data-code]').forEach((btn) => {
    const code = btn.dataset.code;
    const soloToque = btn.dataset.tap === '1'; // ESC: un disparo por toque, sin auto-repeat
    let timer = null;
    const empezar = (ev) => {
      ev.preventDefault();
      if (timer) return; // evita duplicar si el navegador dispara pointerdown dos veces
      if (window.Sfx) Sfx.unlock();
      btn.classList.add('activo');
      disparar(code, false);
      if (!soloToque) timer = setInterval(() => disparar(code, true), REPEAT_MS);
    };
    const parar = (ev) => {
      if (ev) ev.preventDefault();
      if (timer) { clearInterval(timer); timer = null; }
      btn.classList.remove('activo');
      document.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
    };
    btn.addEventListener('pointerdown', empezar);
    btn.addEventListener('pointerup', parar);
    btn.addEventListener('pointercancel', parar);
    btn.addEventListener('pointerleave', parar);
  });
})();
