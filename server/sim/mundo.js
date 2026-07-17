// Bootstrap Node del motor compartido. Las reglas de construcción viven en
// game/js/sim/mundo.js y se ejecutan también en el navegador.
'use strict';

global.window = global;
require('../../game/js/data.js');        // window.GAME_DATA (niveles/entidades/objetos)
require('../../game/js/engine/rng.js');  // window.RNG (mulberry32 determinista)
require('../../game/js/mapgen/mapgen.js'); // window.MapGen (generate/walkable/bfsDist)
require('../../game/js/engine/fov.js');  // window.FOV (compute/los — matemática pura)

module.exports = require('../../game/js/sim/mundo');
