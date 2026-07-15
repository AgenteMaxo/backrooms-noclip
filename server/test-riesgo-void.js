// Arnés determinista: paridad de riesgoVoid entre la regla compartida y la
// sala autoritativa. Fuerza ambos extremos del d20 sin abrir sockets ni
// repetir partidas hasta que el azar produzca el caso esperado.
'use strict';

const { Sala } = require('../game/js/sim/sala');

const fallos = [];
function comprobar(condicion, mensaje) {
  console.log((condicion ? 'PASS ' : 'FAIL ') + mensaje);
  if (!condicion) fallos.push(mensaje);
}

function crearCaso(valorDado) {
  const mensajes = [];
  const ws = {
    readyState: 1,
    send(raw) { mensajes.push(JSON.parse(raw)); },
  };
  const sala = new Sala('level-909', `prueba-${valorDado}`, 'publica', 'riesgo-void');
  const jugador = sala.entrar(ws, `Void${valorDado}`, `token-${valorDado}`, null);
  const salida = sala.map.exits.find((item) => item.def.riesgoVoid > 0);
  jugador.x = salida.x;
  jugador.y = salida.y;
  jugador.ofertaEn = sala.map.exits.indexOf(salida);
  sala.rng.int = () => valorDado;

  let cruce = null;
  let muerte = null;
  sala.alCruzar = (_jugador, _sala, definicion) => { cruce = definicion.destino; };
  // El respawn tiene su propio arnés. Aquí interesa comprobar que cruzar()
  // toma la rama mortal y conserva exactamente su causa autoritativa.
  sala.morir = (_jugador, causa) => { muerte = causa; };
  mensajes.length = 0;

  sala.cruzar(jugador, true);
  return { sala, salida, jugador, mensajes, cruce, muerte };
}

const fallo = crearCaso(1);
comprobar(
  fallo.salida.def.tipo === 'arriesgada' && fallo.salida.def.riesgoVoid === 0.1,
  'level-909 conserva su salida arriesgada con riesgoVoid 0.1'
);
const dadoFallo = fallo.mensajes.find((mensaje) => mensaje.t === 'dado');
comprobar(dadoFallo?.valor === 1 && dadoFallo.exito === false,
  'un d20 forzado a 1 comunica el fallo');
comprobar(fallo.muerte === 'el Vacío' && fallo.cruce === null,
  'el fallo mata por el Vacío y no cambia de nivel');

const exito = crearCaso(20);
const dadoExito = exito.mensajes.find((mensaje) => mensaje.t === 'dado');
comprobar(dadoExito?.valor === 20 && dadoExito.exito === true,
  'un d20 forzado a 20 comunica el éxito');
comprobar(exito.cruce === 'level-910' && exito.muerte === null,
  'el éxito cruza a level-910 sin matar al jugador');

console.log(fallos.length ? `\n✗ ${fallos.length} fallos` : '\n✓ TODO OK');
process.exitCode = fallos.length ? 1 : 0;
