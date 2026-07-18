// Taller de mods local (solo modo UN JUGADOR).
// Guarda contenido declarativo en IndexedDB. Nunca ejecuta scripts de mods.
(function () {
  'use strict';

  const DB_NAME = 'backrooms-offline-mods';
  const DB_VERSION = 1;
  const STORE = 'mods';
  const MAX_FILE_BYTES = 12 * 1024 * 1024;
  const MAX_PACKAGE_BYTES = 24 * 1024 * 1024;
  const MAX_MODS = 64;
  const TYPES = new Set(['prop', 'decoration', 'light_fixture', 'item', 'structure', 'character', 'entity']);
  let dbPromise = null;
  const memoryFallback = new Map();

  const textDecoder = new TextDecoder();

  function slug(value) {
    return String(value || 'mod')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'mod';
  }

  function notify() {
    try { window.dispatchEvent(new CustomEvent('backrooms-mods-changed')); } catch (_) {}
  }

  function openDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn('IndexedDB no disponible para mods:', req.error);
        resolve(null);
      };
    });
    return dbPromise;
  }

  async function tx(mode, fn) {
    const db = await openDb();
    if (!db) return fn(null);
    return new Promise((resolve, reject) => {
      const tr = db.transaction(STORE, mode);
      const store = tr.objectStore(STORE);
      let result;
      try { result = fn(store); } catch (err) { reject(err); return; }
      tr.oncomplete = () => resolve(result);
      tr.onerror = () => reject(tr.error || new Error('Fallo de almacenamiento de mods'));
      tr.onabort = () => reject(tr.error || new Error('Operación de mods cancelada'));
    });
  }

  function reqPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Fallo de IndexedDB'));
    });
  }

  async function list() {
    const db = await openDb();
    if (!db) return Array.from(memoryFallback.values()).sort((a, b) => a.name.localeCompare(b.name));
    const values = await tx('readonly', (store) => reqPromise(store.getAll()));
    return (await values).sort((a, b) => a.name.localeCompare(b.name));
  }

  async function get(id) {
    const db = await openDb();
    if (!db) return memoryFallback.get(id) || null;
    return tx('readonly', (store) => reqPromise(store.get(id)));
  }

  async function put(record) {
    const all = await list();
    if (!all.some((m) => m.id === record.id) && all.length >= MAX_MODS) {
      throw new Error(`Límite de ${MAX_MODS} mods alcanzado`);
    }
    const db = await openDb();
    if (!db) memoryFallback.set(record.id, record);
    else await tx('readwrite', (store) => store.put(record));
    notify();
    return record;
  }

  async function remove(id) {
    const db = await openDb();
    if (!db) memoryFallback.delete(id);
    else await tx('readwrite', (store) => store.delete(id));
    notify();
  }

  async function setEnabled(id, enabled) {
    const record = await get(id);
    if (!record) throw new Error('Mod no encontrado');
    record.enabled = !!enabled;
    record.updatedAt = Date.now();
    return put(record);
  }

  async function setPreviewNext(id, enabled = true) {
    const record = await get(id);
    if (!record) throw new Error('Mod no encontrado');
    record.previewNext = !!enabled;
    record.updatedAt = Date.now();
    return put(record);
  }

  function decodeBase64(value) {
    const raw = atob(String(value || ''));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out.buffer;
  }

  function encodeFileEntry(entry) {
    if (!entry || typeof entry !== 'object') throw new Error('Entrada de archivo inválida');
    const encoding = entry.encoding || 'utf8';
    if (encoding === 'base64') return { kind: 'binary', mime: entry.mime || 'application/octet-stream', data: decodeBase64(entry.data) };
    if (encoding === 'json') return { kind: 'text', mime: entry.mime || 'application/json', data: JSON.stringify(entry.data) };
    return { kind: 'text', mime: entry.mime || 'text/plain', data: String(entry.data || '') };
  }

  function validateManifest(manifest) {
    const errors = [];
    if (!manifest || typeof manifest !== 'object') return ['Falta manifest'];
    if (!/^[a-z0-9][a-z0-9._-]{2,63}$/i.test(String(manifest.id || ''))) errors.push('ID inválido (3-64 caracteres: letras, números, punto, guion o _)');
    if (!String(manifest.name || '').trim()) errors.push('Falta el nombre');
    if (!Array.isArray(manifest.content) || !manifest.content.length) errors.push('manifest.content debe contener al menos una entrada');
    for (const [i, item] of (manifest.content || []).entries()) {
      if (!item || typeof item !== 'object') { errors.push(`content[${i}] no es válido`); continue; }
      if (!TYPES.has(item.type)) errors.push(`content[${i}].type no está soportado`);
      if (!item.model || typeof item.model !== 'string') errors.push(`content[${i}] no declara model`);
      const scale = Number(item.scale ?? 1);
      if (!(scale > 0 && scale <= 64)) errors.push(`content[${i}].scale debe estar entre 0 y 64`);
    }
    return errors;
  }

  function normalizePackage(pkg, originalName = '') {
    if (!pkg || Number(pkg.brmodVersion) !== 1) throw new Error('El archivo no es un BRMOD v1');
    const errors = validateManifest(pkg.manifest);
    if (errors.length) throw new Error(errors.join('\n'));
    const files = {};
    let total = 0;
    for (const [path, entry] of Object.entries(pkg.files || {})) {
      if (!path || path.includes('..') || path.startsWith('/') || path.includes('\\')) throw new Error(`Ruta de mod no permitida: ${path}`);
      const normalized = encodeFileEntry(entry);
      const bytes = normalized.kind === 'binary' ? normalized.data.byteLength : new TextEncoder().encode(normalized.data).byteLength;
      if (bytes > MAX_FILE_BYTES) throw new Error(`${path} supera el límite de 12 MiB`);
      total += bytes;
      files[path] = normalized;
    }
    if (total > MAX_PACKAGE_BYTES) throw new Error('El paquete supera el límite de 24 MiB');
    for (const item of pkg.manifest.content) {
      if (!files[item.model]) throw new Error(`No se encontró el modelo declarado: ${item.model}`);
    }
    return {
      id: pkg.manifest.id,
      name: pkg.manifest.name,
      author: pkg.manifest.author || 'Anónimo',
      version: pkg.manifest.version || '1.0.0',
      enabled: true,
      previewNext: false,
      installedAt: Date.now(),
      updatedAt: Date.now(),
      sourceName: originalName,
      manifest: pkg.manifest,
      files,
    };
  }

  function modelKindFromName(name) {
    const n = String(name || '').toLowerCase();
    if (n.endsWith('.bbmodel')) return 'bbmodel';
    if (n.endsWith('.glb')) return 'glb';
    if (n.endsWith('.gltf')) return 'gltf';
    return null;
  }

  function wrapRawModel(name, payload, kind) {
    const base = slug(name.replace(/\.(bbmodel|glb|gltf)$/i, ''));
    const id = `local.${base}.${Date.now().toString(36)}`;
    const path = `models/${base}.${kind}`;
    const files = {};
    files[path] = kind === 'glb'
      ? { kind: 'binary', mime: 'model/gltf-binary', data: payload }
      : { kind: 'text', mime: kind === 'gltf' ? 'model/gltf+json' : 'application/json', data: payload };
    const manifest = {
      formatVersion: 1,
      id,
      name: name.replace(/\.(bbmodel|glb|gltf)$/i, ''),
      version: '1.0.0',
      author: 'Importación local',
      content: [{ id: base, type: 'prop', model: path, scale: kind === 'bbmodel' ? 0.0625 : 1, spawn: { enabled: false, levels: ['level-0'], count: [1, 1] } }],
    };
    return { id, name: manifest.name, author: manifest.author, version: manifest.version, enabled: true, previewNext: false, installedAt: Date.now(), updatedAt: Date.now(), sourceName: name, manifest, files };
  }

  async function installFile(file) {
    if (!file) throw new Error('No se recibió ningún archivo');
    if (file.size > MAX_PACKAGE_BYTES) throw new Error('El archivo supera el límite de 24 MiB');
    const lower = file.name.toLowerCase();
    let record;
    if (lower.endsWith('.brmod')) {
      const text = await file.text();
      record = normalizePackage(JSON.parse(text), file.name);
    } else {
      const kind = modelKindFromName(file.name);
      if (!kind) throw new Error('Formato no compatible. Usa .brmod, .bbmodel, .glb o .gltf');
      if (kind === 'glb') record = wrapRawModel(file.name, await file.arrayBuffer(), kind);
      else {
        const text = await file.text();
        JSON.parse(text); // error temprano y legible
        if (kind === 'gltf') {
          const json = JSON.parse(text);
          const external = (json.buffers || []).some((b) => b.uri && !String(b.uri).startsWith('data:')) ||
            (json.images || []).some((img) => img.uri && !String(img.uri).startsWith('data:'));
          if (external) throw new Error('El GLTF debe llevar buffers y texturas embebidos. Exporta GLB o GLTF embebido.');
        }
        record = wrapRawModel(file.name, text, kind);
      }
    }
    await put(record);
    return record;
  }

  async function installExample() {
    const id = 'example.liminal-crate';
    const model = {
      meta: { format_version: '4.10', model_format: 'free' },
      name: 'Caja liminal',
      resolution: { width: 16, height: 16 },
      elements: [{
        name: 'Caja', type: 'cube', from: [0, 0, 0], to: [16, 16, 16], origin: [8, 8, 8], rotation: [0, 0, 0],
        color: 3,
      }],
      textures: [],
      animations: [],
    };
    const pkg = {
      brmodVersion: 1,
      manifest: {
        formatVersion: 1,
        id,
        name: 'Caja liminal de prueba',
        version: '1.0.0',
        author: 'Backrooms No-Clip',
        content: [{ id: 'crate', type: 'prop', model: 'models/crate.bbmodel', scale: 0.0625, spawn: { enabled: false, levels: ['level-0'], count: [1, 1] } }],
      },
      files: { 'models/crate.bbmodel': { encoding: 'json', mime: 'application/json', data: model } },
    };
    return put(normalizePackage(pkg, 'ejemplo-integrado.brmod'));
  }

  function fileText(record, path) {
    const entry = record?.files?.[path];
    if (!entry) throw new Error(`Archivo ausente: ${path}`);
    if (entry.kind === 'text') return entry.data;
    return textDecoder.decode(entry.data);
  }

  function fileBuffer(record, path) {
    const entry = record?.files?.[path];
    if (!entry) throw new Error(`Archivo ausente: ${path}`);
    if (entry.kind === 'binary') return entry.data;
    return new TextEncoder().encode(entry.data).buffer;
  }

  window.ModSystem = {
    list, get, put, remove, setEnabled, setPreviewNext, installFile, installExample,
    validateManifest, normalizePackage, fileText, fileBuffer,
    isRuntimeType(type) { return type === 'prop' || type === 'decoration' || type === 'light_fixture'; },
    _test: { slug, validateManifest, normalizePackage, modelKindFromName },
  };
})();
