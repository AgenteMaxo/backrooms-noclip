// Ajustes visuales del cliente: resolución, pantalla completa, cámara y FPS.
// main.js solo inicializa el módulo y le notifica cada frame.
(function () {
  'use strict';

  function parseResolucion(value) {
    const resolucion = value === 'auto' ? 'auto16x9' : value || 'auto16x9';
    if (resolucion === 'auto16x9') return { auto: true, width: 960, height: 540, ratio: 16 / 9 };
    if (resolucion === 'auto16x10') return { auto: true, width: 960, height: 600, ratio: 16 / 10 };
    const match = /^(\d+)x(\d+)$/.exec(resolucion);
    if (!match) return { auto: true, width: 960, height: 540, ratio: 16 / 9 };
    const width = Number(match[1]), height = Number(match[2]);
    return { auto: false, width, height, ratio: width / height };
  }

  function encajar(width, height, ratio) {
    let w = width, h = height;
    if (w / h > ratio) w = Math.floor(h * ratio);
    else h = Math.floor(w / ratio);
    return { width: Math.max(320, w), height: Math.max(200, h) };
  }

  function calcularTamano({ resolucion, fullscreen, viewportWidth, viewportHeight, tactil }) {
    const config = parseResolucion(resolucion);
    const margen = fullscreen || tactil ? 0 : 24;
    const layout = encajar(
      Math.max(320, Math.floor(viewportWidth)) - margen,
      Math.max(200, Math.floor(viewportHeight)) - margen,
      config.ratio
    );
    return {
      layoutWidth: layout.width,
      layoutHeight: layout.height,
      renderWidth: config.auto ? layout.width : config.width,
      renderHeight: config.auto ? layout.height : config.height,
    };
  }

  function init({ canvas, use3D }) {
    const opts = window.Options.valores;
    const guardar = window.Options.guardar;
    const byId = (id) => document.getElementById(id);
    const usa3D = () => typeof use3D === 'function' ? use3D() : use3D;

    const fpsEl = document.createElement('div');
    fpsEl.id = 'fps-counter';
    fpsEl.style.cssText = 'position:fixed;top:6px;right:8px;z-index:70;display:none;' +
      'font:16px VT323,monospace;color:#d9c66e;background:rgba(10,9,6,.6);' +
      'padding:1px 7px;border:1px solid #3a352a;pointer-events:none;';
    document.body.appendChild(fpsEl);

    const optDado = byId('opt-dado');
    if (optDado) {
      optDado.checked = opts.dado;
      optDado.onchange = () => { opts.dado = optDado.checked; guardar(); };
    }

    const optFpsVer = byId('opt-fps-ver');
    function mostrarContador() {
      fpsEl.style.display = opts.mostrarFps ? 'block' : 'none';
    }
    if (optFpsVer) {
      optFpsVer.checked = !!opts.mostrarFps;
      optFpsVer.onchange = () => {
        opts.mostrarFps = optFpsVer.checked;
        mostrarContador();
        guardar();
      };
    }
    mostrarContador();

    const optCamaraModo = byId('opt-camara-modo');
    const rowSeguimiento = byId('row-camara-seguimiento');
    function mostrarSeguimiento() {
      if (rowSeguimiento) rowSeguimiento.style.display = opts.camaraModo === 'bloqueada' ? 'flex' : 'none';
    }
    if (optCamaraModo) {
      optCamaraModo.value = opts.camaraModo;
      optCamaraModo.onchange = () => {
        opts.camaraModo = optCamaraModo.value;
        mostrarSeguimiento();
        guardar();
        if (opts.camaraModo !== 'libre' && document.pointerLockElement) document.exitPointerLock();
      };
    }
    mostrarSeguimiento();

    const optSeguimiento = byId('opt-camara-seguimiento');
    const seguimientoValue = byId('opt-camara-seguimiento-v');
    if (optSeguimiento) {
      optSeguimiento.value = opts.camaraSeguimiento;
      if (seguimientoValue) seguimientoValue.textContent = optSeguimiento.value;
      optSeguimiento.oninput = () => {
        opts.camaraSeguimiento = Number(optSeguimiento.value);
        if (seguimientoValue) seguimientoValue.textContent = opts.camaraSeguimiento;
      };
      optSeguimiento.onchange = guardar;
    }

    const optInvertir = byId('opt-camara-invertir');
    if (optInvertir) {
      optInvertir.checked = !!opts.camaraInvertir;
      optInvertir.onchange = () => { opts.camaraInvertir = optInvertir.checked; guardar(); };
    }

    const optSens = byId('opt-camara-sens');
    const sensValue = byId('opt-camara-sens-v');
    if (optSens) {
      optSens.value = opts.camaraSens;
      if (sensValue) sensValue.textContent = `${optSens.value}%`;
      optSens.oninput = () => {
        opts.camaraSens = Number(optSens.value);
        if (sensValue) sensValue.textContent = `${opts.camaraSens}%`;
      };
      optSens.onchange = guardar;
    }

    function ajustarLienzo() {
      const fullscreen = !!document.fullscreenElement;
      const viewport = window.visualViewport;
      const tamano = calcularTamano({
        resolucion: opts.resolucion,
        fullscreen,
        // visualViewport puede conservar el tamaño anterior durante la
        // transición a pantalla completa. innerWidth/innerHeight ya reflejan
        // el monitor y mantienen el comportamiento previo del juego.
        viewportWidth: fullscreen ? window.innerWidth : viewport?.width || window.innerWidth,
        viewportHeight: fullscreen ? window.innerHeight : viewport?.height || window.innerHeight,
        tactil: !!window.matchMedia?.('(pointer: coarse)').matches,
      });
      document.documentElement.style.setProperty('--game-w', `${tamano.layoutWidth}px`);
      document.documentElement.style.setProperty('--game-h', `${tamano.layoutHeight}px`);
      if (canvas.width !== tamano.renderWidth || canvas.height !== tamano.renderHeight) {
        canvas.width = tamano.renderWidth;
        canvas.height = tamano.renderHeight;
        if (usa3D()) window.Render3D?.resize?.(tamano.renderWidth, tamano.renderHeight);
      }
      document.body.classList.toggle('fs', fullscreen);
    }

    const optResolucion = byId('opt-resolucion');
    if (optResolucion) {
      optResolucion.value = opts.resolucion === 'auto' ? 'auto16x9' : opts.resolucion;
      optResolucion.onchange = () => {
        opts.resolucion = optResolucion.value;
        guardar();
        ajustarLienzo();
      };
    }

    const optFps = byId('opt-fps');
    if (optFps) {
      optFps.value = opts.fpsMax;
      optFps.onchange = () => { opts.fpsMax = optFps.value; guardar(); };
    }

    const version = byId('ajustes-version');
    if (version) version.textContent = `BACKROOMS MMO ${window.VERSION_JUEGO}`;

    const btnFullscreen = byId('btn-fullscreen');
    if (btnFullscreen) {
      btnFullscreen.onclick = () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
      };
    }
    document.addEventListener('fullscreenchange', () => {
      const fullscreen = !!document.fullscreenElement;
      if (btnFullscreen) btnFullscreen.textContent = fullscreen
        ? 'Salir de pantalla completa' : 'Pantalla completa';
      ajustarLienzo();
      if (fullscreen) navigator.keyboard?.lock?.(['Escape'])?.catch?.(() => {});
      else navigator.keyboard?.unlock?.();
    });
    window.addEventListener('resize', ajustarLienzo);
    window.addEventListener('orientationchange', () => setTimeout(ajustarLienzo, 140));
    ajustarLienzo();

    let fpsFrames = 0, fpsDesde = 0;
    function frame(tiempo) {
      if (!opts.mostrarFps) return;
      fpsFrames++;
      if (!fpsDesde) fpsDesde = tiempo;
      if (tiempo - fpsDesde < 500) return;
      fpsEl.textContent = `${Math.round(fpsFrames * 1000 / (tiempo - fpsDesde))} fps`;
      fpsFrames = 0;
      fpsDesde = tiempo;
    }

    return { frame, ajustarLienzo };
  }

  window.DisplaySettings = { init, calcularTamano };
})();
