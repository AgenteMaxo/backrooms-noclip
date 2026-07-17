// Identidad persistente del cliente MMO. Cliente remoto y servidor local usan
// exactamente el mismo token y no conocen su almacenamiento.
(function () {
  'use strict';

  const TOKEN_KEY = 'mmo-token';

  function crearToken() {
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function token() {
    try {
      let value = window.localStorage.getItem(TOKEN_KEY);
      if (!value) {
        value = crearToken();
        window.localStorage.setItem(TOKEN_KEY, value);
      }
      return value;
    } catch (e) {
      return 'sin-token';
    }
  }

  window.ClientIdentity = { token };
})();
