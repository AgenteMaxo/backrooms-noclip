// Reglas puras compartidas por modo por turnos, MMO, servidor local y pipeline.
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SharedRules = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const SIN_RETORNO_RE = /agujero|caes |caer |caída|desplom|abismo|pozo|trampilla|no.?clip|desmay|despiert/i;

  function esSinRetorno(exit) {
    return !!exit && (exit.sinRetorno === true || exit.tipo === 'void' || SIN_RETORNO_RE.test(exit.texto || ''));
  }

  function destinosDeclarados(exit, levels) {
    if (!exit?.destino) return [];
    if (exit.destino.startsWith('*opciones:')) {
      return exit.destino.slice('*opciones:'.length).split(',').filter((id) => !levels || levels[id]);
    }
    return !levels || levels[exit.destino] ? [exit.destino] : [];
  }

  function resolverDestino(exit, { levelIds, visited, currentId, pick }) {
    const declared = exit?.destino;
    if (!declared || typeof pick !== 'function') return declared || null;
    if (declared === '*aleatoria') return pick((levelIds || []).filter((id) => id !== currentId));
    if (declared === '*visitada') return pick(visited || []);
    if (declared.startsWith('*opciones:')) return pick(declared.slice('*opciones:'.length).split(','));
    return declared;
  }

  function resolverRiesgoVoid(exit, die) {
    const applies = exit?.tipo === 'arriesgada' && Number(exit.riesgoVoid) > 0;
    const threshold = applies ? Math.round(Number(exit.riesgoVoid) * 20) : 0;
    return { applies, threshold, success: !applies || die > threshold };
  }

  function idsPoseidos(player) {
    return [
      ...(player?.inv || []),
      ...(player?.manos || []),
      ...Object.values(player?.equipo || {}),
    ].filter(Boolean);
  }

  function posee(player, id) {
    return idsPoseidos(player).includes(id);
  }

  function mochilaLlena(player, capacity = 6) {
    return (player?.inv?.length || 0) >= capacity;
  }

  function equiparManos(hands, itemId, requiredHands) {
    const current = [...(hands || [null, null])];
    if (!requiredHands) return { ok: false, reason: 'no_equipable', hands: current };
    if (requiredHands === 2) {
      if (current[0] || current[1]) return { ok: false, reason: 'manos_ocupadas', hands: current };
      return { ok: true, slot: 0, hands: [itemId, '='] };
    }
    const slot = current.indexOf(null);
    if (slot < 0) return { ok: false, reason: 'manos_ocupadas', hands: current };
    current[slot] = itemId;
    return { ok: true, slot, hands: current };
  }

  function guardarMano(hands, requestedSlot, inventoryLength, capacity = 6) {
    const current = [...(hands || [null, null])];
    let slot = requestedSlot;
    if (current[slot] === '=') slot = 0;
    const itemId = current[slot];
    if (!itemId) return { ok: false, reason: 'vacia', hands: current };
    if (inventoryLength >= capacity) return { ok: false, reason: 'mochila_llena', hands: current };
    if (current[1] === '=') return { ok: true, itemId, slot: 0, hands: [null, null] };
    current[slot] = null;
    return { ok: true, itemId, slot, hands: current };
  }

  return {
    esSinRetorno,
    destinosDeclarados,
    resolverDestino,
    resolverRiesgoVoid,
    idsPoseidos,
    posee,
    mochilaLlena,
    equiparManos,
    guardarMano,
  };
});
