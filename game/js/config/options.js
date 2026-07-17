// Configuración persistente del cliente. Este módulo es la única pieza que
// conoce la clave de localStorage y los valores por defecto.
(function () {
  'use strict';

  const STORAGE_KEY = 'backrooms-opts';
  const GAMEPAD_DEFAULTS = Object.freeze({
    interact: 0,
    wait: 2,
    light: 3,
    handL: 4,
    handR: 5,
    backpack: 1,
    menu: 9,
    map: 6,
    log: 7,
    codex: 8,
    journal: 11,
    chat: 12,
  });

  function esObjeto(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function valoresIniciales() {
    const tactil = !!window.matchMedia?.('(pointer: coarse)').matches;
    return {
      gamepadMap: { ...GAMEPAD_DEFAULTS },
      cursorSpeed: 8,
      dado: true,
      mostrarFps: false,
      camaraModo: 'libre',
      camaraInvertir: tactil,
      camaraSens: 100,
      camaraSeguimiento: 8,
      resolucion: 'auto16x9',
      fpsMax: 'vsync',
      menuMusica: 'menu1',
    };
  }

  function cargar() {
    const defaults = valoresIniciales();
    try {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      if (!esObjeto(stored)) return defaults;
      return {
        ...defaults,
        ...stored,
        gamepadMap: {
          ...GAMEPAD_DEFAULTS,
          ...(esObjeto(stored.gamepadMap) ? stored.gamepadMap : {}),
        },
      };
    } catch (e) {
      return defaults;
    }
  }

  const valores = cargar();

  function guardar() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(valores));
      return true;
    } catch (e) {
      return false;
    }
  }

  function restaurarMando() {
    valores.gamepadMap = { ...GAMEPAD_DEFAULTS };
    valores.cursorSpeed = 8;
    guardar();
  }

  window.OPTS = valores; // compatibilidad con los módulos existentes
  window.Options = { valores, guardar, restaurarMando };
})();
