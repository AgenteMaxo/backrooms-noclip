// Render 3D (Three.js local): mundo con volumen real y cámara inclinada estilo
// Octopath. Reutiliza TODAS las texturas procedurales existentes (tiles.js,
// sprites.js, render.js→exitToCanvas) como CanvasTexture. La lógica del juego
// (FOV, turnos, entidades) no cambia: esto es solo presentación.
(function () {
  if (!window.THREE) { window.Render3D = null; return; }

  // ---- modo de cámara (v15): 'tercera' = a la espalda del personaje (por defecto);
  // '?cam=alta' conserva la cámara Octopath inclinada de v9-v14 para comparar ----
  const CAM_MODO = new URLSearchParams(location.search).get('cam') === 'alta' ? 'alta' : 'tercera';

  // ---- constantes de cámara y escena (afinables) ----
  const CAM = { fov: 44, dy: 5.8, dz: 4.2, lookY: 0.4, lookAhead: 1.1, suavidad: 0.06, bob: 0.007 };
  // 3ª persona: cámara baja tras el hombro, mira 2.2 tiles por delante
  const TP = { fov: 56, alto: 1.5, dist: 2.6, lookY: 0.95, lookAhead: 2.2, suavidad: 0.1, bob: 0.012 };
  let camRot = 0;          // rotación de cámara en pasos de 90° (0-3), tecla Q (modo alta)
  let camYaw = 0;          // yaw animado (radianes)
  // altura de muros: en 3ª persona son de altura real (la cámara va a 1.5 y JAMÁS
  // ve por encima → nunca se rompe la sensación de interior)
  const WALL_H = CAM_MODO === 'tercera' ? 2.3 : 1.2;
  const SPRITE_H = 1.05;   // alto del billboard de actores
  const ROT_VEC = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // norte, este, sur, oeste

  let renderer, scene, camera, amb, plight, spot, dlight;
  let ceilingLights = [];
  let composer = null;           // postprocesado (bloom + gamma); null => render directo
  let fogBase = 0.08;
  let glCanvas, overlay, octx, W, H;
  let levelKey = null;
  let staticGroup = null;        // suelo/muros/techo/salidas/props (reconstruible)
  let actorGroup = null;         // jugador/entidades/items (sobrevive a los rebuilds)
  let rebuild = null;            // generador de reconstrucción incremental en curso
  let itemsVersionVista = -1;    // items del suelo rehechos al cambiar world.itemsVersion
  let entitySprites = new Map(); // uid -> THREE.Sprite
  let itemSprites = new Map();   // index -> sprite
  let otrosSprites = new Map();  // id -> sprite (jugadores remotos del MMO)
  let playerSprite = null;
  let texCache = new Map();      // clave -> THREE.Texture
  let grain = null;
  let camBobT = 0;
  let panelMats = [];            // grupos independientes de fluorescentes
  let panelPositions = [];       // posición y grupo de cada fluorescente
  let transitionMats = null;     // materiales que mutan al acercarse Level 1
  let flkHasta = 0, flkNext = 0, flkOn = true, flkGrupo = -1;
  const REDUCE_FLICKER = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  function level0Phase(world) {
    if (world.level?.id !== 'level-0' || !world._caminataObjetivo) return 0;
    // El cambio empieza despacio al 72 % y ocupa el tramo final de la marcha.
    return clamp01((world.pasosNivel / world._caminataObjetivo - 0.72) / 0.28);
  }

  function seededUnit(seed) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }

  function panelGroup(seed, x, y, total) {
    return Math.floor(seededUnit(`${seed}:${x.toFixed(2)}:${y.toFixed(2)}`) * total);
  }

  function tex(canvas, key) {
    if (key && texCache.has(key)) return texCache.get(key);
    const t = new THREE.CanvasTexture(canvas);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.encoding = THREE.sRGBEncoding;
    if (key) texCache.set(key, t);
    return t;
  }

  function init(gl, ov) {
    glCanvas = gl; overlay = ov;
    W = gl.width; H = gl.height;
    octx = ov.getContext('2d');
    renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: false });
    renderer.setSize(W, H, false);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(CAM_MODO === 'tercera' ? TP.fov : CAM.fov, W / H, 0.1, 60);

    // Postprocesado: bloom (solo emisivos casi blancos superan el umbral) + corrección
    // gamma final — en r147 el composer NO aplica outputEncoding, sin ese pase la
    // imagen sale lavada. Con NOFX no se crea (SwiftShader headless no lo aguanta).
    if (!window.NOFX && THREE.EffectComposer && THREE.UnrealBloomPass && THREE.GammaCorrectionShader) {
      try {
        composer = new THREE.EffectComposer(renderer);
        composer.addPass(new THREE.RenderPass(scene, camera));
        composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.4, 0.82));
        composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));
      } catch (e) {
        console.warn('Postpro desactivado:', e);
        composer = null;
      }
    }
    amb = new THREE.AmbientLight(0xffffff, 0.4);
    plight = new THREE.PointLight(0xffffff, 1.7, 12, 1.8);
    plight.castShadow = true;
    plight.shadow.mapSize.set(512, 512);
    plight.shadow.bias = -0.01;
    scene.add(amb, plight);
    // luz cenital suave del motor: la sensación de que la luz baja del techo
    // (estática — nada procedural; la intensidad se ajusta por nivel en buildLevel)
    dlight = new THREE.DirectionalLight(0xfff2dc, 0.35);
    dlight.position.set(0.25, 1, 0.15);
    scene.add(dlight);
    // Un pequeño pool sigue a los fluorescentes más cercanos. Evita crear una
    // PointLight por panel en un mapa de 150×150 y conserva luz localizada real.
    ceilingLights = Array.from({ length: 4 }, (_, i) => {
      const l = new THREE.PointLight(0xffe7aa, 0, 5.8, 2);
      l.castShadow = false;
      l.shadow.mapSize.set(256, 256);
      l.shadow.bias = -0.012;
      scene.add(l);
      return l;
    });
    // foco de la linterna (cono real; se enciende con F)
    spot = new THREE.SpotLight(0xfff0d0, 0, 11, 0.5, 0.45, 1.2);
    scene.add(spot, spot.target);
    // luminarias + polvo (no-op con NOFX)
    if (window.Atmos3D) Atmos3D.init(scene);

    // grano para el overlay
    grain = document.createElement('canvas');
    grain.width = 256; grain.height = 256;
    const gctx = grain.getContext('2d');
    const img = gctx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 22;
    }
    gctx.putImageData(img, 0, 0);
  }

  // ---------- pintores frontales a medida (llenan TODO el lienzo: sin márgenes) ----------
  const SH = (c, f) => Tiles.shade(c, f);
  function lienzo(w, h, fn) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    fn(c.getContext('2d'), w, h);
    return c;
  }
  const PINTORES = {
    puerta: (col) => lienzo(44, 64, (x, w, h) => {
      x.fillStyle = '#241c12'; x.fillRect(0, 0, w, h);                 // marco
      x.fillStyle = SH(col, 0.42); x.fillRect(3, 3, w - 6, h - 3);     // hoja
      x.strokeStyle = SH(col, 0.7); x.lineWidth = 2;
      x.strokeRect(8, 8, w - 16, 20);                                  // cuarterón sup
      x.strokeRect(8, 34, w - 16, 20);                                 // cuarterón inf
      x.fillStyle = '#e8d890';                                          // pomo
      x.beginPath(); x.arc(w - 9, h / 2 + 2, 2.6, 0, 7); x.fill();
      x.fillStyle = col; x.globalAlpha = 0.5;                           // luz bajo la puerta
      x.fillRect(4, h - 3, w - 8, 3);
    }),
    ventana: (col) => lienzo(44, 64, (x, w, h) => {
      x.fillStyle = '#2a2a2e'; x.fillRect(0, 0, w, h);
      x.fillStyle = SH(col, 0.9); x.globalAlpha = 0.85;
      const pw = (w - 12) / 2, ph = (h - 12) / 2;
      for (const [px2, py2] of [[4, 4], [8 + pw, 4], [4, 8 + ph], [8 + pw, 8 + ph]])
        x.fillRect(px2, py2, pw, ph);
    }),
    vending: () => lienzo(40, 64, (x, w, h) => {
      x.fillStyle = '#a83848'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#701828'; x.fillRect(0, 0, w, 4);
      x.fillStyle = '#d8e8f0'; x.globalAlpha = 0.85;                    // escaparate
      x.fillRect(4, 7, w - 16, h - 22);
      x.globalAlpha = 1;
      x.fillStyle = '#701828'; x.fillRect(w - 10, 7, 7, h - 22);        // panel
      x.fillStyle = '#ffe060'; x.fillRect(w - 9, 12, 5, 5);             // botón 9
      x.fillStyle = '#c8a830'; x.fillRect(w - 9, 20, 5, 5);             // botón 8
      x.fillStyle = '#1a0c10'; x.fillRect(4, h - 11, w - 8, 7);         // bandeja
    }),
    reloj: () => lienzo(48, 28, (x, w, h) => {
      x.fillStyle = '#20242a'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#4a5058'; x.lineWidth = 2; x.strokeRect(1, 1, w - 2, h - 2);
      x.fillStyle = '#40ff80';
      x.font = 'bold 13px monospace'; x.textAlign = 'center';
      x.fillText('88:88', w / 2, h / 2 + 5);
    }),
    boton: () => lienzo(40, 40, (x, w, h) => {
      x.fillStyle = '#c8ccd4'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#8a92a0'; x.strokeRect(1.5, 1.5, w - 3, h - 3);
      x.fillStyle = '#d83030';
      x.beginPath(); x.arc(w / 2, h / 2 - 4, 9, 0, 7); x.fill();
      x.fillStyle = '#2a2e34'; x.font = 'bold 7px monospace'; x.textAlign = 'center';
      x.fillText('ESCAPE', w / 2, h - 6);
    }),
    enchufe: () => lienzo(16, 20, (x, w, h) => {
      x.fillStyle = '#b9ae78'; x.fillRect(1, 1, w - 2, h - 2);
      x.strokeStyle = '#756b45'; x.lineWidth = 1; x.strokeRect(1.5, 1.5, w - 3, h - 3);
      x.fillStyle = '#393522';
      x.fillRect(5, 6, 2, 5); x.fillRect(9, 6, 2, 5);
      x.fillStyle = '#6e6542'; x.fillRect(7, 14, 2, 2);
      x.fillStyle = '#d7cc92'; x.fillRect(3, 3, w - 6, 1);
    }),
    edificio: () => lienzo(44, 64, (x, w, h) => {
      x.fillStyle = '#38404c'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#6ae86a'; x.globalAlpha = 0.8;
      for (let fy = 0; fy < 7; fy++)
        for (let fx = 0; fx < 4; fx++)
          if ((fx + fy) % 2 === 0) x.fillRect(4 + fx * 10, 4 + fy * 8.5, 6, 5);
    }),
    trampilla: (col) => lienzo(48, 48, (x, w, h) => {
      x.fillStyle = '#3a332a'; x.fillRect(0, 0, w, h);                 // marco
      x.fillStyle = '#060402'; x.fillRect(5, 5, w - 10, h - 10);        // hueco
      const g = x.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, 18);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.globalAlpha = 0.55; x.fillStyle = g; x.fillRect(5, 5, w - 10, h - 10);
      x.globalAlpha = 1;
      x.fillStyle = '#5a5044';                                          // bisagras
      x.fillRect(8, 2, 8, 4); x.fillRect(w - 16, 2, 8, 4);
    }),
    sueloGrieta: () => lienzo(48, 48, (x, w, h) => {
      x.clearRect(0, 0, w, h);
      x.strokeStyle = 'rgba(24,17,8,0.95)'; x.lineWidth = 3;
      x.beginPath();
      x.moveTo(3, 26); x.lineTo(16, 20); x.lineTo(24, 28);
      x.lineTo(34, 13); x.lineTo(45, 20);
      x.moveTo(24, 28); x.lineTo(30, 44);
      x.moveTo(16, 20); x.lineTo(12, 6);
      x.stroke();
    }),
    escalera: (col) => lienzo(48, 48, (x, w, h) => {
      x.fillStyle = '#0a0806'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 6; i++) {
        x.fillStyle = SH(col, 0.95 - i * 0.14);
        x.fillRect(4, 4 + i * 7, w - 8, 6);
      }
    }),
    taquilla: () => lienzo(48, 84, (x, w, h) => {
      x.fillStyle = '#5a6a74'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#39434b'; x.lineWidth = 2;
      x.strokeRect(1, 1, w - 2, h - 2);
      x.beginPath(); x.moveTo(w / 2, 2); x.lineTo(w / 2, h - 2); x.stroke();  // dos puertas
      x.fillStyle = '#414c54';
      for (const px2 of [6, w / 2 + 4])                                       // rejillas
        for (let ry = 8; ry <= 22; ry += 7) x.fillRect(px2, ry, w / 2 - 10, 3);
      x.fillStyle = '#2c343a';                                                // tiradores
      x.fillRect(w / 2 - 7, h / 2 + 4, 3, 12); x.fillRect(w / 2 + 4, h / 2 + 4, 3, 12);
      x.fillStyle = '#39434b'; x.fillRect(0, h - 6, w, 6);                    // zócalo
    }),
    archivador: () => lienzo(48, 84, (x, w, h) => {
      x.fillStyle = '#7a7264'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#544e42'; x.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        x.strokeRect(4, 4 + i * 20, w - 8, 17);
        x.fillStyle = '#4a463c'; x.fillRect(w / 2 - 7, 11 + i * 20, 14, 4);
      }
    }),
    nevera: () => lienzo(48, 84, (x, w, h) => {
      x.fillStyle = '#c8d0cc'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#8e9a94'; x.lineWidth = 2;
      x.strokeRect(1, 1, w - 2, h - 2);
      x.beginPath(); x.moveTo(2, 28); x.lineTo(w - 2, 28); x.stroke();
      x.fillStyle = '#6e7a74';
      x.fillRect(w - 10, 8, 4, 14); x.fillRect(w - 10, 34, 4, 26);
    }),
    camilla: () => lienzo(48, 32, (x, w, h) => {
      x.fillStyle = '#c8d4cc'; x.fillRect(0, 0, w, 12);                 // colchoneta
      x.fillStyle = '#e0e8e2'; x.fillRect(0, 0, w, 4);
      x.fillStyle = '#6a746e'; x.fillRect(0, 12, w, h - 12);            // faldón
      x.fillStyle = '#3a403c';
      x.beginPath(); x.arc(9, h - 4, 4, 0, 7); x.fill();
      x.beginPath(); x.arc(w - 9, h - 4, 4, 0, 7); x.fill();
    }),
    cofre: () => lienzo(44, 48, (x, w, h) => {
      x.fillStyle = '#8a6a42'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#6e5434'; x.fillRect(0, 0, w, 12);
      x.fillRect(w / 2 - 3, 0, 6, h);
      x.fillStyle = '#e0b040'; x.fillRect(w / 2 - 5, 16, 10, 12);
    }),
    caja: () => lienzo(44, 48, (x, w, h) => {
      x.fillStyle = '#8a6a42'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#5e4830'; x.lineWidth = 3;
      x.strokeRect(2, 2, w - 4, h - 4);
      x.beginPath(); x.moveTo(2, 2); x.lineTo(w - 2, h - 2);
      x.moveTo(w - 2, 2); x.lineTo(2, h - 2); x.stroke();
    }),
    bidon: () => lienzo(44, 48, (x, w, h) => {
      x.fillStyle = '#4a6858'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#5e7c6c'; x.fillRect(6, 0, 10, h);
      x.fillStyle = '#324a3e';
      x.fillRect(0, 10, w, 5); x.fillRect(0, 30, w, 5);
    }),
    grieta: () => lienzo(44, 64, (x, w, h) => {
      // muro agrietado (fondo transparente: se pega sobre la pared real)
      x.strokeStyle = 'rgba(16,12,8,0.9)';
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(w / 2, 2);
      x.lineTo(w / 2 - 6, 16); x.lineTo(w / 2 + 4, 28);
      x.lineTo(w / 2 - 4, 42); x.lineTo(w / 2 + 6, 54); x.lineTo(w / 2 + 2, h - 2);
      x.stroke();
      x.lineWidth = 1.5;
      x.beginPath();
      x.moveTo(w / 2 - 6, 16); x.lineTo(w / 2 - 15, 22);
      x.moveTo(w / 2 + 4, 28); x.lineTo(w / 2 + 14, 31);
      x.moveTo(w / 2 - 4, 42); x.lineTo(w / 2 - 13, 48);
      x.moveTo(w / 2 + 6, 54); x.lineTo(w / 2 + 13, 58);
      x.stroke();
      x.globalAlpha = 0.35;                          // un hilo de luz se cuela
      x.strokeStyle = '#fff8e0';
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(w / 2 - 1, 4); x.lineTo(w / 2 - 5, 16); x.lineTo(w / 2 + 3, 28);
      x.stroke();
    }),
    boquete: () => lienzo(44, 64, (x, w, h) => {
      // pared ROTA: boquete negro con luz blanca dentro (florece con el bloom)
      x.fillStyle = '#0a0806';
      x.beginPath();
      x.moveTo(6, 8); x.lineTo(16, 3); x.lineTo(30, 6); x.lineTo(w - 5, 14);
      x.lineTo(w - 8, 40); x.lineTo(w - 4, h - 8); x.lineTo(20, h - 3);
      x.lineTo(5, h - 12); x.lineTo(8, 30);
      x.closePath(); x.fill();
      x.fillStyle = '#ffffff';                       // la luz del otro lado
      x.beginPath();
      x.moveTo(12, 14); x.lineTo(26, 9); x.lineTo(w - 10, 18);
      x.lineTo(w - 12, 42); x.lineTo(w - 9, h - 13); x.lineTo(20, h - 9);
      x.lineTo(10, h - 17); x.lineTo(12, 32);
      x.closePath(); x.fill();
    }),
    planta: () => lienzo(40, 44, (x, w, h) => {
      // helecho: tallos con hojas (fondo transparente)
      for (let i = 0; i < 6; i++) {
        const bx = 6 + i * 5.5, alto = 16 + (i * 13) % 20;
        x.strokeStyle = i % 2 ? '#3f7a48' : '#59985e';
        x.lineWidth = 2;
        x.beginPath();
        x.moveTo(w / 2, h);
        x.quadraticCurveTo(bx, h - alto / 2, bx + (i % 2 ? 3 : -3), h - alto);
        x.stroke();
        x.fillStyle = i % 2 ? '#4e8c55' : '#6aad70';
        x.beginPath();
        x.ellipse(bx + (i % 2 ? 3 : -3), h - alto, 3.5, 6, 0.4, 0, 7);
        x.fill();
      }
    }),
  };
  function pintado(clave, fn) {
    if (texCache.has(clave)) return texCache.get(clave);
    return tex(fn(), clave);
  }

  // ---------- construcción de la escena del nivel ----------
  let lastLevelId = null;
  let lastRunSeed = null;   // partida a la que pertenece la escena actual
  let solidosCamara = [];
  const rayo = new THREE.Raycaster();

  function disposeGrupo(grupo, keepTex) {
    if (!grupo) return;
    grupo.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { if (!keepTex && m.map) m.map.dispose(); m.dispose(); }
      }
    });
    scene.remove(grupo);
  }

  // los actores (jugador/entidades/items) viven FUERA de la estática: así una
  // reconstrucción del nivel no los toca y sus posiciones siguen siendo de mundo
  function limpiarActores() {
    if (actorGroup) disposeGrupo(actorGroup, true);
    actorGroup = new THREE.Group();
    scene.add(actorGroup);
    entitySprites.clear();
    itemSprites.clear();
    otrosSprites.clear();
    playerSprite = null;
  }

  function quad(pos, uv, idx, corners, uvRect, nor) {
    const base = pos.length / 3;
    for (const c of corners) pos.push(c[0], c[1], c[2]);
    const [u0, v0, u1, v1] = uvRect;
    uv.push(u0, v1, u1, v1, u1, v0, u0, v0);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    if (nor) {
      // normal del plano (las 4 esquinas son coplanares) — evita el pase caro
      // de computeVertexNormals sobre decenas de miles de vértices
      const ax = corners[1][0] - corners[0][0], ay = corners[1][1] - corners[0][1], az = corners[1][2] - corners[0][2];
      const bx = corners[2][0] - corners[0][0], by = corners[2][1] - corners[0][1], bz = corners[2][2] - corners[0][2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      for (let i = 0; i < 4; i++) nor.push(nx, ny, nz);
    }
  }

  // texturas de lateral/tapa para cajas, muebles y marcos: NINGUNA cara plana (v17)
  function ladoTex(clave, colorNum, estilo) {
    const col = '#' + colorNum.toString(16).padStart(6, '0');
    return pintado('lado-' + clave, () => lienzo(32, 32, (x, w, h) => {
      x.fillStyle = col; x.fillRect(0, 0, w, h);
      if (estilo === 'madera') {
        for (let i = 0; i < 4; i++) { x.fillStyle = SH(col, 0.84); x.fillRect(0, 2 + i * 8, w, 2); }
        x.fillStyle = SH(col, 1.1); x.fillRect(0, 0, w, 2);
        x.strokeStyle = SH(col, 0.62); x.lineWidth = 2; x.strokeRect(1, 1, w - 2, h - 2);
      } else { // metal
        x.fillStyle = SH(col, 1.12); x.fillRect(0, 0, w, 3);
        x.fillStyle = SH(col, 0.78); x.fillRect(0, h - 4, w, 4);
        x.fillStyle = SH(col, 0.9);
        for (const [px2, py2] of [[3, 3], [w - 5, 3], [3, h - 5], [w - 5, h - 5]])
          x.fillRect(px2, py2, 2, 2);                              // remaches
        x.strokeStyle = SH(col, 0.65); x.strokeRect(0.5, 0.5, w - 1, h - 1);
      }
    }));
  }

  // Construcción de la ESTÁTICA del nivel como GENERADOR (v17): el bucle de
  // frame lo avanza con presupuesto de milisegundos — la expansión del nivel
  // infinito ya no congela ni un frame (la escena vieja sigue en pantalla,
  // realineada, hasta que la nueva está lista).
  function* construirEstatica(world, out) {
    const g = world.map.grid;
    const T = MapGen.T;
    const tiles = world.tiles;
    const pal = world.level.paleta;
    const grupo = new THREE.Group();
    if (out) out.parcial = grupo; // para poder desechar una construcción abortada
    const solidos = [];
    let panelMatsNuevo = [];
    const panelPositionsNuevo = [];
    const transMats = {};

    // --- SUELO CONTINUO: una sola textura seamless repetida con UV de mundo ---
    const floorTex = tex(tiles.sueloSeam || tiles.suelo[0], 'suelo-seam');
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    // la textura macro cubre 2×2 tiles → los UV de mundo se dividen entre 2
    const uvEsc = tiles.sueloSeam ? 0.5 : 1;
    const aguaTex = tex(tiles.agua, 'agua-tile');
    // v19: las mallas grandes se trocean en FRANJAS de 16 filas — el swap del
    // rebuild las revela escalonadas y la subida a GPU se reparte entre frames
    const bandas = [];
    const mkFlat = (pos, uv, idx, nor, material) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setIndex(idx);
      const m = new THREE.Mesh(geo, material);
      m.receiveShadow = true;
      return m;
    };
    const matSuelo = new THREE.MeshLambertMaterial({ map: floorTex });
    transMats.floor = matSuelo;
    let floorPos = [], floorUv = [], floorIdx = [], floorNor = [];
    const flushSuelo = () => {
      if (!floorPos.length) return;
      const m = mkFlat(floorPos, floorUv, floorIdx, floorNor, matSuelo);
      grupo.add(m);
      bandas.push(m);
      floorPos = []; floorUv = []; floorIdx = []; floorNor = [];
    };
    const aguaPos = [], aguaUv = [], aguaIdx = [], aguaNor = [];
    const plantas = [];
    const esVerde = world.level.bioma === 'invernadero' || world.level.bioma === 'bosque';
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const v = g.t[y * g.w + x];
        if (v === T.VACIO || v === T.PARED) continue;
        // UV = coordenadas de mundo → continuidad perfecta
        quad(floorPos, floorUv, floorIdx,
          [[x, 0, y + 1], [x + 1, 0, y + 1], [x + 1, 0, y], [x, 0, y]],
          [x * uvEsc, y * uvEsc, (x + 1) * uvEsc, (y + 1) * uvEsc], floorNor);
        if (v === T.AGUA)
          quad(aguaPos, aguaUv, aguaIdx,
            [[x, 0.02, y + 1], [x + 1, 0.02, y + 1], [x + 1, 0.02, y], [x, 0.02, y]],
            [0, 0, 1, 1], aguaNor);
        else if (v === T.DECOR && esVerde) plantas.push([x, y]);
      }
      if ((y & 15) === 15) { flushSuelo(); yield; }
    }
    flushSuelo();
    if (aguaPos.length)
      grupo.add(mkFlat(aguaPos, aguaUv, aguaIdx, aguaNor, new THREE.MeshLambertMaterial({ map: aguaTex })));
    yield;
    // plantas 3D (dos planos cruzados) en salas-jardín/bosques
    if (plantas.length) {
      const plantaTex = pintado('p-planta', PINTORES.planta);
      const plantaMat = new THREE.MeshLambertMaterial({ map: plantaTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.3 });
      for (const [x, y] of plantas) {
        for (const rot of [0, Math.PI / 2]) {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.85), plantaMat);
          m.position.set(x + 0.5, 0.42, y + 0.5);
          m.rotation.y = rot + ((x * 7 + y * 3) % 5) * 0.2;
          grupo.add(m);
        }
      }
    }

    // --- muros ---
    const esWall = (x, y) => MapGen.at(g, x, y) === T.PARED;
    if (tiles.wallStyle === 'tabique') {
      // cara sin la franja de techo (solo el muro): recorte del caraFull
      let caraSolo = texCache.get('muro-lado') ? null : document.createElement('canvas');
      if (caraSolo) {
        caraSolo.width = 48; caraSolo.height = 48;
        caraSolo.getContext('2d').drawImage(tiles.caraFull[1], 0, Tiles.RF, 48, Tiles.FH, 0, 0, 48, 48);
      }
      const matLado = new THREE.MeshLambertMaterial({
        map: tex(caraSolo, 'muro-lado'),
        // Una emisión mínima evita la banda negra de autosombreado junto al
        // techo sin convertir el papel en una superficie luminosa.
        emissive: world.level.id === 'level-0' ? pal.pared : 0x000000,
        emissiveIntensity: world.level.id === 'level-0' ? 0.075 : 0,
      });
      transMats.wall = matLado;
      const matTecho = new THREE.MeshLambertMaterial({ map: tex(tiles.techo, 'muro-techo') });
      let sidePos = [], sideUv = [], sideIdx = [], sideNor = [];
      let topPos = [], topUv = [], topIdx = [], topNor = [];
      const flushMuros = () => {
        if (sidePos.length) {
          const m = mkFlat(sidePos, sideUv, sideIdx, sideNor, matLado);
          m.castShadow = true;
          grupo.add(m); bandas.push(m); solidos.push(m);
        }
        if (topPos.length) {
          const m = mkFlat(topPos, topUv, topIdx, topNor, matTecho);
          grupo.add(m); bandas.push(m); solidos.push(m);
        }
        sidePos = []; sideUv = []; sideIdx = []; sideNor = [];
        topPos = []; topUv = []; topIdx = []; topNor = [];
      };
      for (let y = 0; y < g.h; y++) {
        for (let x = 0; x < g.w; x++) {
          if (!esWall(x, y)) continue;
          const h = WALL_H;
          // caras laterales solo hacia espacios abiertos (culling interior)
          if (!esWall(x, y + 1)) quad(sidePos, sideUv, sideIdx,
            [[x, 0, y + 1], [x + 1, 0, y + 1], [x + 1, h, y + 1], [x, h, y + 1]], [0, 0, 1, 1], sideNor);
          if (!esWall(x, y - 1)) quad(sidePos, sideUv, sideIdx,
            [[x + 1, 0, y], [x, 0, y], [x, h, y], [x + 1, h, y]], [0, 0, 1, 1], sideNor);
          if (!esWall(x - 1, y)) quad(sidePos, sideUv, sideIdx,
            [[x, 0, y], [x, 0, y + 1], [x, h, y + 1], [x, h, y]], [0, 0, 1, 1], sideNor);
          if (!esWall(x + 1, y)) quad(sidePos, sideUv, sideIdx,
            [[x + 1, 0, y + 1], [x + 1, 0, y], [x + 1, h, y], [x + 1, h, y + 1]], [0, 0, 1, 1], sideNor);
          quad(topPos, topUv, topIdx,
            [[x, h, y + 1], [x + 1, h, y + 1], [x + 1, h, y], [x, h, y]], [0, 0, 1, 1], topNor);
        }
        if ((y & 15) === 15) { flushMuros(); yield; }
      }
      flushMuros();
      yield;

      // Enchufes dispersos del Level 0. Son detalle ambiental pixel-art, no
      // botín ni interacción; su distribución es estable para cada semilla.
      if (world.level.id === 'level-0') {
        const eTex = pintado('p-enchufe-level0', PINTORES.enchufe);
        const eMat = new THREE.MeshLambertMaterial({ map: eTex });
        const eGeo = new THREE.PlaneGeometry(0.18, 0.22);
        const tieneSalida = (x, y) => world.map.exits.some((e) => e.x === x && e.y === y);
        const abierto = (x, y) => {
          const v = MapGen.at(g, x, y);
          return v !== T.VACIO && v !== T.PARED;
        };
        const caras = [
          { dx: 0, dy: 1, tag: 's', rot: 0,
            pos: (x, y) => [x + 0.5, 0.34, y + 1.006] },
          { dx: 0, dy: -1, tag: 'n', rot: Math.PI,
            pos: (x, y) => [x + 0.5, 0.34, y - 0.006] },
          { dx: -1, dy: 0, tag: 'o', rot: -Math.PI / 2,
            pos: (x, y) => [x - 0.006, 0.34, y + 0.5] },
          { dx: 1, dy: 0, tag: 'e', rot: Math.PI / 2,
            pos: (x, y) => [x + 1.006, 0.34, y + 0.5] },
        ];
        for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
          if (!esWall(x, y)) continue;
          for (const cara of caras) {
            const ox = x + cara.dx, oy = y + cara.dy;
            if (!abierto(ox, oy) || tieneSalida(ox, oy)) continue;
            const key = `${world.runSeed}:${world.ventanaN || 0}:${x}:${y}:${cara.tag}`;
            if (seededUnit(key) >= 0.012) continue;
            const m = new THREE.Mesh(eGeo, eMat);
            m.position.set(...cara.pos(x, y));
            m.rotation.y = cara.rot;
            grupo.add(m);
          }
        }
        yield;
      }

      // --- TECHO REAL (solo 3ª persona e interiores): la cámara va por debajo,
      // así que el nivel se siente un interior cerrado de verdad. Los paneles
      // fluorescentes son ESTÁTICOS (parte del techo, florecen con el bloom). ---
      if (CAM_MODO === 'tercera' && world.level.bioma !== 'invernadero') {
        const plafonTex = pintado('plafon-' + world.level.id, () => lienzo(48, 48, (ctx2, w2, h2) => {
          const lobby = world.level.id === 'level-0';
          ctx2.fillStyle = SH(pal.pared, lobby ? 0.78 : 0.42);
          ctx2.fillRect(0, 0, w2, h2);
          ctx2.strokeStyle = SH(pal.pared, lobby ? 0.62 : 0.3); // juntas de placas
          ctx2.strokeRect(0.5, 0.5, w2 - 1, h2 - 1);
          if (!lobby) {
            ctx2.fillStyle = SH(pal.pared, 0.36);             // manchas de humedad
            ctx2.fillRect(6, 8, 10, 6); ctx2.fillRect(30, 26, 8, 9);
          }
        }));
        plafonTex.wrapS = plafonTex.wrapT = THREE.RepeatWrapping;
        const matPlafon = new THREE.MeshLambertMaterial({ map: plafonTex });
        transMats.ceiling = matPlafon;
        let cPos = [], cUv = [], cIdx = [], cNor = [];
        const flushTecho = () => {
          if (!cPos.length) return;
          const m = mkFlat(cPos, cUv, cIdx, cNor, matPlafon);
          grupo.add(m); bandas.push(m);
          cPos = []; cUv = []; cIdx = []; cNor = [];
        };
        // paneles cada 4×4 tiles en niveles iluminados, 6×6 en penumbra, ninguno a oscuras
        const osc = world.level.oscuridad || 0;
        const cada = osc < 0.45 ? 4 : osc < 0.75 ? 6 : 0;
        for (let y = 0; y < g.h; y++) {
          for (let x = 0; x < g.w; x++) {
            const v = g.t[y * g.w + x];
            if (v === T.VACIO || v === T.PARED) continue;
            // cara inferior del techo (se ve desde abajo)
            quad(cPos, cUv, cIdx,
              [[x, WALL_H, y], [x + 1, WALL_H, y], [x + 1, WALL_H, y + 1], [x, WALL_H, y + 1]],
              [x, y, x + 1, y + 1], cNor);
          }
          if ((y & 15) === 15) { flushTecho(); yield; }
        }
        flushTecho();
        if (cada) {
          const N_GRUPOS = 8;
          const pg = Array.from({ length: N_GRUPOS }, () => ({ pos: [], uv: [], idx: [] }));
          const usados = new Set();
          const abierto = (x, y) => {
            const v = MapGen.at(g, x, y);
            return v !== T.VACIO && v !== T.PARED;
          };
          // Distancia COMPLETA a las cuatro paredes en O(n). El límite anterior
          // de 12 tiles partía salas anchas y acababa creando líneas duplicadas.
          const nCeldas = g.w * g.h;
          const izq = new Uint16Array(nCeldas), der = new Uint16Array(nCeldas);
          const arriba = new Uint16Array(nCeldas), abajo = new Uint16Array(nCeldas);
          for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
            if (!abierto(x, y)) continue;
            const i = y * g.w + x;
            izq[i] = 1 + (x ? izq[i - 1] : 0);
            arriba[i] = 1 + (y ? arriba[i - g.w] : 0);
          }
          for (let y = g.h - 1; y >= 0; y--) for (let x = g.w - 1; x >= 0; x--) {
            if (!abierto(x, y)) continue;
            const i = y * g.w + x;
            der[i] = 1 + (x + 1 < g.w ? der[i + 1] : 0);
            abajo[i] = 1 + (y + 1 < g.h ? abajo[i + g.w] : 0);
          }
          const propuestas = new Map();
          const agrega = (key, p) => {
            const anterior = propuestas.get(key);
            if (!anterior || p.score > anterior.score) propuestas.set(key, p);
          };
          // Pasillos verticales: cada fila continua entre dos paredes aporta UN
          // único centro X. Solo se muestrea a lo largo de Y.
          for (let y = Math.floor(cada / 2); y < g.h; y += cada) {
            let x = 0;
            while (x < g.w) {
              while (x < g.w && !abierto(x, y)) x++;
              const inicio = x;
              while (x < g.w && abierto(x, y)) x++;
              const fin = x;
              if (fin <= inicio) continue;
              const cx2 = (inicio + fin) / 2;
              const xi = Math.max(inicio, Math.min(fin - 1, Math.floor(cx2)));
              const i = y * g.w + xi;
              const ancho = fin - inicio, largo = arriba[i] + abajo[i] - 1;
              if (largo < ancho * 1.15) continue;
              agrega(`V:${cx2.toFixed(2)}:${Math.floor(y / cada)}`, {
                cx2, cz2: y + 0.5, vertical: true, score: largo / ancho,
              });
            }
          }
          // Pasillos horizontales: equivalente, intercambiando los ejes.
          for (let x = Math.floor(cada / 2); x < g.w; x += cada) {
            let y = 0;
            while (y < g.h) {
              while (y < g.h && !abierto(x, y)) y++;
              const inicio = y;
              while (y < g.h && abierto(x, y)) y++;
              const fin = y;
              if (fin <= inicio) continue;
              const cz2 = (inicio + fin) / 2;
              const yi = Math.max(inicio, Math.min(fin - 1, Math.floor(cz2)));
              const i = yi * g.w + x;
              const alto = fin - inicio, largo = izq[i] + der[i] - 1;
              if (largo < alto * 1.15) continue;
              agrega(`H:${cz2.toFixed(2)}:${Math.floor(x / cada)}`, {
                cx2: x + 0.5, cz2, vertical: false, score: largo / alto,
              });
            }
          }
          // Las salas casi cuadradas reciben un único panel en su centro, no
          // una cuadrícula lateral. Todos sus tiles calculan el mismo centro.
          for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
            if (!abierto(x, y)) continue;
            const i = y * g.w + x;
            const spanX = izq[i] + der[i] - 1, spanY = arriba[i] + abajo[i] - 1;
            const ratio = spanX / spanY;
            if (ratio < 0.75 || ratio > 1.33) continue;
            const cx2 = (x - izq[i] + 1 + x + der[i]) / 2;
            const cz2 = (y - arriba[i] + 1 + y + abajo[i]) / 2;
            agrega(`R:${cx2.toFixed(2)}:${cz2.toFixed(2)}`, {
              cx2, cz2, vertical: spanY >= spanX, score: 1,
            });
          }
          // En cruces puede coincidir una propuesta horizontal con otra vertical.
          // La supresión espacial impide dos luminarias paralelas cercanas.
          const elegidos = [];
          for (const propuesta of [...propuestas.values()].sort((a, b) => b.score - a.score)) {
            if (elegidos.some((p) => Math.hypot(p.cx2 - propuesta.cx2, p.cz2 - propuesta.cz2) < cada * 0.85)) continue;
            elegidos.push(propuesta);
          }
          for (const mejor of elegidos) {
            // El centro geométrico de un pasillo par cae sobre una junta del
            // falso techo. Ajusta al centro de la placa más cercana para que
            // el fluorescente quede físicamente dentro del cuadrado.
            const cx2 = Math.floor(mejor.cx2) + 0.5;
            const cz2 = Math.floor(mejor.cz2) + 0.5;
            const keyPanel = `${cx2.toFixed(2)}:${cz2.toFixed(2)}`;
            if (usados.has(keyPanel)) continue;
            usados.add(keyPanel);
            const hw = mejor.vertical ? 0.16 : 0.42;
            const hd = mejor.vertical ? 0.42 : 0.16;
            const grupoPanel = panelGroup(`${world.runSeed}:${world.ventanaN || 0}`, cx2, cz2, N_GRUPOS);
            const datos = pg[grupoPanel];
            panelPositionsNuevo.push({ x: cx2, z: cz2, group: grupoPanel });
            const yP = WALL_H - 0.02;
            quad(datos.pos, datos.uv, datos.idx,
              [[cx2 - hw, yP, cz2 - hd], [cx2 + hw, yP, cz2 - hd],
               [cx2 + hw, yP, cz2 + hd], [cx2 - hw, yP, cz2 + hd]],
              [0, 0, 1, 1]);
          }
          for (const datos of pg) {
            if (!datos.pos.length) { panelMatsNuevo.push(null); continue; }
            const pgeo = new THREE.BufferGeometry();
            pgeo.setAttribute('position', new THREE.Float32BufferAttribute(datos.pos, 3));
            pgeo.setAttribute('uv', new THREE.Float32BufferAttribute(datos.uv, 2));
            pgeo.setIndex(datos.idx);
            const mat = new THREE.MeshBasicMaterial({ color: 0xfff6dc, toneMapped: false, fog: false });
            panelMatsNuevo.push(mat);
            const pm = new THREE.Mesh(pgeo, mat);
            grupo.add(pm); bandas.push(pm);
          }
        }
        yield;
      }
    } else {
      // bosque/exterior: árboles y rocas como billboards verticales
      const canvas = tiles.wallStyle === 'arbol' ? tiles.arbol : tiles.roca;
      const mat = new THREE.SpriteMaterial({ map: tex(canvas, 'muro-organico'), transparent: true });
      for (let y = 0; y < g.h; y++) {
        for (let x = 0; x < g.w; x++) {
          if (!esWall(x, y)) continue;
          const s = new THREE.Sprite(mat);
          const escala = tiles.wallStyle === 'arbol' ? 1.5 : 1.25;
          s.scale.set(escala, escala * (canvas.height / canvas.width), 1);
          s.position.set(x + 0.5, escala * 0.48, y + 0.5);
          grupo.add(s);
        }
        if ((y & 15) === 15) yield;
      }
    }

    // --- salidas (pintores a medida) ---
    world.map.exits.forEach((ex, exI) => {
      const paredNorte = esWall(ex.x, ex.y - 1) && tiles.wallStyle === 'tabique';
      const estilo = Render.exitStyle(ex.def);
      const col = ex.def.tipo === 'escape' ? '#6ae86a' : ex.def.tipo === 'sellada' ? '#8a8a86' : '#e8c95a';
      const rit = ex.def.ritual;

      // pared AGRIETADA (v20): panel pegado al muro; rota = boquete con luz
      // blanca que FLORECE con el bloom (material sin tone mapping)
      if (ex.def._mec === 'romper') {
        const abierta = !!ex.def._abierta;
        const t2 = pintado(abierta ? 'p-boquete' : 'p-grieta',
          abierta ? PINTORES.boquete : PINTORES.grieta);
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(0.95, 1.9),
          abierta
            ? new THREE.MeshBasicMaterial({ map: t2, transparent: true, toneMapped: false })
            : new THREE.MeshLambertMaterial({ map: t2, transparent: true })
        );
        // plano pegado a la cara sur del muro norte (mirando al jugador)
        m.position.set(ex.x + 0.5, 0.95, paredNorte ? ex.y + 0.03 : ex.y + 0.5);
        grupo.add(m);
        return;
      }

      if (ex.def._mec === 'romper_suelo' && !ex.def._abierta) {
        const t2 = pintado('p-suelo-grieta', PINTORES.sueloGrieta);
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(0.96, 0.96),
          new THREE.MeshBasicMaterial({ map: t2, transparent: true })
        );
        m.rotation.x = -Math.PI / 2;
        m.position.set(ex.x + 0.5, 0.03, ex.y + 0.5);
        grupo.add(m);
        return;
      }

      if (rit === 'nave') {
        // pedestal 3D con la nave encima (billboard detallado existente)
        const ped = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.6, 0.5),
          new THREE.MeshLambertMaterial({ map: ladoTex('pedestal', 0x6a6a72, 'metal') })
        );
        ped.position.set(ex.x + 0.5, 0.3, ex.y + 0.5);
        ped.castShadow = true;
        grupo.add(ped);
        const s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: tex(Render.exitToCanvas(ex.def), 'exit-' + exI), transparent: true,
        }));
        s.scale.set(0.8, 1.2, 1);
        s.position.set(ex.x + 0.5, 0.95, ex.y + 0.5);
        grupo.add(s);
        return;
      }
      if (estilo === 'trampilla' || estilo === 'escalera') {
        const t2 = pintado('p-' + estilo + col, () => PINTORES[estilo](col));
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(0.96, 0.96),
          new THREE.MeshBasicMaterial({ map: t2 })
        );
        m.rotation.x = -Math.PI / 2;
        m.position.set(ex.x + 0.5, 0.025, ex.y + 0.5);
        grupo.add(m);
        return;
      }
      // sin pared al norte no hay puerta que valga: se degrada a trampilla
      // (garantía visual: nada de puertas flotando en medio)
      if (!paredNorte && tiles.wallStyle === 'tabique') {
        const t2 = pintado('p-trampilla' + col, () => PINTORES.trampilla(col));
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(0.96, 0.96),
          new THREE.MeshBasicMaterial({ map: t2 })
        );
        m.rotation.x = -Math.PI / 2;
        m.position.set(ex.x + 0.5, 0.025, ex.y + 0.5);
        grupo.add(m);
        return;
      }
      // elementos de pared con su pintor, tamaño y material de canto propios
      const SPEC = {
        vending: { p: 'vending', w: 0.8, h: 1.32, y: 0.66, grosor: 0.42, ladoCol: 0x701828, ladoEst: 'metal' },
        reloj: { p: 'reloj', w: 0.9, h: 0.5, y: 1.15, grosor: 0.06, ladoCol: 0x20242a, ladoEst: 'metal' },
        boton: { p: 'boton', w: 0.52, h: 0.52, y: 1.0, grosor: 0.06, ladoCol: 0x8a92a0, ladoEst: 'metal' },
        edificio: { p: 'edificio', w: 0.95, h: 1.4, y: 0.7, grosor: 0.12, ladoCol: 0x2c333d, ladoEst: 'metal' },
        ventana: { p: 'ventana', w: 0.9, h: 1.3, y: 0.75, grosor: 0.07, ladoCol: 0x2a2a2e, ladoEst: 'metal' },
        puerta: { p: 'puerta', w: 0.92, h: 1.36, y: 0.68, grosor: 0.08, ladoCol: 0x241c14, ladoEst: 'madera' },
      };
      const spec = SPEC[rit] ?? SPEC[estilo] ?? SPEC.puerta;
      const t2 = pintado('p-' + spec.p + col, () => PINTORES[spec.p](col));
      const frente = new THREE.MeshBasicMaterial({ map: t2 });
      const lado = new THREE.MeshLambertMaterial({ map: ladoTex(spec.p, spec.ladoCol, spec.ladoEst) });
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(spec.w, spec.h, spec.grosor),
        [lado, lado, lado, lado, frente, lado]
      );
      // pegado al muro norte; si no hay muro (raro), exento pero sólido
      m.position.set(ex.x + 0.5, spec.y, paredNorte ? ex.y + spec.grosor / 2 + 0.01 : ex.y + 0.5);
      m.castShadow = true;
      grupo.add(m);
    });
    yield;

    // --- props: muebles como GEOMETRÍA 3D empotrada, no sprays 2D ---
    const PROPS_PARED = new Set(['taquilla', 'archivador', 'nevera', 'reloj', 'camilla']);
    const CAJAS = new Set(['cofre', 'caja', 'bidon']);
    const LADO_COLOR = {
      taquilla: 0x46525c, archivador: 0x625c4e, nevera: 0xa8b0ac, camilla: 0x7e8882,
      reloj: 0x20242a, cofre: 0x5e4830, caja: 0x6e5434, bidon: 0x324a3e,
    };
    const LADO_ESTILO = {
      taquilla: 'metal', archivador: 'metal', nevera: 'metal', camilla: 'metal',
      reloj: 'metal', cofre: 'madera', caja: 'madera', bidon: 'metal',
    };
    const ladoDe = (id) => new THREE.MeshLambertMaterial({
      map: ladoTex(id, LADO_COLOR[id] ?? 0x555550, LADO_ESTILO[id] ?? 'metal'),
    });
    for (const pr of world.map.props || []) {
      const arrimado = PROPS_PARED.has(pr.id) && esWall(pr.x, pr.y - 1);
      const conPintor = PINTORES[pr.id];
      if (pr.id === 'reloj' && arrimado) {
        // reloj digital 88:88 (Level 80): PLACA colgada del muro a la altura de
        // la vista — nunca un armario plantado en medio del pasillo
        const frente = new THREE.MeshBasicMaterial({ map: pintado('p-reloj', PINTORES.reloj) });
        const lado = ladoDe('reloj');
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 0.5, 0.08),
          [lado, lado, lado, lado, frente, lado]
        );
        m.position.set(pr.x + 0.5, 1.15, pr.y + 0.05);
        grupo.add(m);
        pr._mesh3d = m;
      } else if (arrimado && conPintor) {
        // mueble EMPOTRADO contra el muro con su frente pintado a medida
        const esCamilla = pr.id === 'camilla';
        const frente = new THREE.MeshLambertMaterial({ map: pintado('p-' + pr.id, conPintor) });
        const lado = ladoDe(pr.id);
        const m = new THREE.Mesh(
          esCamilla ? new THREE.BoxGeometry(0.92, 0.56, 0.42) : new THREE.BoxGeometry(0.66, 1.14, 0.32),
          [lado, lado, lado, lado, frente, lado]
        );
        m.position.set(pr.x + 0.5, esCamilla ? 0.28 : 0.57, pr.y + (esCamilla ? 0.28 : 0.18));
        m.castShadow = true;
        grupo.add(m);
        pr._mesh3d = m;
      } else if (pr.id === 'bidon') {
        // cilindro de verdad (lateral pintado + tapas de metal, nada plano)
        const m = new THREE.Mesh(
          new THREE.CylinderGeometry(0.26, 0.26, 0.66, 10),
          [new THREE.MeshLambertMaterial({ map: pintado('p-bidon', PINTORES.bidon) }),
           ladoDe('bidon'), ladoDe('bidon')]
        );
        m.position.set(pr.x + 0.5, 0.33, pr.y + 0.5);
        m.castShadow = true;
        grupo.add(m);
        pr._mesh3d = m;
      } else if (CAJAS.has(pr.id) && conPintor) {
        // la caja de tablones lleva su textura en LAS SEIS caras; el cofre,
        // frente pintado + cantos de madera con veta
        const frente = new THREE.MeshLambertMaterial({ map: pintado('p-' + pr.id, conPintor) });
        const lado = ladoDe(pr.id);
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(0.55, 0.62, 0.45),
          pr.id === 'caja'
            ? frente
            : [lado, lado, lado, lado, frente, lado]
        );
        m.position.set(pr.x + 0.5, 0.31, pr.y + 0.5);
        m.castShadow = true;
        grupo.add(m);
        pr._mesh3d = m;
      } else {
        // props menores como PRIMITIVAS 3D (nada de sprays 2D)
        const grp = new THREE.Group();
        const M = (geo, color) => {
          const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
          m.castShadow = true;
          grp.add(m);
          return m;
        };
        switch (pr.id) {
          case 'silla': {
            M(new THREE.BoxGeometry(0.4, 0.06, 0.4), 0x6e5a44).position.y = 0.3;   // asiento
            M(new THREE.BoxGeometry(0.4, 0.42, 0.06), 0x6e5a44).position.set(0, 0.51, -0.17); // respaldo
            for (const [lx, lz] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]])
              M(new THREE.BoxGeometry(0.05, 0.3, 0.05), 0x55462f).position.set(lx, 0.15, lz);
            break;
          }
          case 'cono': {
            M(new THREE.ConeGeometry(0.2, 0.45, 10), 0xd86830).position.y = 0.26;
            M(new THREE.BoxGeometry(0.34, 0.04, 0.34), 0xb85520).position.y = 0.02;
            break;
          }
          case 'seta': {
            M(new THREE.CylinderGeometry(0.06, 0.08, 0.24, 8), 0xe8e0d0).position.y = 0.12;
            const sombrero = M(new THREE.SphereGeometry(0.2, 10, 6, 0, 7, 0, Math.PI / 2), 0xb060c8);
            sombrero.position.y = 0.24;
            break;
          }
          case 'roca_p': {
            const r = M(new THREE.IcosahedronGeometry(0.24, 0), 0x7a7a72);
            r.position.y = 0.16;
            r.scale.set(1.2, 0.7, 1);
            r.rotation.y = (pr.x * 7 + pr.y) % 6;
            break;
          }
          case 'farola': {
            M(new THREE.CylinderGeometry(0.035, 0.05, 1.5, 6), 0x2a2a30).position.y = 0.75;
            const globo = new THREE.Mesh(
              new THREE.SphereGeometry(0.12, 8, 6),
              new THREE.MeshBasicMaterial({ color: 0xffd9a8, toneMapped: false })  // emisivo: florece con el bloom
            );
            globo.position.y = 1.55;
            grp.add(globo);
            break;
          }
          case 'cable': {
            const d = new THREE.Mesh(
              new THREE.PlaneGeometry(0.8, 0.5),
              new THREE.MeshLambertMaterial({ map: tex(Render.propToCanvas('cable'), 'prop-cable'), transparent: true })
            );
            d.rotation.x = -Math.PI / 2;
            d.position.y = 0.02;
            grp.add(d);
            break;
          }
          case 'reloj': { // reloj de pie exento (Level 80)
            M(new THREE.BoxGeometry(0.34, 1.3, 0.24), 0x4e3d2b).position.y = 0.65;
            const cara = new THREE.Mesh(
              new THREE.PlaneGeometry(0.3, 0.44),
              new THREE.MeshBasicMaterial({ map: pintado('p-reloj', PINTORES.reloj) })
            );
            cara.position.set(0, 0.95, 0.125);
            grp.add(cara);
            break;
          }
          default: {
            const s = new THREE.Sprite(new THREE.SpriteMaterial({
              map: tex(Render.propToCanvas(pr.id), 'prop-' + pr.id), transparent: true,
            }));
            s.scale.set(0.9, 1.3, 1);
            s.position.y = 0.55;
            grp.add(s);
          }
        }
        grp.position.set(pr.x + 0.5, 0, pr.y + 0.5);
        grupo.add(grp);
        pr._mesh3d = grp;
      }
    }

    return { grupo, solidos, panelMatsNuevo, panelPositionsNuevo, bandas, transMats };
  }

  // instala la estática recién construida (swap) y la atmósfera del nivel.
  // `progresivo` (expansiones): las bandas entran ocultas y se revelan unas
  // pocas por frame — la subida a GPU se reparte y no hay micro-corte (v19)
  let revelando = null;
  function aplicarEstatica(world, res, progresivo) {
    const viejo = staticGroup;
    staticGroup = res.grupo;
    scene.add(staticGroup);
    solidosCamara = res.solidos;
    panelMats = res.panelMatsNuevo || [];
    panelPositions = res.panelPositionsNuevo || [];
    transitionMats = res.transMats;
    flkHasta = 0;
    flkGrupo = -1;
    if (window.Atmos3D) Atmos3D.buildLevel(world, staticGroup);

    const pal = world.level.paleta;
    const fondo = new THREE.Color(pal.fondo);
    scene.background = fondo;
    fogBase = 0.08 + world.level.oscuridad * 0.16;
    scene.fog = new THREE.FogExp2(fondo, fogBase);
    const esLevel0 = world.level.id === 'level-0';
    amb.intensity = esLevel0 ? 0.22 : Math.max(0.12, 0.55 - world.level.oscuridad * 0.4);
    dlight.intensity = esLevel0 ? 0.14 : 0.35;
    renderer.toneMappingExposure = esLevel0 ? 0.96 : 1.15;
    plight.color = new THREE.Color(pal.luz);
    plight.distance = (world.visionActual() + 3) * 1.6;
    plight.castShadow = !esLevel0;
    ceilingLights.forEach((l, i) => {
      l.color.set(pal.luz);
      l.intensity = 0;
      l.castShadow = esLevel0 && i === 0;
    });

    if (progresivo && viejo && res.bandas.length) {
      // la escena vieja (realineada) sigue tapando: idéntica en el solape
      for (const b of res.bandas) b.visible = false;
      revelando = { bandas: res.bandas, i: 0, viejo };
    } else if (viejo) {
      disposeGrupo(viejo, true);
    }
  }

  // termina de golpe un revelado a medias (llega otro ciclo de rebuild)
  function terminarRevelado() {
    if (!revelando) return;
    for (const b of revelando.bandas) b.visible = true;
    disposeGrupo(revelando.viejo, true);
    revelando = null;
  }

  // sprites de los objetos del suelo: baratos, indexados por posición en el
  // array — se rehacen enteros al cambiar el mapa o world.itemsVersion (tirar)
  function rebuildItems(world) {
    for (const s of itemSprites.values()) { actorGroup.remove(s); s.material.dispose(); }
    itemSprites.clear();
    for (let i = 0; i < world.map.items.length; i++) {
      const it = world.map.items[i];
      if (it.taken) continue;
      const c = Render.itemToCanvas(it.id, world.data.objects);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(c, 'item-' + it.id), transparent: true }));
      s.scale.set(0.55, 0.6, 1);
      s.position.set(it.x + 0.5, 0.22, it.y + 0.5);
      actorGroup.add(s);
      itemSprites.set(i, s);
    }
    itemsVersionVista = world.itemsVersion || 0;
  }

  // centrado inmediato de cámara al entrar en un nivel nuevo
  function centrarCamara(world) {
    const p = world.player;
    if (CAM_MODO === 'tercera') {
      const [fx0, fz0] = ROT_VEC[p.rot ?? 2];
      camYaw = Math.atan2(-fx0, -fz0);
      camera.position.set(p.rx + 0.5 - fx0 * TP.dist, TP.alto, p.ry + 0.5 - fz0 * TP.dist);
      frame._look = new THREE.Vector3(p.rx + 0.5 + fx0 * TP.lookAhead, TP.lookY, p.ry + 0.5 + fz0 * TP.lookAhead);
    } else {
      camera.position.set(p.rx + 0.5, CAM.dy, p.ry + 0.5 + CAM.dz);
      frame._look = new THREE.Vector3(p.rx + 0.5, CAM.lookY, p.ry + 0.5);
    }
  }

  function spriteTex(glyph, frame) {
    const key = 'ent-' + glyph + '-' + frame;
    if (texCache.has(key)) return texCache.get(key);
    const c = Sprites.get(glyph, frame);
    return c ? tex(c, key) : null;
  }

  function spriteTexFlip(glyph, frame, flip) {
    const key = 'ent-' + glyph + '-' + frame + (flip ? '-f' : '');
    if (texCache.has(key)) return texCache.get(key);
    const c = Sprites.get(glyph, frame, flip);
    return c ? tex(c, key) : null;
  }

  function entVisible(world, e) {
    const g = world.map.grid;
    // v22: posiciones flotantes — el índice de luz va por tile redondeado
    const idx = Math.round(e.y) * g.w + Math.round(e.x);
    const lit = world.light[idx];
    const esSmiler = e.def.glyph === 'smiler';
    return lit > 0.05 ||
      (e.reveladaHasta ?? -1) > world.turn || // revelada al chocar en la oscuridad
      (esSmiler && (world.explored[idx] || Math.hypot(e.x - world.player.x, e.y - world.player.y) < 9));
  }

  // fallback: entidades vectoriales (sin matriz de píxeles) → snapshot del dibujo 2D
  function entCanvas(e, frame) {
    const key = 'entvec-' + e.def.glyph + '-' + frame;
    if (texCache.has(key)) return texCache.get(key);
    const c = document.createElement('canvas');
    c.width = 48; c.height = 48;
    const o = c.getContext('2d');
    // usa el dibujante 2D existente sobre este canvas
    const fake = Object.create(e);
    fake.revelada = true;
    const octxOld = o; // Render._drawEntity dibuja en su ctx interno: usamos exportador
    // Render._drawEntity no acepta ctx externo: replicamos con sprites.get o círculo
    const spr = Sprites.get(e.def.glyph, frame);
    if (spr) o.drawImage(spr, 0, 0);
    else {
      o.fillStyle = e.def.color;
      o.beginPath(); o.arc(24, 24, 12, 0, 7); o.fill();
      o.strokeStyle = 'rgba(0,0,0,0.6)'; o.stroke();
    }
    return tex(c, key);
  }

  function actualizarLucesTecho(world, px, pz, fase0) {
    if (world.level.id !== 'level-0' || !panelPositions.length) {
      for (const l of ceilingLights) { l.intensity = 0; l.visible = false; }
      return;
    }
    const cercanas = [];
    for (const p of panelPositions) {
      const d2 = (p.x - px) ** 2 + (p.z - pz) ** 2;
      if (d2 > 64) continue;
      let i = 0;
      while (i < cercanas.length && cercanas[i].d2 <= d2) i++;
      cercanas.splice(i, 0, { ...p, d2 });
      if (cercanas.length > ceilingLights.length) cercanas.pop();
    }
    ceilingLights.forEach((l, i) => {
      const p = cercanas[i];
      if (!p) { l.intensity = 0; l.visible = false; return; }
      l.visible = true;
      l.position.set(p.x, WALL_H - 0.12, p.z);
      const falla = p.group === flkGrupo && !flkOn;
      const objetivo = (0.82 - 0.12 * fase0) * (falla ? 0.05 : 1);
      l.intensity += (objetivo - l.intensity) * 0.22;
    });
  }

  // ---------- frame ----------
  function frame(world, t) {
    if (!world.level || !world.map) return;
    // el runSeed va DENTRO de la clave: tras morir y reaparecer, el nuevo Level 0
    // comparte id/entryCount/mapaVersion con el anterior pero es OTRO mapa (semilla
    // nueva). Sin el runSeed la clave coincidía y render3d NO reconstruía → los
    // muros que se veían no eran los del grid real = «colisiones bugeadas» hasta
    // que una remodelación subía mapaVersion.
    const key = (world.runSeed || '') + '::' + world.level.id + '::' +
      (world.entryCount?.[world.level.id] ?? 0) +
      '::' + (world.mapaVersion || 0); // partida + entrada + remodelaciones → rebuild
    if (key !== levelKey) {
      // «mismo nivel» solo si además es la MISMA partida: un Level 0 de otra run
      // debe purgarse por completo, no reconstruirse de forma incremental sobre
      // la geometría vieja.
      const esMismoNivel = lastLevelId === world.level.id &&
        lastRunSeed === world.runSeed && staticGroup;
      levelKey = key;
      lastLevelId = world.level.id;
      lastRunSeed = world.runSeed;
      terminarRevelado(); // si había un revelado a medias, se completa YA
      if (world._shift3d) {
        // expansión del nivel infinito: cámara y escena vieja se desplazan
        // EXACTAMENTE con el mundo → ni un píxel de salto en pantalla
        camera.position.x -= world._shift3d.x;
        camera.position.z -= world._shift3d.z;
        if (frame._look) { frame._look.x -= world._shift3d.x; frame._look.z -= world._shift3d.z; }
        if (staticGroup) {
          staticGroup.position.x -= world._shift3d.x;
          staticGroup.position.z -= world._shift3d.z;
        }
        for (const p of panelPositions) {
          p.x -= world._shift3d.x;
          p.z -= world._shift3d.z;
        }
        world._shift3d = null;
      }
      if (!esMismoNivel) {
        // nivel NUEVO: purga total y construcción síncrona (la tarjeta de
        // nivel tapa la pantalla: aquí el coste es invisible)
        if (rebuild) { disposeGrupo(rebuild.parcial, true); rebuild = null; }
        disposeGrupo(staticGroup, false);
        staticGroup = null;
        texCache.clear();
        limpiarActores();
        const gen = construirEstatica(world);
        let r; do { r = gen.next(); } while (!r.done);
        aplicarEstatica(world, r.value);
        rebuildItems(world);
        centrarCamara(world);
      } else {
        // expansión/remodelación del MISMO nivel: reconstrucción incremental.
        // La escena vieja (realineada) sigue en pantalla; lo nuevo está tras
        // la niebla. Si había otra en curso, se descarta y se reinicia.
        if (rebuild) disposeGrupo(rebuild.parcial, true);
        rebuild = { parcial: null };
        rebuild.gen = construirEstatica(world, rebuild);
        rebuildItems(world); // los índices del array de items ya cambiaron
      }
    }
    // avanza la reconstrucción incremental con presupuesto de ~5 ms por frame
    if (rebuild) {
      const t0 = performance.now();
      let r;
      do { r = rebuild.gen.next(); } while (!r.done && performance.now() - t0 < 5);
      if (r.done) {
        aplicarEstatica(world, r.value, true);
        rebuild = null;
      }
    }
    // revelado escalonado tras el swap: 3 bandas por frame (subida a GPU suave)
    if (revelando && !rebuild) {
      const rv = revelando;
      for (let k = 0; k < 3 && rv.i < rv.bandas.length; k++) rv.bandas[rv.i++].visible = true;
      if (rv.i >= rv.bandas.length) {
        disposeGrupo(rv.viejo, true);
        revelando = null;
      }
    }
    // items del suelo: rehacer si la lógica los cambió (tirar/arrojar objetos)
    if ((world.itemsVersion || 0) !== itemsVersionVista) rebuildItems(world);

    const p = world.player;
    const px = p.rx + 0.5, pz = p.ry + 0.5;
    if (!playerSprite) {
      playerSprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
      playerSprite.scale.set(1, SPRITE_H, 1);
      actorGroup.add(playerSprite);
    }

    // jugador: orientación del sprite RELATIVA a la cámara
    let sid, sflip = false;
    if (CAM_MODO === 'tercera') {
      // la cámara va siempre a su espalda: le vemos la espalda
      sid = 'player_up';
    } else {
      const dir = p.dir || 'down';
      let wx = 0, wy = 0;
      if (dir === 'down') wy = 1;
      else if (dir === 'up') wy = -1;
      else { wx = p.flip ? -1 : 1; }
      const th = camRot * Math.PI / 2;
      const svx = Math.round(Math.cos(th) * wx - Math.sin(th) * wy);
      const svy = Math.round(Math.sin(th) * wx + Math.cos(th) * wy);
      if (svy > 0) sid = 'player_down';
      else if (svy < 0) sid = 'player_up';
      else { sid = 'player_side'; sflip = svx < 0; }
    }
    // malherido: el propio sprite lo cuenta (sangre y palidez)
    if (p.salud < 35 && Sprites.tiene(sid + '_herido')) sid += '_herido';
    const pframe = world.moving ? Math.floor(t / 150) % Sprites.frameCount(sid) : 0;
    playerSprite.material.map = spriteTexFlip(sid, pframe, sflip);
    playerSprite.material.needsUpdate = true;
    playerSprite.position.set(px, SPRITE_H / 2 + 0.02, pz);
    playerSprite.visible = !world.escondido; // dentro de un mueble no se te ve

    // entidades (crear bajo demanda, ocultar si no visibles)
    for (const e of world.entities) {
      let s = entitySprites.get(e.uid);
      if (!e.viva) {
        // disolución de muerte: se desvanece elevándose (en vez de esfumarse de golpe)
        if (s && s.visible) {
          if (!e._muerteT) e._muerteT = t;
          const k = (t - e._muerteT) / 450;
          if (k >= 1) { s.visible = false; s.material.opacity = 1; }
          else {
            s.material.opacity = 1 - k;
            s.position.y = SPRITE_H / 2 + 0.02 + k * 0.22;
          }
        }
        continue;
      }
      if (!s) {
        s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
        s.scale.set(1, SPRITE_H, 1);
        if (e.def.glyph === 'smiler') s.material.fog = false; // brilla en la oscuridad
        actorGroup.add(s);
        entitySprites.set(e.uid, s);
      }
      const visible = entVisible(world, e);
      s.visible = visible;
      if (!visible) continue;
      const frame2 = Math.floor(t / 280) % Sprites.frameCount(e.def.glyph);
      const tx = spriteTex(e.def.glyph, frame2) || entCanvas(e, frame2);
      s.material.map = tx;
      s.material.needsUpdate = true;
      // embestida de ataque
      let ox = 0, oz = 0;
      if (e._atkT !== undefined) {
        const k = (t - e._atkT) / 240;
        if (k >= 0 && k <= 1) {
          const amp = Math.sin(Math.PI * k) * 0.38;
          ox = (world.player.x - e.x) * amp;
          oz = (world.player.y - e.y) * amp;
        }
      }
      // tinte de estado
      s.material.color.setHex(e.paralizada > 0 ? 0x77ccff : 0xffffff);
      if (e.preparando) s.material.color.setHex(Math.floor(t / 130) % 2 ? 0xffcc66 : 0xffffff); // ⚠ parpadea
      if (e._hitT && t - e._hitT < 170) s.material.color.setHex(0xffaaaa);
      s.position.set(e.rx + 0.5 + ox, SPRITE_H / 2 + 0.02, e.ry + 0.5 + oz);
      // respiración sutil (cada entidad con su fase: el grupo no late al unísono)
      e._fase = e._fase ?? Math.random() * 6.28;
      s.scale.y = SPRITE_H * (1 + 0.018 * Math.sin(t * 0.004 + e._fase));
    }

    // objetos recogidos
    for (const [i, s] of itemSprites) s.visible = !(world.map.items[i]?.taken ?? true);

    // jugadores remotos (BACKROOMS MMO): mismo patrón que las entidades, con el
    // sprite del jugador orientado según su rotación relativa a la cámara
    if (world.otros && window.Otros) {
      const vivos = new Set();
      // ángulo de cámara en radianes (v22): la orientación relativa decide el sprite
      const camDir = CAM_MODO === 'tercera'
        ? (world.online ? p.rot : p.rot * Math.PI / 2)
        : ((4 - camRot) % 4) * Math.PI / 2;
      for (const o of world.otros) {
        vivos.add(o.id);
        if (o.escondido) { const sE = otrosSprites.get(o.id); if (sE) sE.visible = false; continue; }
        let s = otrosSprites.get(o.id);
        if (!s) {
          s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
          s.scale.set(1, SPRITE_H, 1);
          actorGroup.add(s);
          otrosSprites.set(o.id, s);
        }
        const [sid2, flip2] = Otros.spriteDe(o, camDir);
        const f2 = (Math.abs(o.rx - o.x) + Math.abs(o.ry - o.y) > 0.03)
          ? Math.floor(t / 150) % Sprites.frameCount(sid2) : 0;
        s.visible = true;
        s.material.map = spriteTexFlip(sid2, f2, flip2);
        s.material.needsUpdate = true;
        s.position.set(o.rx + 0.5, SPRITE_H / 2 + 0.02, o.ry + 0.5);
      }
      for (const [id, s] of otrosSprites)
        if (!vivos.has(id)) { actorGroup.remove(s); s.material.dispose(); otrosSprites.delete(id); }
    }

    // En el último tramo de Level 0, los mismos materiales pierden el amarillo
    // y dejan asomar el gris del garaje. No hay pantalla que anuncie el cambio.
    const fase0 = level0Phase(world);
    if (world.level.id === 'level-0' && transitionMats) {
      const mezcla = (mat, r, g, b) => mat?.color.setRGB(
        1 + (r - 1) * fase0, 1 + (g - 1) * fase0, 1 + (b - 1) * fase0
      );
      mezcla(transitionMats.floor, 0.58, 0.62, 0.65);
      mezcla(transitionMats.wall, 0.72, 0.75, 0.76);
      mezcla(transitionMats.ceiling, 0.68, 0.71, 0.73);
      scene.background.setRGB(0.051 + 0.015 * fase0, 0.043 + 0.025 * fase0, 0.02 + 0.04 * fase0);
      if (scene.fog) scene.fog.color.copy(scene.background);
      amb.intensity = 0.22 - 0.025 * fase0;
      renderer.toneMappingExposure = 0.96 - 0.05 * fase0;
    }

    // luz del jugador con flicker fluorescente
    let flicker = 1;
    if (!REDUCE_FLICKER && Math.random() < 0.012) flicker = 0.72;
    const luzJugador = world.level.id === 'level-0' ? 0.72 : 1.7;
    plight.intensity = plight.intensity * 0.85 + (luzJugador * flicker) * 0.15;
    plight.position.set(px, 1.6, pz);
    plight.distance = (world.visionActual() + 3) * (p.luz ? 2.4 : 1.6);

    // LINTERNA: cono de luz real hacia donde miras + la niebla se abre.
    // v23: el haz sigue al FACING de verdad (θ continuo online, rot 0-3 en
    // solo) — antes usaba p.dir, que online nunca cambia, y el cono se quedaba
    // clavado mirando al sur como una luz fantasma.
    const luzOn = p.luz && !world.luzBloqueada;
    spot.intensity += ((luzOn ? 2.4 : 0) - spot.intensity) * 0.12;
    if (spot.intensity > 0.01) {
      let fx2 = 0, fz2 = 1;
      if (world.online) {
        const th = p.rot || 0;
        fx2 = Math.sin(th); fz2 = -Math.cos(th);
      } else if (ROT_VEC[p.rot]) {
        [fx2, fz2] = ROT_VEC[p.rot];
      } else if (p.dir === 'up') { fx2 = 0; fz2 = -1; }
      else if (p.dir === 'side') { fx2 = p.flip ? -1 : 1; fz2 = 0; }
      spot.position.set(px, 1.2, pz);
      spot.target.position.set(px + fx2 * 3.5, 0.2, pz + fz2 * 3.5);
      spot.target.updateMatrixWorld();
    }
    if (scene.fog)
      scene.fog.density += ((luzOn ? fogBase * 0.45 : fogBase) - scene.fog.density) * 0.06;

    // luminarias cercanas + polvo en suspensión
    if (window.Atmos3D) Atmos3D.frame(world, t, px, pz, luzOn);

    // Los paneles están repartidos en grupos sembrados. Cada fallo elige uno:
    // parpadea una fracción del techo, nunca todos los fluorescentes a la vez.
    if (panelMats.some(Boolean) && !window.NOFX && !REDUCE_FLICKER) {
      const baseCenital = world.level.id === 'level-0' ? 0.14 - 0.025 * fase0 : 0.35;
      if (!flkHasta) {
        if (Math.random() < 0.0006) {
          flkHasta = t + 600 + Math.random() * 1000;
          flkNext = 0;
          const activos = panelMats.map((m, i) => m ? i : -1).filter((i) => i >= 0);
          flkGrupo = activos[Math.floor(Math.random() * activos.length)];
          if (world.level.id === 'level-0' && window.Sfx) Sfx.level0Flicker?.();
        }
      } else if (t > flkHasta) {
        flkHasta = 0;
        if (panelMats[flkGrupo]) panelMats[flkGrupo].color.setHex(0xfff6dc);
        flkGrupo = -1;
        dlight.intensity = baseCenital;
      } else {
        if (t > flkNext) {          // cambia de estado a golpes irregulares
          flkOn = Math.random() < 0.55;
          flkNext = t + 40 + Math.random() * 140;
        }
        const f = flkOn ? 1 : 0.15 + Math.random() * 0.2;
        if (panelMats[flkGrupo]) panelMats[flkGrupo].color.setRGB(f, 0.965 * f, 0.863 * f);
        // La luz cenital global no cambia: solo falla el grupo visual elegido.
        dlight.intensity = baseCenital;
      }
    } else if (world.level.id === 'level-0') {
      dlight.intensity = 0.14 - 0.025 * fase0;
    }
    actualizarLucesTecho(world, px, pz, fase0);

    if (CAM_MODO === 'tercera') {
      // --- CÁMARA 3ª PERSONA: pegada a la espalda, baja, inmersiva ---
      const rot = p.rot ?? 2;
      if (world.moving) camBobT += 0.13;
      const bob = Math.sin(camBobT) * TP.bob * (world.moving ? 1 : 0.12);
      // el yaw viaja por el camino angular más corto hasta quedar tras el jugador.
      // v22 online: p.rot ya es un ángulo continuo θ (0=N); el facing es
      // (sinθ,-cosθ) → yaw = atan2(-sinθ, cosθ) = -θ
      let yawObjetivo;
      if (world.online) yawObjetivo = -rot;
      else { const [fx3, fz3] = ROT_VEC[rot]; yawObjetivo = Math.atan2(-fx3, -fz3); }
      let dyaw = yawObjetivo - camYaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      camYaw += dyaw * 0.12;
      const ox = Math.sin(camYaw) * TP.dist;
      const oz = Math.cos(camYaw) * TP.dist;
      let target = new THREE.Vector3(px + ox, TP.alto + bob, pz + oz);
      // colisión: si un muro queda entre la cabeza del jugador y la cámara, acercarla
      if (solidosCamara.length) {
        const desde = new THREE.Vector3(px, 1.05, pz);
        const hacia = target.clone().sub(desde);
        const dist = hacia.length();
        rayo.set(desde, hacia.clone().normalize());
        rayo.far = dist;
        const hits = rayo.intersectObjects(solidosCamara, false);
        if (hits.length && hits[0].distance < dist - 0.2) {
          const d2 = Math.max(0.65, hits[0].distance - 0.25);
          target = desde.clone().add(hacia.normalize().multiplyScalar(d2));
          target.y = Math.min(target.y, TP.alto + bob);
        }
      }
      camera.position.lerp(target, TP.suavidad);
      // mira hacia delante (según la órbita actual: giro suave sin bandazos)
      frame._look = frame._look || new THREE.Vector3(px, TP.lookY, pz);
      frame._look.lerp(
        new THREE.Vector3(px - Math.sin(camYaw) * TP.lookAhead, TP.lookY, pz - Math.cos(camYaw) * TP.lookAhead),
        0.12
      );
      camera.lookAt(frame._look);
      // si la cámara queda pegada (muro a la espalda), el personaje se desvanece
      // en vez de tapar media pantalla
      const dCam = camera.position.distanceTo(new THREE.Vector3(px, 1.0, pz));
      playerSprite.material.opacity = Math.max(0, Math.min(1, (dCam - 0.85) / 0.9));
    } else {
      // --- cámara Octopath clásica (?cam=alta): inercia, bob sutil, rotación Q/E ---
      if (world.moving) camBobT += 0.11;
      const bob = Math.sin(camBobT) * CAM.bob * (world.moving ? 1 : 0.15);
      const yawObjetivo = camRot * Math.PI / 2;
      // camino angular más corto
      let dyaw = yawObjetivo - camYaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      camYaw += dyaw * 0.1;
      const ox = Math.sin(camYaw) * CAM.dz;
      const oz = Math.cos(camYaw) * CAM.dz;
      let target = new THREE.Vector3(px + ox, CAM.dy + bob, pz + oz);
      // colisión de cámara: si un muro se interpone entre el jugador y la cámara,
      // la cámara se acerca hasta quedar delante (nunca tapa al jugador)
      if (solidosCamara.length) {
        // el rayo protege la visión de los PIES del jugador (lo primero que tapan los muros)
        const desde = new THREE.Vector3(px, 0.22, pz);
        const hacia = target.clone().sub(desde);
        const dist = hacia.length();
        rayo.set(desde, hacia.normalize());
        rayo.far = dist;
        const hits = rayo.intersectObjects(solidosCamara, false);
        if (hits.length && hits[0].distance < dist - 0.3) {
          if (hits[0].distance > 2.4) {
            // hay hueco: acercar la cámara hasta quedar delante del muro
            target = desde.clone().add(hacia.multiplyScalar(hits[0].distance - 0.35));
            target.y = Math.max(target.y, 2.4);
          } else {
            // el muro está encima del jugador: cámara casi cenital sobre él
            target = new THREE.Vector3(
              px + Math.sin(camYaw) * 1.2, 6.2, pz + Math.cos(camYaw) * 1.2
            );
          }
        }
      }
      camera.position.lerp(target, CAM.suavidad);
      // el punto de mira también con inercia: sin micro-tirones por paso
      frame._look = frame._look || new THREE.Vector3(px, CAM.lookY, pz);
      frame._look.lerp(
        new THREE.Vector3(px - Math.sin(camYaw) * CAM.lookAhead, CAM.lookY, pz - Math.cos(camYaw) * CAM.lookAhead),
        0.09
      );
      camera.lookAt(frame._look);
    }

    if (composer && !window.NOFX) {
      try { composer.render(); }
      catch (e) { console.warn('Postpro caído, render directo:', e); composer = null; renderer.render(scene, camera); }
    } else {
      renderer.render(scene, camera);
    }
    drawOverlay(world, t);

    if (window.DEBUG3D_ON) {
      window.DEBUG3D = {
        cam: camera.position.toArray().map((v) => +v.toFixed(2)),
        look: frame._look ? frame._look.toArray().map((v) => +v.toFixed(2)) : null,
        player: [px.toFixed(1), pz.toFixed(1)],
        solidos: solidosCamara.length,
        yaw: +camYaw.toFixed(2),
      };
      document.title = JSON.stringify(window.DEBUG3D);
    }
  }

  function project(wx, wy) {
    const v = new THREE.Vector3(wx + 0.5, 0.8, wy + 0.5).project(camera);
    return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H];
  }

  function drawOverlay(world, t) {
    octx.clearRect(0, 0, W, H);
    if (!window.NOFX) Effects.draw(octx, 0, 0, t, 48, project);
    // capa social del MMO: nombres flotantes y bocadillos de chat
    if (window.Otros && world.otros) Otros.overlay(octx, project, world, t);

    // flash de daño
    const dt = t - world.ui.flashT;
    if (dt < 220) {
      octx.fillStyle = `rgba(160,20,20,${0.35 * (1 - dt / 220)})`;
      octx.fillRect(0, 0, W, H);
    }
    // cordura baja
    if (world.player.cordura < 30) {
      const sc = (30 - world.player.cordura) / 30;
      octx.fillStyle = `rgba(60,0,20,${0.14 * sc})`;
      octx.fillRect(0, 0, W, H);
    }
    // clima del nivel: tinte helado o de horno (regla frio/calor de la ficha)
    const reglas = world.level.reglas || [];
    if (reglas.includes('frio')) {
      const resp = 0.06 + 0.025 * Math.sin(t * 0.0012); // respira despacio
      octx.fillStyle = `rgba(140,190,235,${resp})`;
      octx.fillRect(0, 0, W, H);
    } else if (reglas.includes('calor')) {
      const resp = 0.055 + 0.03 * Math.sin(t * 0.002);
      octx.fillStyle = `rgba(235,110,30,${resp})`;
      octx.fillRect(0, 0, W, H);
    }
    const fase0 = level0Phase(world);
    if (fase0 > 0) {
      octx.fillStyle = `rgba(95,115,125,${0.055 * fase0})`;
      octx.fillRect(0, 0, W, H);
    }
    if (!window.NOFX) {
      // viñeta + grano
      const vin = octx.createRadialGradient(W / 2, H / 2, H * 0.38, W / 2, H / 2, H * 0.8);
      vin.addColorStop(0, 'rgba(0,0,0,0)');
      vin.addColorStop(1, `rgba(0,0,0,${world.level.id === 'level-0' ? 0.62 : 0.55})`);
      octx.fillStyle = vin;
      octx.fillRect(0, 0, W, H);
      octx.globalAlpha = 0.45;
      octx.drawImage(grain, Math.random() * -80, Math.random() * -80, W + 160, H + 160);
      octx.globalAlpha = 1;
    }
  }

  window.Render3D = {
    init, frame, project, TILE: 48,
    modo: CAM_MODO,
    rotar(dir = 1) { camRot = (camRot + dir + 4) % 4; },
    get rot() { return camRot; },
  };
})();
