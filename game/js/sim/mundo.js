// Construcción compartida del mundo MMO. Este archivo es dual: el navegador
// lo carga como script y Node lo requiere desde server/sim/mundo.js.
(function (root, factory) {
  'use strict';
  const api = factory(root.GAME_DATA, root.RNG, root.MapGen, root.FOV);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MundoSim = api;
})(typeof window !== 'undefined' ? window : globalThis, function (DATA, RNG, MapGen, FOV) {
  'use strict';

  function defParaOnline(def) {
    return {
      ...def,
      // `prob` pertenece a las ventanas infinitas del modo por turnos. Una
      // sala MMO fija no puede aparecer sin salida y dejar jugadores atrapados.
      salidas: (def.salidas || []).map((salida) => {
        const copia = { ...salida };
        delete copia.prob;
        return copia;
      }),
    };
  }

  function generarMapa(nivelId, semilla) {
    const def = DATA.levels[nivelId];
    if (!def) throw new Error(`nivel desconocido: ${nivelId}`);
    const map = MapGen.generate(defParaOnline(def), RNG.create(semilla));
    return { def, map };
  }

  function esTransitable(map, x, y) {
    if (x < 0 || y < 0 || x >= map.grid.w || y >= map.grid.h) return false;
    return MapGen.walkable(MapGen.at(map.grid, x, y));
  }

  return { DATA, RNG, MapGen, FOV, generarMapa, esTransitable };
});
