// Persistencia de una partida en curso. Mantiene los detalles del formato de
// guardado fuera del núcleo y recibe sus dependencias de forma explícita.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SaveGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create({ world, activeProfile, enterLevel, storage }) {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const key = () => `backrooms-save::${activeProfile() || 'anon'}`;

    function clear() {
      try { store?.removeItem(key()); }
      catch (_) { /* almacenamiento no disponible */ }
    }

    function save() {
      if (!store || !world.level || !world.player || !world.map) return;
      try {
        store.setItem(key(), JSON.stringify({
          runSeed: world.runSeed,
          levelId: world.level.id,
          player: {
            salud: world.player.salud,
            cordura: world.player.cordura,
            sed: world.player.sed,
            hambre: world.player.hambre,
            agotamiento: world.player.agotamiento,
            inv: world.player.inv,
            manos: world.player.manos,
            equipo: world.player.equipo,
          },
          journal: world.journal,
          visited: world.visited,
          prevStack: world.prevStack,
          entryCount: world.entryCount,
          turnTotal: world.turnTotal,
          dadosN: world.dadosN,
          pasosNivel: world.pasosNivel,
          caminataObjetivo: world._caminataObjetivo,
          retorno: world.map.exits.find((exit) => exit.def.tipo === 'retorno')?.def.destino || null,
          tutorial: world.tutorial,
        }));
      } catch (_) { /* almacenamiento no disponible */ }
    }

    function load() {
      if (!store) return null;
      try { return JSON.parse(store.getItem(key())); }
      catch (_) { return null; }
    }

    function continueRun(saved) {
      world.runSeed = saved.runSeed;
      world.player = {
        x: 0, y: 0, rx: 0, ry: 0, dir: 'down', flip: false, rot: 2,
        salud: saved.player.salud,
        cordura: saved.player.cordura,
        sed: saved.player.sed,
        hambre: saved.player.hambre,
        agotamiento: saved.player.agotamiento ?? 100,
        inv: saved.player.inv,
        manos: saved.player.manos || [null, null],
        equipo: saved.player.equipo || { cara: null, cuerpo: null, pies: null },
        luz: false,
        viva: true,
      };
      world.journal = saved.journal;
      world.visited = saved.visited || [];
      world.prevStack = saved.prevStack;
      world.entryCount = saved.entryCount;
      world.savedLevels = {};
      world.entryCount[saved.levelId] = Math.max(0, (world.entryCount[saved.levelId] || 1) - 1);
      world.turnTotal = saved.turnTotal;
      world.dadosN = saved.dadosN || 0;
      world.tutorial = saved.tutorial || (saved.turnTotal > 0
        ? { inicio: true, interaccion: true, mochila: true }
        : {});
      world.over = false;
      world._muerteSmiler = false;
      world._fuenteDano = null;
      world.level = null;

      enterLevel(
        saved.levelId,
        'Retomas la marcha donde lo dejaste.',
        saved.retorno ? { retornoA: saved.retorno } : undefined
      );

      world.pasosNivel = Math.max(0, saved.pasosNivel || 0);
      if (saved.caminataObjetivo) world._caminataObjetivo = saved.caminataObjetivo;
      const progress = world.pasosNivel / Math.max(1, world._caminataObjetivo);
      world._caminataAvisos = {
        lejos1: progress >= 0.3,
        lejos2: progress >= 0.65,
        lejos3: progress >= 0.82,
        lejos4: progress >= 0.94,
      };
      save();
    }

    return { clear, save, load, continueRun };
  }

  return { create };
});
