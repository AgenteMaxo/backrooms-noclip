// Carga de scripts BAJO DEMANDA, sin build tools ni módulos ES.
// El chunk 3D (three.min + shaders + postpro + atmos3d + render3d*) es el 52%
// del JavaScript del juego y la portada no lo usa para nada: su fondo son los
// WebP del panorama. Se inyecta cuando hace falta, no al parsear el HTML.
//
// `async = false` es la clave: los scripts inyectados se DESCARGAN en paralelo
// pero se EJECUTAN en orden de inserción — exactamente la misma garantía que
// da el orden de los <script> en index.html, que es la gestión de dependencias
// de este proyecto.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = { crear: factory };
  else root.Cargador = factory(root.document);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (document) {
  'use strict';

  // El ?v=NNN se hereda del <script> que carga ESTE archivo: sin él, el edge de
  // Cloudflare serviría JS viejo a los scripts inyectados (la lección de v23.3).
  const V = (function () {
    try {
      const m = (document.currentScript || {}).src?.match(/[?&](v=[^&]+)/);
      return m ? '?' + m[1] : '';
    } catch (e) { return ''; }
  })();

  const pedidos = {}; // cada ruta se inyecta UNA vez por intento
  const elementos = {};

  function uno(ruta) {
    if (pedidos[ruta]) return pedidos[ruta];
    pedidos[ruta] = new Promise((resolver, rechazar) => {
      const el = document.createElement('script');
      el.async = false; // paralelo al descargar, en orden al ejecutar
      el.onload = () => resolver(ruta);
      el.onerror = () => rechazar(new Error('No se pudo cargar ' + ruta));
      el.src = ruta + V;
      elementos[ruta] = el;
      document.head.appendChild(el);
    });
    return pedidos[ruta];
  }

  // Se inyectan todas de golpe; la promesa espera a que la última EJECUTE.
  function scripts(rutas) {
    return Promise.all(rutas.map(uno)).catch((error) => {
      // Un fallo puede dejar ejecutada solo una parte del lote. Se descarta el
      // lote entero para que un reintento vuelva a ejecutar sus dependencias
      // en el mismo orden, en vez de conservar una promesa rechazada para
      // siempre o continuar desde un estado incompleto.
      for (const ruta of rutas) {
        elementos[ruta]?.remove?.();
        delete elementos[ruta];
        delete pedidos[ruta];
      }
      throw error;
    });
  }

  return { scripts };
});
