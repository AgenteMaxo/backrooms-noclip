// La IA vive en game/js/sim/entidades.js (archivo DUAL navegador/Node, patrón
// fisica.js): el modo offline del navegador y el servidor comparten UNA sola
// implementación. Este re-export conserva la ruta histórica del servidor.
'use strict';

module.exports = require('../../game/js/sim/entidades');
