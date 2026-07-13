// Fondo panorámico y presentación responsive de la pantalla de título.
// No modifica la lógica del juego ni necesita dependencias externas.
(function () {
  'use strict';

  const screen = document.getElementById('screen-title');
  if (!screen || document.getElementById('title-panorama')) return;

  const images = [
    'assets/menu/panorama/pano_01.webp',
    'assets/menu/panorama/pano_02.webp',
    'assets/menu/panorama/pano_03.webp',
    'assets/menu/panorama/pano_04.webp',
    'assets/menu/panorama/pano_05.webp',
    'assets/menu/panorama/pano_06.webp',
    'assets/menu/panorama/pano_07.webp',
  ];

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const panorama = document.createElement('div');
  panorama.id = 'title-panorama';
  panorama.className = 'title-panorama';
  panorama.setAttribute('aria-hidden', 'true');

  const layers = [0, 1].map(() => {
    const layer = document.createElement('div');
    layer.className = 'title-panorama-layer';
    panorama.appendChild(layer);
    return layer;
  });

  screen.insertBefore(panorama, screen.firstChild);
  screen.classList.add('title-interface-enabled');

  let currentIndex = 0;
  let activeLayer = 0;
  let timer = 0;
  let stopped = false;

  function preload(url) {
    return new Promise((resolve) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = url;
    });
  }

  function apply(index, immediate) {
    const nextLayer = immediate ? activeLayer : 1 - activeLayer;
    const layer = layers[nextLayer];
    const url = images[index];

    layer.style.backgroundImage = `url("${url}")`;
    screen.style.setProperty('--title-panorama-current', `url("${url}")`);

    requestAnimationFrame(() => {
      if (immediate) {
        layers[activeLayer].classList.add('is-active');
        screen.classList.add('title-interface-ready');
        return;
      }
      layer.classList.add('is-active');
      layers[activeLayer].classList.remove('is-active');
      activeLayer = nextLayer;
    });
  }

  function schedule() {
    clearTimeout(timer);
    if (stopped || reducedMotion.matches || document.hidden) return;
    timer = window.setTimeout(async () => {
      const nextIndex = (currentIndex + 1) % images.length;
      await preload(images[nextIndex]);
      if (stopped) return;
      currentIndex = nextIndex;
      apply(currentIndex, false);
      schedule();
    }, 12000);
  }

  async function start() {
    await preload(images[0]);
    if (stopped) return;
    apply(0, true);

    // Precarga suave del resto sin bloquear la primera pintura.
    window.setTimeout(() => {
      for (let i = 1; i < images.length; i++) preload(images[i]);
    }, 800);

    schedule();
  }

  function onVisibilityChange() {
    if (document.hidden) clearTimeout(timer);
    else schedule();
  }

  function onMotionPreferenceChange() {
    if (reducedMotion.matches) clearTimeout(timer);
    else schedule();
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
  if (typeof reducedMotion.addEventListener === 'function')
    reducedMotion.addEventListener('change', onMotionPreferenceChange);
  else if (typeof reducedMotion.addListener === 'function')
    reducedMotion.addListener(onMotionPreferenceChange);

  window.addEventListener('pagehide', () => {
    stopped = true;
    clearTimeout(timer);
  }, { once: true });

  start();
})();
