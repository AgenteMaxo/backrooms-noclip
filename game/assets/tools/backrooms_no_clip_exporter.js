/*
 * Backrooms No-Clip Offline Mod Exporter for Blockbench
 * Exports a dependency-free BRMOD v1 JSON file for the browser game.
 */
(function () {
  'use strict';

  const PLUGIN_ID = 'backrooms_no_clip_exporter';
  let exportAction, validateAction, markerAction;

  function slug(value) {
    return String(value || 'mod').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'mod';
  }

  function vec(value, fallback = [0, 0, 0]) {
    if (!value) return fallback.slice();
    return [Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0];
  }

  function faceData(face) {
    if (!face) return undefined;
    return {
      uv: Array.isArray(face.uv) ? face.uv.map(Number) : undefined,
      rotation: Number(face.rotation) || 0,
      texture: face.texture?.uuid || face.texture || null,
      cullface: face.cullface || undefined,
    };
  }

  function serializeCube(cube) {
    const faces = {};
    for (const side of ['north', 'east', 'south', 'west', 'up', 'down']) {
      const data = faceData(cube.faces?.[side]);
      if (data) faces[side] = data;
    }
    return {
      name: cube.name || 'Cube',
      uuid: cube.uuid,
      type: 'cube',
      from: vec(cube.from),
      to: vec(cube.to, [16, 16, 16]),
      origin: vec(cube.origin, [8, 8, 8]),
      rotation: vec(cube.rotation),
      inflate: Number(cube.inflate) || 0,
      color: Number(cube.color) || 0,
      faces,
    };
  }

  function textureSource(texture) {
    try {
      if (typeof texture.getDataURL === 'function') return texture.getDataURL();
      if (texture.source?.startsWith('data:')) return texture.source;
      if (texture.img?.toDataURL) return texture.img.toDataURL('image/png');
    } catch (_) {}
    return null;
  }

  function serializeTexture(texture) {
    return {
      name: texture.name || 'texture.png',
      uuid: texture.uuid,
      id: texture.id,
      width: Number(texture.width) || Project?.texture_width || 16,
      height: Number(texture.height) || Project?.texture_height || 16,
      source: textureSource(texture),
    };
  }

  function serializeMarkers() {
    const all = [];
    const prefixes = /^(COLLIDER|SPAWN|ANCHOR|DOOR|ENTRANCE|LIGHT|INTERACT|HAND|CAMERA)_/i;
    const candidates = [];
    if (typeof Group !== 'undefined' && Array.isArray(Group.all)) candidates.push(...Group.all);
    if (typeof Locator !== 'undefined' && Array.isArray(Locator.all)) candidates.push(...Locator.all);
    if (typeof NullObject !== 'undefined' && Array.isArray(NullObject.all)) candidates.push(...NullObject.all);
    for (const node of candidates) {
      if (!prefixes.test(node.name || '')) continue;
      all.push({
        name: node.name,
        uuid: node.uuid,
        position: vec(node.origin || node.position),
        rotation: vec(node.rotation),
      });
    }
    return all;
  }

  function serializeProject() {
    return {
      meta: { format_version: '4.10', model_format: Format?.id || 'free', exporter: `${PLUGIN_ID}@1.0.0` },
      name: Project?.name || 'Backrooms Model',
      resolution: { width: Number(Project?.texture_width) || 16, height: Number(Project?.texture_height) || 16 },
      elements: (typeof Cube !== 'undefined' && Array.isArray(Cube.all) ? Cube.all : []).map(serializeCube),
      textures: (typeof Texture !== 'undefined' && Array.isArray(Texture.all) ? Texture.all : []).map(serializeTexture),
      animations: (typeof Animation !== 'undefined' && Array.isArray(Animation.all) ? Animation.all : []).map((a) => ({ name: a.name, uuid: a.uuid, length: Number(a.length) || 0, loop: a.loop || 'once' })),
      backroomsMarkers: serializeMarkers(),
    };
  }

  function modelStats() {
    const cubes = typeof Cube !== 'undefined' && Array.isArray(Cube.all) ? Cube.all.length : 0;
    const meshes = typeof Mesh !== 'undefined' && Array.isArray(Mesh.all) ? Mesh.all.length : 0;
    const textures = typeof Texture !== 'undefined' && Array.isArray(Texture.all) ? Texture.all.length : 0;
    const animations = typeof Animation !== 'undefined' && Array.isArray(Animation.all) ? Animation.all.length : 0;
    const markers = serializeMarkers().length;
    return { cubes, meshes, textures, animations, markers, trianglesApprox: cubes * 12 };
  }

  function validate() {
    const stats = modelStats();
    const warnings = [];
    if (!stats.cubes && !stats.meshes) warnings.push('El proyecto no contiene cubos ni mallas.');
    if (stats.meshes) warnings.push('El runtime Alpha exporta cubos. Las mallas libres se registran, pero no se serializan todavía.');
    if (stats.cubes > 400) warnings.push('Más de 400 cubos: puede ser pesado en teléfonos.');
    if (stats.trianglesApprox > 12000) warnings.push('Supera la recomendación de 12.000 triángulos para un modelo móvil.');
    if (!stats.textures) warnings.push('No hay texturas; el juego usará una paleta de respaldo.');
    const message = [
      `Cubos: ${stats.cubes}`,
      `Mallas: ${stats.meshes}`,
      `Triángulos aprox.: ${stats.trianglesApprox}`,
      `Texturas: ${stats.textures}`,
      `Animaciones declaradas: ${stats.animations}`,
      `Marcadores: ${stats.markers}`,
      '',
      warnings.length ? `Avisos:\n- ${warnings.join('\n- ')}` : 'Modelo válido para el runtime Alpha.',
    ].join('\n');
    Blockbench.showMessageBox({ title: 'Validación Backrooms No-Clip', message });
    return { stats, warnings };
  }

  function exportPackage(form) {
    const model = serializeProject();
    const id = String(form.id || '').trim() || `local.${slug(form.name)}`;
    const modelName = `${slug(form.name)}.bbmodel`;
    const content = {
      id: slug(form.content_id || form.name),
      type: form.type,
      model: `models/${modelName}`,
      scale: Math.max(0.001, Number(form.scale) || 0.0625),
      collision: { mode: form.collision },
      interaction: form.interaction === 'none' ? undefined : { type: form.interaction },
      markers: model.backroomsMarkers,
      spawn: {
        enabled: !!form.spawn_enabled,
        levels: String(form.levels || 'level-0').split(',').map((x) => x.trim()).filter(Boolean),
        weight: Math.max(0, Math.min(1, Number(form.weight) || 0.08)),
        count: [Math.max(1, Number(form.count) || 1), Math.max(1, Number(form.count) || 1)],
      },
      animations: model.animations.map((a) => a.name),
    };
    if (!content.interaction) delete content.interaction;
    const pkg = {
      brmodVersion: 1,
      manifest: {
        formatVersion: 1,
        id,
        name: String(form.name || Project?.name || 'Backrooms Mod').trim(),
        version: String(form.version || '1.0.0').trim(),
        author: String(form.author || '').trim() || 'Anónimo',
        description: String(form.description || '').trim(),
        content: [content],
      },
      files: {
        [`models/${modelName}`]: { encoding: 'json', mime: 'application/json', data: model },
      },
    };
    const json = JSON.stringify(pkg, null, 2);
    Blockbench.export({
      resource_id: 'backrooms_mod',
      type: 'Backrooms No-Clip Mod',
      extensions: ['brmod'],
      name: `${slug(pkg.manifest.name)}-${slug(pkg.manifest.version)}`,
      content: json,
      savetype: 'text',
    });
  }

  function showExportDialog() {
    const base = Project?.name || 'Mi mod';
    new Dialog({
      id: 'backrooms_mod_export',
      title: 'Exportar mod de Backrooms No-Clip',
      form: {
        name: { label: 'Nombre', type: 'text', value: base },
        id: { label: 'ID único', type: 'text', value: `autor.${slug(base)}` },
        author: { label: 'Autor', type: 'text', value: '' },
        version: { label: 'Versión', type: 'text', value: '1.0.0' },
        description: { label: 'Descripción', type: 'textarea', value: '' },
        type: { label: 'Tipo', type: 'select', options: { prop: 'Objeto / prop', decoration: 'Decoración', light_fixture: 'Luminaria', item: 'Ítem', structure: 'Estructura', character: 'Personaje', entity: 'Entidad' }, value: 'prop' },
        scale: { label: 'Escala', type: 'number', value: 0.0625, min: 0.001, max: 64, step: 0.001 },
        collision: { label: 'Colisión declarada', type: 'select', options: { none: 'Sin colisión', auto: 'Automática (futuro)', box: 'Caja (futuro)' }, value: 'none' },
        interaction: { label: 'Interacción', type: 'select', options: { none: 'Ninguna', inspect: 'Inspeccionar', container: 'Contenedor', door: 'Puerta', hiding: 'Escondite', pickup: 'Recoger', switch: 'Interruptor' }, value: 'none' },
        spawn_enabled: { label: 'Generar automáticamente', type: 'checkbox', value: false },
        levels: { label: 'Niveles (separados por coma)', type: 'text', value: 'level-0' },
        weight: { label: 'Frecuencia', type: 'number', value: 0.08, min: 0, max: 1, step: 0.01 },
        count: { label: 'Cantidad máxima', type: 'number', value: 1, min: 1, max: 8, step: 1 },
      },
      onConfirm(form) {
        const result = validate();
        if (!result.stats.cubes) {
          Blockbench.showQuickMessage('Añade al menos un cubo antes de exportar', 2500);
          return;
        }
        exportPackage(form);
        this.hide();
      },
    }).show();
  }

  function addMarker(name) {
    let node = null;
    try {
      if (typeof Locator !== 'undefined') node = new Locator({ name, position: [0, 0, 0] }).init();
      else if (typeof NullObject !== 'undefined') node = new NullObject({ name, position: [0, 0, 0] }).init();
      else if (typeof Group !== 'undefined') node = new Group({ name, origin: [0, 0, 0] }).init();
      node?.addTo?.(Group?.selected || null);
      node?.select?.();
      Canvas?.updateAll?.();
      Blockbench.showQuickMessage(`Marcador ${name} añadido`, 1800);
    } catch (err) {
      Blockbench.showMessageBox({ title: 'Marcadores', message: `No se pudo crear automáticamente. Crea un grupo o locator llamado:\n${name}\n\n${err.message || err}` });
    }
  }

  function markerDialog() {
    new Dialog({
      id: 'backrooms_marker_dialog',
      title: 'Marcador de Backrooms No-Clip',
      form: {
        marker: { label: 'Tipo', type: 'select', options: {
          ANCHOR_floor: 'Anclaje al suelo', COLLIDER_main: 'Colisión principal', INTERACT_main: 'Punto interactivo',
          LIGHT_fluorescent: 'Luminaria', DOOR_exit: 'Salida / puerta', ENTRANCE_north: 'Entrada de estructura',
          SPAWN_item_01: 'Aparición de ítem', SPAWN_entity_01: 'Aparición de entidad', HAND_left: 'Mano izquierda', HAND_right: 'Mano derecha', CAMERA_preview: 'Cámara de vista previa',
        }, value: 'ANCHOR_floor' },
      },
      onConfirm(form) { addMarker(form.marker); this.hide(); },
    }).show();
  }

  Plugin.register(PLUGIN_ID, {
    title: 'Backrooms No-Clip Exporter',
    author: 'Andres Acevedo / Backrooms No-Clip community',
    description: 'Exporta modelos de Blockbench como mods declarativos para el modo UN JUGADOR de Backrooms No-Clip.',
    icon: 'view_in_ar',
    version: '1.0.0',
    min_version: '4.10.0',
    variant: 'both',
    onload() {
      exportAction = new Action('backrooms_export_brmod', { name: 'Exportar mod de Backrooms No-Clip', icon: 'archive', click: showExportDialog });
      validateAction = new Action('backrooms_validate_model', { name: 'Validar modelo para Backrooms No-Clip', icon: 'fact_check', click: validate });
      markerAction = new Action('backrooms_add_marker', { name: 'Añadir marcador de Backrooms No-Clip', icon: 'add_location_alt', click: markerDialog });
      MenuBar.addAction(exportAction, 'tools');
      MenuBar.addAction(validateAction, 'tools');
      MenuBar.addAction(markerAction, 'tools');
    },
    onunload() {
      exportAction?.delete(); validateAction?.delete(); markerAction?.delete();
    },
  });
})();
