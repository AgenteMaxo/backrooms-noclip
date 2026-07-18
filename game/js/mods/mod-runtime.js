// Render de mods declarativos. Está deliberadamente aislado del MMO:
// solo monta objetos cuando window.MODO_LOCAL === true.
(function () {
  'use strict';

  let gameScene = null;
  let root = null;
  let modeOffline = false;
  let buildToken = 0;
  let lastWorldKey = '';
  const mapIds = new WeakMap();
  let nextMapId = 1;

  function installSceneHook() {
    if (!window.THREE || THREE.Scene.prototype.__backroomsModHook) return;
    const originalAdd = THREE.Scene.prototype.add;
    Object.defineProperty(THREE.Scene.prototype, '__backroomsModHook', { value: true });
    THREE.Scene.prototype.add = function (...objects) {
      if (!gameScene && objects.some((o) => o && (o.isAmbientLight || o.isDirectionalLight))) gameScene = this;
      return originalAdd.apply(this, objects);
    };
  }
  installSceneHook();

  function isOffline() { return modeOffline && window.MODO_LOCAL === true; }

  function setOfflineMode(value) {
    modeOffline = !!value;
    if (!modeOffline) clear();
  }

  function clear() {
    buildToken++;
    lastWorldKey = '';
    if (root?.parent) root.parent.remove(root);
    if (root) disposeObject(root);
    root = null;
  }

  function disposeObject(obj) {
    obj.traverse?.((node) => {
      node.geometry?.dispose?.();
      if (Array.isArray(node.material)) node.material.forEach((m) => { m.map?.dispose?.(); m.dispose?.(); });
      else { node.material?.map?.dispose?.(); node.material?.dispose?.(); }
    });
  }

  function palette(index) {
    const colors = [0xc9b56b, 0x776247, 0x58666a, 0x665448, 0x9a8158, 0x48514d, 0x7c6f53, 0x8b7858];
    return colors[Math.abs(Number(index) || 0) % colors.length];
  }

  function dataUrlToTexture(dataUrl) {
    if (!dataUrl || !window.THREE) return null;
    const t = new THREE.TextureLoader().load(dataUrl);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function bbmodelTexture(model) {
    const tex = (model.textures || []).find((x) => x && (x.source || x.data_url || x.data));
    return dataUrlToTexture(tex?.source || tex?.data_url || tex?.data || null);
  }

  function buildBbmodel(model, content) {
    const group = new THREE.Group();
    const sharedTexture = bbmodelTexture(model);
    const defaultMaterial = new THREE.MeshStandardMaterial({
      color: sharedTexture ? 0xffffff : palette(model.elements?.[0]?.color),
      map: sharedTexture || null,
      roughness: 0.88,
      metalness: 0.02,
    });
    const unit = Number(content.blockbenchUnit || 1 / 16);
    for (const el of model.elements || []) {
      if (el.type && el.type !== 'cube') continue;
      const from = el.from || [0, 0, 0];
      const to = el.to || [16, 16, 16];
      const origin = el.origin || [8, 8, 8];
      const size = [Math.max(0.001, (to[0] - from[0]) * unit), Math.max(0.001, (to[1] - from[1]) * unit), Math.max(0.001, (to[2] - from[2]) * unit)];
      const center = [(from[0] + to[0]) * 0.5 * unit, (from[1] + to[1]) * 0.5 * unit, (from[2] + to[2]) * 0.5 * unit];
      const pivot = new THREE.Group();
      pivot.position.set(origin[0] * unit, origin[1] * unit, origin[2] * unit);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), defaultMaterial.clone());
      mesh.position.set(center[0] - pivot.position.x, center[1] - pivot.position.y, center[2] - pivot.position.z);
      const r = el.rotation || [0, 0, 0];
      pivot.rotation.set(THREE.MathUtils.degToRad(r[0] || 0), THREE.MathUtils.degToRad(r[1] || 0), THREE.MathUtils.degToRad(r[2] || 0), 'ZYX');
      pivot.add(mesh);
      group.add(pivot);
    }
    centerObject(group);
    return group;
  }

  function componentInfo(type) {
    return {
      5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2],
      5125: [Uint32Array, 4], 5126: [Float32Array, 4],
    }[type];
  }

  function components(type) { return { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type] || 1; }

  function parseGlb(buffer) {
    const view = new DataView(buffer);
    if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) throw new Error('GLB 2.0 inválido');
    let offset = 12, json = null, bin = null;
    while (offset + 8 <= view.byteLength) {
      const len = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
      const chunk = buffer.slice(offset + 8, offset + 8 + len);
      if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk).replace(/\0+$/g, '').trim());
      if (type === 0x004e4942) bin = chunk;
      offset += 8 + len;
    }
    if (!json || !bin) throw new Error('GLB sin JSON o BIN');
    return { json, buffers: [bin] };
  }

  function parseDataUri(uri) {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(uri || '');
    if (!match) throw new Error('GLTF externo no permitido');
    if (match[2]) {
      const raw = atob(match[3]);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      return bytes.buffer;
    }
    return new TextEncoder().encode(decodeURIComponent(match[3])).buffer;
  }

  function parseGltf(text) {
    const json = JSON.parse(text);
    const buffers = (json.buffers || []).map((b) => parseDataUri(b.uri));
    return { json, buffers };
  }

  function accessorArray(doc, index) {
    const a = doc.json.accessors[index];
    const bv = doc.json.bufferViews[a.bufferView];
    const info = componentInfo(a.componentType);
    if (!info) throw new Error(`Componente GLTF no soportado: ${a.componentType}`);
    const [Ctor, bytes] = info;
    const ncomp = components(a.type);
    const src = doc.buffers[bv.buffer];
    const byteOffset = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const stride = bv.byteStride || ncomp * bytes;
    if (stride === ncomp * bytes) return new Ctor(src, byteOffset, a.count * ncomp).slice();
    const out = new Ctor(a.count * ncomp);
    const dv = new DataView(src);
    const getter = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
    for (let i = 0; i < a.count; i++) for (let c = 0; c < ncomp; c++) out[i * ncomp + c] = dv[getter](byteOffset + i * stride + c * bytes, bytes > 1);
    return out;
  }

  function imageUrl(doc, imageIndex) {
    const img = doc.json.images?.[imageIndex];
    if (!img) return null;
    if (img.uri) return img.uri;
    if (img.bufferView === undefined) return null;
    const bv = doc.json.bufferViews[img.bufferView];
    const bytes = doc.buffers[bv.buffer].slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    return URL.createObjectURL(new Blob([bytes], { type: img.mimeType || 'image/png' }));
  }

  function gltfMaterial(doc, index) {
    const src = doc.json.materials?.[index] || {};
    const pbr = src.pbrMetallicRoughness || {};
    const factor = pbr.baseColorFactor || [1, 1, 1, 1];
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(factor[0], factor[1], factor[2]), opacity: factor[3], transparent: factor[3] < 1,
      roughness: pbr.roughnessFactor ?? 0.85, metalness: pbr.metallicFactor ?? 0,
      side: src.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    });
    const texIndex = pbr.baseColorTexture?.index;
    if (texIndex !== undefined) {
      const source = doc.json.textures?.[texIndex]?.source;
      const url = imageUrl(doc, source);
      if (url) {
        mat.map = new THREE.TextureLoader().load(url, (t) => { t.encoding = THREE.sRGBEncoding; if (url.startsWith('blob:')) URL.revokeObjectURL(url); });
      }
    }
    return mat;
  }

  function buildGltf(doc) {
    const meshTemplates = (doc.json.meshes || []).map((meshDef) => {
      const group = new THREE.Group();
      for (const primitive of meshDef.primitives || []) {
        if (primitive.mode !== undefined && primitive.mode !== 4) continue;
        const geo = new THREE.BufferGeometry();
        const pos = accessorArray(doc, primitive.attributes.POSITION);
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
        if (primitive.attributes.NORMAL !== undefined) geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(accessorArray(doc, primitive.attributes.NORMAL)), 3));
        else geo.computeVertexNormals();
        if (primitive.attributes.TEXCOORD_0 !== undefined) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(accessorArray(doc, primitive.attributes.TEXCOORD_0)), 2));
        if (primitive.indices !== undefined) geo.setIndex(new THREE.BufferAttribute(accessorArray(doc, primitive.indices), 1));
        const material = gltfMaterial(doc, primitive.material);
        group.add(new THREE.Mesh(geo, material));
      }
      return group;
    });
    const nodes = (doc.json.nodes || []).map((n) => {
      const obj = n.mesh !== undefined ? meshTemplates[n.mesh].clone(true) : new THREE.Group();
      obj.name = n.name || '';
      if (n.matrix) obj.matrix.fromArray(n.matrix), obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
      else {
        if (n.translation) obj.position.fromArray(n.translation);
        if (n.rotation) obj.quaternion.fromArray(n.rotation);
        if (n.scale) obj.scale.fromArray(n.scale);
      }
      return obj;
    });
    (doc.json.nodes || []).forEach((n, i) => (n.children || []).forEach((child) => nodes[i].add(nodes[child])));
    const out = new THREE.Group();
    const sceneDef = doc.json.scenes?.[doc.json.scene || 0];
    const roots = sceneDef?.nodes || nodes.map((_, i) => i).filter((i) => !(doc.json.nodes || []).some((n) => (n.children || []).includes(i)));
    roots.forEach((i) => out.add(nodes[i]));
    centerObject(out);
    return out;
  }

  function centerObject(group) {
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    group.position.x -= center.x;
    group.position.z -= center.z;
    group.position.y -= box.min.y;
  }

  async function createObject(record, content) {
    const path = content.model;
    const lower = path.toLowerCase();
    let obj;
    if (lower.endsWith('.bbmodel')) obj = buildBbmodel(JSON.parse(ModSystem.fileText(record, path)), content);
    else if (lower.endsWith('.glb')) obj = buildGltf(parseGlb(ModSystem.fileBuffer(record, path)));
    else if (lower.endsWith('.gltf')) obj = buildGltf(parseGltf(ModSystem.fileText(record, path)));
    else throw new Error(`Modelo no soportado: ${path}`);
    obj.name = `brmod:${record.id}:${content.id}`;
    const scale = Number(content.scale ?? 1);
    obj.scale.multiplyScalar(scale);
    return obj;
  }

  function hash(value) {
    let h = 2166136261;
    for (const ch of String(value)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function mulberry32(seed) {
    return function () { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  function walkablePositions(world, count, seed) {
    const g = world.map?.grid;
    if (!g?.t) return [];
    const rng = mulberry32(hash(seed));
    const out = [];
    for (let tries = 0; tries < 600 && out.length < count; tries++) {
      const x = 1 + Math.floor(rng() * Math.max(1, g.w - 2));
      const y = 1 + Math.floor(rng() * Math.max(1, g.h - 2));
      const t = g.t[y * g.w + x];
      if (t !== 0 && t !== 4) continue;
      if (Math.hypot(x - world.player.x, y - world.player.y) < 4) continue;
      if (out.some((p) => Math.hypot(x - p.x, y - p.y) < 3)) continue;
      out.push({ x, y });
    }
    return out;
  }

  function mapKey(world) {
    const map = world.map;
    if (!map || typeof map !== 'object') return '';
    if (!mapIds.has(map)) mapIds.set(map, nextMapId++);
    return `${world.level?.id || ''}:${mapIds.get(map)}`;
  }

  async function rebuild(world) {
    const token = ++buildToken;
    if (root?.parent) root.parent.remove(root);
    if (root) disposeObject(root);
    root = new THREE.Group();
    root.name = 'offline-brmods';
    gameScene.add(root);
    const mods = (await ModSystem.list()).filter((m) => m.enabled);
    if (token !== buildToken || !isOffline()) return;
    let total = 0;
    for (const record of mods) {
      for (const content of record.manifest.content || []) {
        if (!ModSystem.isRuntimeType(content.type)) continue;
        const levels = content.spawn?.levels || [];
        const levelOk = !levels.length || levels.includes(world.level.id);
        const preview = !!record.previewNext;
        if (!preview && (!content.spawn?.enabled || !levelOk)) continue;
        let count = preview ? 1 : Math.max(0, Math.min(8, Number(content.spawn?.count?.[0] ?? 1)));
        count = Math.min(count, 16 - total);
        if (count <= 0) continue;
        const positions = preview
          ? [{ x: world.player.x + 2, y: world.player.y }]
          : walkablePositions(world, count, `${record.id}:${content.id}:${mapKey(world)}`);
        for (const p of positions) {
          try {
            const obj = await createObject(record, content);
            if (token !== buildToken || !isOffline()) { disposeObject(obj); return; }
            obj.position.set(p.x + 0.5, 0, p.y + 0.5);
            root.add(obj);
            total++;
          } catch (err) { console.warn(`No se pudo montar ${record.id}/${content.id}:`, err); }
        }
        if (preview) await ModSystem.setPreviewNext(record.id, false);
        if (total >= 16) return;
      }
    }
  }

  function tick() {
    requestAnimationFrame(tick);
    const world = window.Game?.world;
    if (!isOffline() || !gameScene || !world?.level || !world?.map || !window.ModSystem) {
      if (root && !isOffline()) clear();
      return;
    }
    const key = mapKey(world);
    if (key && key !== lastWorldKey) {
      lastWorldKey = key;
      rebuild(world).catch((err) => console.warn('Fallo montando mods offline:', err));
    }
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(tick);
  window.addEventListener?.('backrooms-mods-changed', () => { lastWorldKey = ''; });

  window.ModRuntime = {
    setOfflineMode, clear, createObject,
    get offline() { return isOffline(); },
    _test: { parseGlb, parseGltf, componentInfo, components, hash },
  };
})();
