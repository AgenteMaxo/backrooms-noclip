// Sanitización de inventario en el servidor (usa el mismo módulo que el cliente).
'use strict';

global.window = global;
require('../game/js/systems/inventario.js');
const { DATA } = require('./sim/mundo');
const Inv = global.Inventario;

function sanitizar(inv, manos, equipo) {
  return Inv.sanitizar(inv, manos, equipo, DATA.objects);
}

function desdeExpediente(exp) {
  if (!exp?.inventario) return Inv.vacio();
  const i = exp.inventario;
  return sanitizar(i.inv, i.manos, i.equipo);
}

function guardar(jug) {
  const sane = sanitizar(jug.inv, jug.manos, jug.equipo);
  jug.inv = [...sane.inv];
  jug.manos = [...sane.manos];
  jug.equipo = { ...sane.equipo };
  return sane;
}

module.exports = { sanitizar, desdeExpediente, guardar, vacio: Inv.vacio };
