'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load() {
  const window = { addEventListener() {}, MODO_LOCAL: false };
  const context = { window, console, TextEncoder, TextDecoder, atob, Blob, URL, requestAnimationFrame: undefined };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(__dirname + '/mod-runtime.js', 'utf8'), context);
  return window.ModRuntime;
}

function minimalGlb() {
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }] }));
  const jsonPad = (4 - json.length % 4) % 4;
  const jsonChunk = Buffer.concat([json, Buffer.alloc(jsonPad, 0x20)]);
  const bin = Buffer.alloc(4);
  const out = Buffer.alloc(12 + 8 + jsonChunk.length + 8 + bin.length);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jsonChunk.length, 12); out.writeUInt32LE(0x4e4f534a, 16); jsonChunk.copy(out, 20);
  const off = 20 + jsonChunk.length;
  out.writeUInt32LE(bin.length, off); out.writeUInt32LE(0x004e4942, off + 4); bin.copy(out, off + 8);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

test('decodifica cabecera GLB 2.0', () => {
  const runtime = load();
  const doc = runtime._test.parseGlb(minimalGlb());
  assert.equal(doc.json.asset.version, '2.0');
  assert.equal(doc.buffers[0].byteLength, 4);
});

test('hash declarativo es determinista', () => {
  const runtime = load();
  assert.equal(runtime._test.hash('level-0:test'), runtime._test.hash('level-0:test'));
});
