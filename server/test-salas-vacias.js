// La fuga silenciosa del registro de salas: ni salir() ni la desconexión
// borraban nada del Map, así que cada nivel::instancia visitado retenía su
// grid y sus entidades para siempre. Este arnés verifica el barrido de
// tickTodas SIN levantar servidor (el reloj `ahora` se simula): gracia para
// reentrar conservando el estado dinámico, y liberación al agotarse.
'use strict';

const S = require('./sala');

const fallos = [];
function ok(cond, msg) {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) fallos.push(msg);
}

// jugador mínimo: ws cerrado (difundir lo ignora) y posición en el spawn
function jugFake(sala, id) {
  return {
    id, ws: { readyState: 0 }, x: sala.map.spawn.x, y: sala.map.spawn.y,
    rot: 0, salud: 100, muerto: false, escondido: null, inv: [], manos: [null, null],
  };
}

const GRACIA = S.GRACIA_SALA_VACIA;
let t = 1_000_000; // reloj simulado

// 1) una sala vacía sobrevive mientras dura la gracia
const s1 = S.asignar('level-0');
const semilla = s1.semilla;
S.tickTodas(t);              // el barrido la marca como vacía
S.tickTodas(t + GRACIA - 1); // justo antes del umbral
ok(S.todas().includes(s1), 'la sala vacía sigue viva dentro de la gracia');

// 2) ocupada no se libera jamás, y asignar() reutiliza el MISMO objeto
s1.jugadores.set('j1', jugFake(s1, 'j1'));
S.tickTodas(t + GRACIA + 60_000); // muy pasada la gracia original, pero ocupada
ok(S.todas().includes(s1), 'una sala ocupada no se libera aunque pase la gracia');
ok(S.asignar('level-0') === s1, 'asignar() reutiliza la misma sala (estado dinámico conservado)');

// 3) al vaciarse otra vez, la gracia arranca de cero
s1.jugadores.delete('j1');
t += GRACIA + 120_000;
S.tickTodas(t);              // vuelve a marcarla vacía
S.tickTodas(t + GRACIA - 1);
ok(S.todas().includes(s1), 'reentrar y salir reinicia la gracia (no hereda la anterior)');

// 4) agotada la gracia, la sala se libera del registro
S.tickTodas(t + GRACIA);
ok(!S.todas().includes(s1), 'vacía más allá de la gracia: liberada');
ok(S.estado().salas.length === 0, 'el registro queda a cero (nada retenido)');

// 5) la misma clave recrea una sala nueva con la MISMA semilla (contrato con el cliente)
const s2 = S.asignar('level-0');
ok(s2 !== s1, 'la sala recreada es un objeto nuevo');
ok(s2.semilla === semilla, `misma clave → misma semilla (${s2.semilla})`);

console.log(fallos.length ? `\n✗ ${fallos.length} fallos` : '\n✓ TODO OK');
process.exit(fallos.length ? 1 : 0);
