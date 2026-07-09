// Pruebas de sanitización de inventario (Node + navegador).
'use strict';

global.window = global;
require('../game/js/systems/inventario.js');
require('../game/js/data.js');
const Inv = global.Inventario;
const OBJ = global.GAME_DATA.objects;

const fallos = [];
function ok(cond, msg) {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) fallos.push(msg);
}

const vacio = Inv.vacio();
ok(vacio.inv.length === 0 && vacio.manos[0] === null, 'vacio()');

const dos = Inv.sanitizar(['agua_almendras', 'agua_almendras'], [null, null], {}, OBJ);
ok(dos.inv.length === 2 && dos.inv[0] === 'agua_almendras', 'duplicados en mochila');

const manos = Inv.sanitizar([], ['tuberia', null], {}, OBJ);
ok(manos.manos[0] === 'tuberia' && manos.inv.length === 0, 'objeto en mano');

const dosManos = Inv.sanitizar([], ['fuego_griego', '='], {}, OBJ);
ok(dosManos.manos[0] === 'fuego_griego' && dosManos.manos[1] === '=', 'arma a dos manos');

const eq = Inv.sanitizar([], [null, null], { cuerpo: 'chaqueta' }, OBJ);
ok(eq.equipo.cuerpo === 'chaqueta', 'equipo vestido');

const corrupto = Inv.sanitizar(['noexiste', 'tuberia'], ['tuberia', null], {}, OBJ);
ok(!corrupto.inv.includes('noexiste') && corrupto.manos[0] === 'tuberia', 'filtra ids inválidos y duplicados cruzados');

console.log(fallos.length ? `\n✗ ${fallos.length} fallos` : '\n✓ inventario OK');
process.exit(fallos.length ? 1 : 0);
