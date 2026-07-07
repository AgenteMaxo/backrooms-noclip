// Moderación de texto de BACKROOMS MMO: nombres y chat.
// Censura con asteriscos en vez de bloquear (menos fricción, mismo efecto).
'use strict';

// Lista base ES/EN. Se compara sobre texto normalizado (sin acentos, sin
// leetspeak simple), por lo que «put4» o «pûta» también caen.
const PALABRAS = [
  'puta', 'puto', 'polla', 'gilipollas', 'maricon', 'joder', 'mierda',
  'cabron', 'zorra', 'follar', 'pendejo', 'verga', 'nazi', 'hitler',
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'nigger', 'nigga', 'faggot',
  'retard', 'whore', 'slut', 'rape',
];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
const RE_ACENTOS = new RegExp('[\\u0300-\\u036f]', 'g');
const RE_CONTROL = new RegExp('[\\u0000-\\u001f\\u007f\\u200b-\\u200f\\u2028\\u2029]', 'g');

function normalizar(txt) {
  return txt
    .toLowerCase()
    .normalize('NFD').replace(RE_ACENTOS, '')
    .replace(/[0134578@$]/g, (c) => LEET[c] ?? c);
}

// Censura palabras de la lista conservando la longitud (p*** style).
function censurar(txt) {
  const norm = normalizar(txt);
  const out = txt.split('');
  for (const mala of PALABRAS) {
    let desde = 0, i;
    while ((i = norm.indexOf(mala, desde)) !== -1) {
      for (let k = i + 1; k < i + mala.length && k < out.length; k++) out[k] = '*';
      desde = i + mala.length;
    }
  }
  return out.join('');
}

// Sanea un nombre de jugador: solo letras/números/espacios/-_, 2-16 chars,
// sin palabrotas. Si no queda nada usable, bautiza como «Errante-NNN».
function nombreLimpio(nombre) {
  let n = String(nombre ?? '')
    .replace(RE_CONTROL, '')
    .replace(/[^\p{L}\p{N} \-_]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  if (n.length < 2 || censurar(n) !== n) n = '';
  return n || `Errante-${100 + Math.floor(Math.random() * 900)}`;
}

// Chat: quita caracteres de control, colapsa espacios y baja los GRITOS.
function chatLimpio(txt) {
  let t = String(txt ?? '')
    .replace(RE_CONTROL, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  const letras = t.replace(/[^\p{L}]/gu, '');
  if (letras.length > 8 && letras === letras.toUpperCase()) t = t.toLowerCase();
  return censurar(t);
}

module.exports = { nombreLimpio, chatLimpio, censurar, normalizar };
