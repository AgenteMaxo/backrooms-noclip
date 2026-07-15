// Estado compartido de movimiento. Cada dispositivo modifica solo su fuente;
// el bucle principal consume el total sin depender de variables globales sueltas.
(function () {
  'use strict';

  const fuentes = Object.create(null);
  let totalX = 0;
  let totalY = 0;

  function limitar(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(-1, Math.min(1, number));
  }

  function set(source, x, y) {
    if (!source) throw new TypeError('InputState.set requiere una fuente');
    const anterior = fuentes[source] || { x: 0, y: 0 };
    const siguiente = { x: limitar(x), y: limitar(y) };
    fuentes[source] = siguiente;
    totalX += siguiente.x - anterior.x;
    totalY += siguiente.y - anterior.y;
  }

  function reset(source) {
    const anterior = fuentes[source];
    if (!anterior) return;
    totalX -= anterior.x;
    totalY -= anterior.y;
    delete fuentes[source];
  }

  function resetAll() {
    for (const source of Object.keys(fuentes)) delete fuentes[source];
    totalX = 0;
    totalY = 0;
  }

  window.InputState = {
    set,
    reset,
    resetAll,
    get x() { return totalX; },
    get y() { return totalY; },
  };
})();
