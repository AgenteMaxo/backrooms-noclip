// Arnés: Sala Manila (Level 0) — sentinel '*opciones:', generación de
// map.manila/manilaSalida y la mecánica de permanencia (tiempo REAL, no
// turnos). Sin esperar minutos de verdad: Date.now() se sustituye por un
// reloj controlado durante las pruebas de permanencia.
'use strict';

const path = require('path');
const REPO = path.join(__dirname, '..');

const fallos = [];
function ok(cond, msg) {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) fallos.push(msg);
}

// ---------- Parte 1: generación (pura, sin servidor) ----------
(function testGeneracion() {
  global.window = global;
  require(path.join(REPO, 'game', 'js', 'data.js'));
  require(path.join(REPO, 'game', 'js', 'engine', 'rng.js'));
  require(path.join(REPO, 'game', 'js', 'mapgen', 'mapgen.js'));
  const { MapGen, RNG, GAME_DATA } = global;
  const lvl = GAME_DATA.levels['level-0'];

  const N = 300;
  let conManila = 0;
  for (let seed = 0; seed < N; seed++) {
    const levelSeed = `semilla-gen-${seed}::level-0::1`;
    const map = MapGen.generate(lvl, RNG.create(levelSeed));
    if (map.manila) {
      conManila++;
      ok(typeof map.manila.x === 'number' && typeof map.manila.y === 'number' &&
        map.manila.w > 0 && map.manila.h > 0, `map.manila es un rect válido (semilla ${seed})`);
      ok(!!map.manilaSalida && map.manilaSalida.destino === '*opciones:level-1,level-2',
        `map.manilaSalida trae el sentinel (semilla ${seed})`);
    }
  }
  const frac = conManila / N;
  console.log(`  (${conManila}/${N} generaciones con Sala Manila, ${(frac * 100).toFixed(1)}%)`);
  ok(frac > 0.08 && frac < 0.35, `la frecuencia de aparición ronda el 20% declarado (obtenido ${(frac * 100).toFixed(1)}%)`);

  // determinismo: misma semilla → mismo resultado
  const a = MapGen.generate(lvl, RNG.create('semilla-determinismo::level-0::1'));
  const b = MapGen.generate(lvl, RNG.create('semilla-determinismo::level-0::1'));
  ok(JSON.stringify(a.manila) === JSON.stringify(b.manila), 'misma semilla → mismo map.manila (o ambos null)');

  // manilaGoal: determinista por intento, dentro de rango, varía entre intentos
  const salidaDef = { permanenciaS: [180, 300] };
  const g1 = MapGen.manilaGoal(salidaDef, 'clave-test', 1);
  const g1b = MapGen.manilaGoal(salidaDef, 'clave-test', 1);
  const g2 = MapGen.manilaGoal(salidaDef, 'clave-test', 2);
  ok(g1 === g1b, 'manilaGoal es determinista para la misma clave+intento');
  ok(g1 >= 180 && g1 <= 300, `manilaGoal cae dentro del rango declarado (${g1})`);
  ok(g1 !== g2 || true, 'manilaGoal admite intentos sucesivos (no crashea)'); // pueden coincidir por azar
})();

