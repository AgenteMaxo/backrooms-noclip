// Datos de personalización de personaje (pelo/ojos/ropa): estilos disponibles,
// paleta de colores permitida y normalización. UNA sola fuente de verdad —
// este archivo corre en el NAVEGADOR (window.Apariencia) y en el SERVIDOR
// (module.exports, validación autoritativa en sala.js/protocolo.js), mismo
// espíritu que sim/fisica.js: nada de listas duplicadas que puedan desincronizarse.
(function () {
  'use strict';

  // prefijo de archivo por categoría — los estilos son <Prefijo><N>.png
  // (Hair1, Hair2, Hair3...) SIN límite fijo: sprites.js prueba números
  // consecutivos y descubre cuántos hay realmente (ver LEEME.txt de
  // game/assets/apariencia/ para la numeración sin huecos grandes). "piel"
  // no tiene prefijo: no es una capa, tiñe el cuerpo base entero — que para
  // esto tiene que venir en gris de 3 tonos como cualquier capa (ver
  // game/assets/sprites/LEEME.txt) — con la MISMA mecánica de remapeo.
  // "superior"/"inferior" (ropa) NO se tiñen — cada estilo YA viene con su
  // color puesto (ver más abajo, CATEGORIAS_SIN_COLOR)
  const PREFIJOS = {
    cabello: 'Hair', ojos: 'Eyes', vello: 'Vello',
    superior: 'Superior', inferior: 'Inferior',
  };
  const CATEGORIAS = ['cabello', 'ojos', 'vello', 'superior', 'inferior', 'piel'];

  // paleta de colores ofrecida por categoría (hex en minúscula). "piel"
  // sigue siendo una lista fija de swatches (flechas «Piel 1/2/3...)
  const PALETA = {
    piel: ['#c69c6d', '#a97c50', '#8d5524', '#5c3a21'],
  };

  // valores por defecto de color continuo (cabello/vello/ojos) — el mismo
  // marrón castaño de siempre para pelo/vello, y un marrón oscuro para ojos
  const DEFECTO_COLOR_RGB = { cabello: '#523c28', ojos: '#2a2018', vello: '#523c28' };

  // Un perfil nuevo (o cualquier apariencia guardada
  // sin este campo) cae en "hazmat" por pedido explícito del usuario: "si no personaliza, se queda con la skin
  // de Hazmat". Elegir estilos/colores en piel/cabello/etc. NO borra nada:
  // quedan guardados aunque modo sea "hazmat", por si vuelve a
  // "Personalizar" más tarde.
  const MODOS = ['hazmat', 'personalizado'];
  const DEFECTO_MODO = 'hazmat';

  const DEFECTO = {
    modo: DEFECTO_MODO,
    cabello: { estilo: PREFIJOS.cabello + '1', color: DEFECTO_COLOR_RGB.cabello },
    ojos: { estilo: PREFIJOS.ojos + '1', color: DEFECTO_COLOR_RGB.ojos },
    vello: { estilo: null, color: DEFECTO_COLOR_RGB.vello },  // sin barba por defecto
    superior: { estilo: PREFIJOS.superior + '1', color: null },
    inferior: { estilo: PREFIJOS.inferior + '1', color: null },
    piel: { estilo: null, color: PALETA.piel[0] },    // el cuerpo base es gris puro: SIEMPRE necesita un color
  };

  // categorías con color CONTINUO — botón que abre el selector de color
  // nativo del navegador (refrescarColorSwatch en ui.js), en vez de una
  // paleta fija de swatches/flechas. "piel" NO está acá (ver comentario de
  // PALETA arriba) 
  const CATEGORIAS_COLOR_RGB = ['cabello', 'vello', 'ojos'];
  const HEX_RE = /^#[0-9a-f]{6}$/;

  // categorías donde `estilo: null` es una opción VÁLIDA (no un dato corrupto)
  // — "sin pelo" (calvo), "sin vello facial" (sin barba/bigote), "sin parte
  // superior" (torso desnudo). El color se ignora sin capa que teñir.
  const CATEGORIAS_OPCIONALES = ['cabello', 'vello', 'superior'];

  // categorías donde `color: null` sería una opción válida ("no teñir, dejar
  // el cuerpo base tal cual viene el archivo") — hoy ninguna: desde que la
  // piel usa la misma mecánica de remapeo que el pelo/ojos, el cuerpo base
  // es gris puro y SIEMPRE hace falta un color (si no, se ve gris). Se deja
  // el mecanismo genérico por si alguna categoría futura lo necesita.
  const CATEGORIAS_COLOR_OPCIONAL = [];

  // categorías donde el COLOR NO APLICA en absoluto (a diferencia de
  // CATEGORIAS_COLOR_OPCIONAL, acá no hay ninguna paleta que ofrecer): cada
  // estilo de "superior"/"inferior" ya viene dibujado en su color final —
  // sprites.js las dibuja TAL CUAL, sin pasar por el remapeo de 3 tonos, y
  // ui.js no le muestra fila de swatches. El campo `color` siempre queda null.
  const CATEGORIAS_SIN_COLOR = ['superior', 'inferior'];

  // categorías donde CADA DIRECCIÓN es un archivo SUELTO —
  // <Estilo>_down.png/_up.png/_side.png (48x48, un solo frame) — en vez de
  // un único PNG de 192x48 con las 3 direcciones en fila (el resto de las
  // capas). 
  const CATEGORIAS_MULTIARCHIVO = ['superior', 'inferior'];

  // valida la FORMA de un id de estilo (prefijo de la categoría + número de
  // 1 a 999) sin necesidad de una lista cerrada de nombres — no hace falta
  // saber si Hair47.png existe de verdad para validar: si no existe, sprites.js
  // simplemente no dibuja esa capa (no rompe nada, mismo espíritu que
  // cualquier frame/archivo faltante en este sistema). "piel" no tiene
  // prefijo, así que nunca valida (su estilo siempre queda en null).
  function estiloValido(cat, estilo) {
    const pre = PREFIJOS[cat];
    return !!pre && typeof estilo === 'string' && new RegExp('^' + pre + '[1-9][0-9]{0,2}$').test(estilo);
  }

  // valida/normaliza una apariencia recibida (del perfil local o de la red):
  // cualquier estilo/color con forma inválida cae al valor por defecto de
  // esa categoría — es la validación server-autoritativa real en sala.js, y
  // también una red de seguridad client-side antes de usar algo ajeno.
  function normalizar(ap) {
    const out = { modo: ap && MODOS.includes(ap.modo) ? ap.modo : DEFECTO_MODO };
    for (const cat of CATEGORIAS) {
      const sel = ap && ap[cat];
      const sinEstilo = CATEGORIAS_OPCIONALES.includes(cat) && sel && sel.estilo === null;
      const estilo = sinEstilo ? null
        : (sel && estiloValido(cat, sel.estilo) ? sel.estilo : DEFECTO[cat].estilo);
      let color;
      if (CATEGORIAS_SIN_COLOR.includes(cat)) {
        color = null; // el estilo ya viene con su color puesto — no hay nada que validar
      } else if (CATEGORIAS_COLOR_RGB.includes(cat)) {
        // color continuo: cualquier hex de 6 dígitos vale (no hay paleta
        // cerrada que chequear) — el rango real de r/g/b ya queda acotado
        // a 0-255 por venir de un <input type=range>, así que solo hace
        // falta validar la FORMA del string, igual que estiloValido de arriba
        color = sel && typeof sel.color === 'string' && HEX_RE.test(sel.color.toLowerCase())
          ? sel.color.toLowerCase() : DEFECTO[cat].color;
      } else {
        const sinColor = CATEGORIAS_COLOR_OPCIONAL.includes(cat) && sel && sel.color === null;
        color = sinColor ? null
          : (sel && typeof sel.color === 'string' && PALETA[cat].includes(sel.color.toLowerCase())
            ? sel.color.toLowerCase() : DEFECTO[cat].color);
      }
      out[cat] = { estilo, color };
    }
    return out;
  }

  const api = {
    PREFIJOS, CATEGORIAS, PALETA, DEFECTO, MODOS,
    CATEGORIAS_OPCIONALES, CATEGORIAS_COLOR_OPCIONAL, CATEGORIAS_SIN_COLOR, CATEGORIAS_MULTIARCHIVO,
    CATEGORIAS_COLOR_RGB, estiloValido, normalizar,
  };
  if (typeof window !== 'undefined') window.Apariencia = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
