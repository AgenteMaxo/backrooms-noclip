// Registro de implementaciones exclusivas de cada nivel.
//
// El motor sigue siendo comun. Cada carpeta de `levels/<id>/` puede registrar
// recursos y hooks sin llenar Tiles, Game o main.js de condiciones por nivel.
(function () {
  const niveles = Object.create(null);

  function idDe(level) {
    return typeof level === 'string' ? level : level?.id;
  }

  function registrar(id, implementacion) {
    if (!id || !implementacion) throw new Error('Levels.registrar requiere id e implementación');
    if (niveles[id]) throw new Error(`El nivel ${id} ya está registrado`);
    niveles[id] = implementacion;
  }

  function frame(level, world, tiempo) {
    niveles[idDe(level)]?.frame?.(world, tiempo);
  }

  function turno(level, world, contexto) {
    niveles[idDe(level)]?.turno?.(world, contexto);
  }

  window.Levels = { registrar, frame, turno };
})();