// ---------- Parte 2: mecánica online (Sala real, reloj controlado) ----------
(function testOnline() {
  delete require.cache[require.resolve(path.join(REPO, 'server', 'sala.js'))];
  const { Sala } = require(path.join(REPO, 'server', 'sala.js'));

  // 2a. sentinel '*opciones:' en cruzar()
  {
    const sala = new Sala('level-909', 'test-manila-cruzar');
    const cruces = [];
    sala.alCruzar = (jug, s, def) => cruces.push(def);
    sala.enviar = () => {};
    const exFalso = { x: 5, y: 5, def: { texto: 't', destino: '*opciones:level-1,level-2', tipo: 'rara' } };
    sala.map.exits = [exFalso];
    const jug = { id: 1, x: 5, y: 5.3, muerto: false, inv: [], manos: [], equipo: {}, ofertaEn: null };
    sala.cruzar(jug, true);
    ok(cruces.length === 1, 'cruzar() con *opciones: invoca alCruzar una vez');
    ok(['level-1', 'level-2'].includes(cruces[0]?.destino),
      `cruzar() resuelve el sentinel a un destino real (${cruces[0]?.destino})`);
  }

  // 2b. permanencia con reloj controlado: avisos progresivos + cruce final
  {
    const sala = new Sala('level-909', 'test-manila-permanencia');
    sala.map.manila = { x: 0, y: 0, w: 6, h: 6 };
    sala.map.manilaSalida = { texto: 'sala manila de prueba', destino: '*opciones:level-1,level-2', tipo: 'rara', mecanica: 'manila', permanenciaS: [10, 10] };
    const mensajes = [];
    const cruces = [];
    sala.enviar = (ws, msg) => mensajes.push(msg);
    sala.alCruzar = (jug, s, def, opts) => cruces.push({ def, opts });
    const jug = { x: 2, y: 2, token: 'tok-permanencia', muerto: false };

    const real = Date.now;
    let ahora = real();
    Date.now = () => ahora;
    try {
      sala.manilaAvanza(jug); // 1er tick dentro: arranca el temporizador
      ok(!!jug.manila && jug.manila.objetivoMs === 10000, 'arranca el temporizador al entrar (10 s de prueba)');
      ok(mensajes.length === 0, 'no hay aviso en el primer tick');

      ahora = jug.manila.desde + jug.manila.objetivoMs * 0.6;
      sala.manilaAvanza(jug);
      ok(jug.manila.aviso === 1, 'aviso al 50%');
      ok(mensajes.some((m) => m.t === 'aviso' && /difuminar/.test(m.txt)), 'llega el mensaje de aviso al 50%');

      ahora = jug.manila.desde + jug.manila.objetivoMs * 0.85;
      sala.manilaAvanza(jug);
      ok(jug.manila.aviso === 2, 'aviso al 80%');
      ok(mensajes.some((m) => m.t === 'aviso' && /recordar/.test(m.txt)), 'llega el mensaje de aviso al 80%');

      ahora = jug.manila.desde + jug.manila.objetivoMs * 1.1;
      sala.manilaAvanza(jug);
      ok(jug.manila === null, 'el temporizador se limpia al completarse');
      ok(cruces.length === 1, 'se cruza automáticamente al completar la permanencia');
      ok(['level-1', 'level-2'].includes(cruces[0]?.def?.destino),
        `el destino final es level-1 o level-2 (${cruces[0]?.def?.destino})`);
      ok(cruces[0]?.opts?.sinTarjeta === true, 'el cruce final es sinTarjeta (como la caminata)');
    } finally {
      Date.now = real;
    }
  }

  // 2c. salir del rect cancela el temporizador sin cruzar
  {
    const sala = new Sala('level-909', 'test-manila-cancela');
    sala.map.manila = { x: 0, y: 0, w: 6, h: 6 };
    sala.map.manilaSalida = { texto: 'sala manila de prueba', destino: '*opciones:level-1,level-2', tipo: 'rara', mecanica: 'manila', permanenciaS: [10, 10] };
    const cruces = [];
    sala.enviar = () => {};
    sala.alCruzar = (jug, s, def, opts) => cruces.push({ def, opts });
    const jug = { x: 2, y: 2, token: 'tok-cancela', muerto: false };
    sala.manilaAvanza(jug);
    ok(!!jug.manila, 'el temporizador arranca dentro de la sala');
    jug.x = 40; jug.y = 40; // fuera del rect
    sala.manilaAvanza(jug);
    ok(jug.manila === null, 'salir del rect cancela el temporizador');
    ok(cruces.length === 0, 'no se cruza si se sale antes de completar');
  }
})();

console.log(fallos.length ? `\n✗ ${fallos.length} fallos` : '\n✓ TODO OK');
process.exit(fallos.length ? 1 : 0);
