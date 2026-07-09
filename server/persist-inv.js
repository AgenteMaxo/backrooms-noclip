// Sanitización de inventario en el servidor (usa el mismo módulo que el cliente).
'use strict';

global.window = global;
require('../game/js/systems/inventario.js');
const { DATA } = require('./sim/mundo');
const Inv = global.Inventario;
const db = require('./db');

function sanitizar(inv, manos, equipo) {
  return Inv.sanitizar(inv, manos, equipo, DATA.objects);
}

function sanitizarAlijo(inv) {
  return Inv.sanitizarAlijo(inv, DATA.objects);
}

function desdeExpediente(exp) {
  const i = exp?.loadout || exp?.inventario;
  if (!i) return Inv.vacio();
  return sanitizar(i.inv, i.manos, i.equipo);
}

function sincronizarDeposito(token, alijoInv, loadout) {
  const saneAlijo = sanitizarAlijo(alijoInv);
  const saneLoadout = sanitizar(loadout?.inv, loadout?.manos, loadout?.equipo);
  db.guardarAlijo(token, saneAlijo);
  db.guardarLoadout(token, saneLoadout.inv, saneLoadout.manos, saneLoadout.equipo);
  return { alijo: { inv: saneAlijo }, loadout: saneLoadout };
}

function guardar(jug) {
  const sane = sanitizar(jug.inv, jug.manos, jug.equipo);
  jug.inv = [...sane.inv];
  jug.manos = [...sane.manos];
  jug.equipo = { ...sane.equipo };
  return sane;
}

function vaciar(jug) {
  const v = Inv.vacio();
  jug.inv = [...v.inv];
  jug.manos = [...v.manos];
  jug.equipo = { ...v.equipo };
  return v;
}

module.exports = {
  sanitizar, sanitizarAlijo, desdeExpediente, sincronizarDeposito,
  guardar, vaciar, vacio: Inv.vacio,
};
