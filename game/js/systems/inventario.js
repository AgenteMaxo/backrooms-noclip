// Sanitización de inventario compartida (navegador + servidor Node).
(function () {
  const EQ_DEF = { cara: null, cuerpo: null, pies: null };
  const CAP_MOCHILA = 6;
  const CAP_ALIJO = 24;

  function vacio() {
    return { inv: [], manos: [null, null], equipo: { ...EQ_DEF } };
  }

  function idValido(id, objects) {
    return typeof id === 'string' && id && objects && objects[id];
  }

  // Total de objetos llevados (mochila + manos + equipo vestido).
  function cuentaTotal(inv, manos, equipo) {
    let n = Array.isArray(inv) ? inv.length : 0;
    if (Array.isArray(manos)) {
      for (const id of manos) if (id && id !== '=') n++;
    }
    if (equipo && typeof equipo === 'object') {
      for (const id of Object.values(equipo)) if (id) n++;
    }
    return n;
  }

  function espacioMochila(inv) {
    return Math.max(0, CAP_MOCHILA - (Array.isArray(inv) ? inv.length : 0));
  }

  // Huecos en mochila: NO comparten cupo con manos ni equipo vestido.
  function espacioLibre(inv) {
    return espacioMochila(inv);
  }

  // Normaliza mochila + manos + equipo: cada zona con su propio límite.
  function sanitizar(inv, manos, equipo, objects) {
    if (!objects) return vacio();
    const out = vacio();
    const reservados = new Set();

    const m = Array.isArray(manos) ? manos : [null, null];
    if (m[1] === '=' && idValido(m[0], objects) && (objects[m[0]].manos || 0) === 2) {
      out.manos[0] = m[0];
      out.manos[1] = '=';
      reservados.add(m[0]);
    } else {
      for (let i = 0; i < 2; i++) {
        const id = m[i];
        if (!id || id === '=') continue;
        if (!idValido(id, objects) || (objects[id].manos || 0) === 2) continue;
        out.manos[i] = id;
        reservados.add(id);
      }
    }

    const eq = equipo && typeof equipo === 'object' ? equipo : {};
    for (const tipo of Object.keys(EQ_DEF)) {
      const id = eq[tipo];
      if (!idValido(id, objects) || objects[id].equipo !== tipo || reservados.has(id)) continue;
      out.equipo[tipo] = id;
      reservados.add(id);
    }

    if (Array.isArray(inv)) {
      for (const id of inv) {
        if (!idValido(id, objects) || reservados.has(id)) continue;
        if (out.inv.length >= CAP_MOCHILA) break;
        out.inv.push(id);
      }
    }
    return out;
  }

  // Alijo seguro (pantalla de inicio): solo ids válidos, hasta CAP_ALIJO.
  function sanitizarAlijo(inv, objects) {
    const out = [];
    if (!objects || !Array.isArray(inv)) return out;
    for (const id of inv) {
      if (!idValido(id, objects)) continue;
      if (out.length >= CAP_ALIJO) break;
      out.push(id);
    }
    return out;
  }

  function parseJSON(txt, fallback) {
    try { return JSON.parse(txt); }
    catch (e) { return fallback; }
  }

  window.Inventario = {
    vacio, sanitizar, sanitizarAlijo, espacioLibre, espacioMochila, cuentaTotal,
    parseJSON, CAP_MOCHILA, CAP_ALIJO,
  };
})();
