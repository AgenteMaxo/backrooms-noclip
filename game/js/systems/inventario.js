// Sanitización de inventario compartida (navegador + servidor Node).
(function () {
  const EQ_DEF = { cara: null, cuerpo: null, pies: null };

  function vacio() {
    return { inv: [], manos: [null, null], equipo: { ...EQ_DEF } };
  }

  function idValido(id, objects) {
    return typeof id === 'string' && id && objects && objects[id];
  }

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

  // Normaliza mochila + manos + equipo: filtra ids desconocidos y recorta a 6.
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

    let total = cuentaTotal(out.inv, out.manos, out.equipo);
    if (Array.isArray(inv)) {
      for (const id of inv) {
        if (!idValido(id, objects) || reservados.has(id)) continue;
        if (total >= 6) break;
        out.inv.push(id);
        total++;
      }
    }
    return out;
  }

  function parseJSON(txt, fallback) {
    try { return JSON.parse(txt); }
    catch (e) { return fallback; }
  }

  window.Inventario = { vacio, sanitizar, parseJSON };
})();
