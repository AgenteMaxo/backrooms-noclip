// Morir online prometía «manos vacías» pero el equipo VESTIDO sobrevivía:
// morir() reseteaba inv y manos y olvidaba jug.equipo, así que unas
// botas_reforzadas conservaban su bonus (detección −1) para siempre — al
// contrario que el modo solo, donde startRun también desnuda al jugador.
// Arnés sin servidor: sala real + ws fake que captura lo que se envía.
'use strict';

const S = require('./sala');

const fallos = [];
function ok(cond, msg) {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) fallos.push(msg);
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const buzon = [];
  const ws = { readyState: 1, send: (raw) => buzon.push(JSON.parse(raw)) };

  const sala = S.asignar('level-0');
  const jug = sala.entrar(ws, 'Arnés', 'arnes-equipo', null);

  // vestido y armado antes de morir
  jug.inv = ['almendrada'];
  jug.manos = ['tuberia', null];
  jug.equipo = { cara: 'mascara_gas', cuerpo: 'chaqueta', pies: 'botas_reforzadas' };

  sala.morir(jug, 'arnés');
  ok(jug.muerto === true, 'morir() marca al jugador como muerto');
  await espera(2800); // el respawn llega a los 2.5 s

  ok(jug.muerto === false && jug.salud === 100, 'el respawn revive con salud completa');
  ok(jug.inv.length === 0 && jug.manos.every((m) => m === null),
    'inventario y manos quedan vacíos (como prometía el mensaje de muerte)');
  ok(jug.equipo.cara === null && jug.equipo.cuerpo === null && jug.equipo.pies === null,
    'lo vestido también se pierde: cara/cuerpo/pies a null');

  // el cliente se entera: tras el respawn viaja un 'inv' con el equipo vacío
  // (el handler del cliente ya hace w.player.equipo = m.equipo)
  const inv = buzon.filter((m) => m.t === 'inv').pop();
  ok(!!inv, 'tras el respawn se envía el mensaje inv');
  ok(inv && inv.equipo && inv.equipo.cara === null && inv.equipo.cuerpo === null
    && inv.equipo.pies === null, 'el inv lleva el equipo vaciado (cliente sincronizado)');

  console.log(fallos.length ? `\n✗ ${fallos.length} fallos` : '\n✓ TODO OK');
  process.exit(fallos.length ? 1 : 0);
})();
