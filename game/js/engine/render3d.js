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
  let playerSprite = null;
  let texCache = new Map();      // clave -> THREE.Texture
  let grain = null;
  let camBobT = 0;
  let panelMat = null;           // material de los paneles fluorescentes del techo
  let flkHasta = 0, flkNext = 0, flkOn = true; // parpadeo raro y ocasional (v16)

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
    let panelMatNuevo = null;

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
      const matLado = new THREE.MeshLambertMaterial({ map: tex(caraSolo, 'muro-lado') });
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

      // --- TECHO REAL (solo 3ª persona e interiores): la cámara va por debajo,
      // así que el nivel se siente un interior cerrado de verdad. Los paneles
      // fluorescentes son ESTÁTICOS (parte del techo, florecen con el bloom). ---
      if (CAM_MODO === 'tercera' && world.level.bioma !== 'invernadero') {
        const plafonTex = pintado('plafon-' + world.level.id, () => lienzo(48, 48, (ctx2, w2, h2) => {
          ctx2.fillStyle = SH(pal.pared, 0.42);
          ctx2.fillRect(0, 0, w2, h2);
          ctx2.strokeStyle = SH(pal.pared, 0.3);              // juntas de placas
          ctx2.strokeRect(0.5, 0.5, w2 - 1, h2 - 1);
          ctx2.fillStyle = SH(pal.pared, 0.36);               // manchas de humedad
          ctx2.fillRect(6, 8, 10, 6); ctx2.fillRect(30, 26, 8, 9);
        }));
        plafonTex.wrapS = plafonTex.wrapT = THREE.RepeatWrapping;
        const matPlafon = new THREE.MeshLambertMaterial({ map: plafonTex });
        let cPos = [], cUv = [], cIdx = [], cNor = [];
        const pPos = [], pUv = [], pIdx = [];
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
            if (cada && x % cada === Math.floor(cada / 2) && y % cada === Math.floor(cada / 2)) {
              const ejeX = !esWall(x - 1, y) && !esWall(x + 1, y);
              const hw = ejeX ? 0.42 : 0.16, hd = ejeX ? 0.16 : 0.42;
              const cx2 = x + 0.5, cz2 = y + 0.5, yP = WALL_H - 0.02;
              quad(pPos, pUv, pIdx,
                [[cx2 - hw, yP, cz2 - hd], [cx2 + hw, yP, cz2 - hd],
                 [cx2 + hw, yP, cz2 + hd], [cx2 - hw, yP, cz2 + hd]],
                [0, 0, 1, 1]);
            }
          }
          if ((y & 15) === 15) { flushTecho(); yield; }
        }
        flushTecho();
        if (pPos.length) {
          const pgeo = new THREE.BufferGeometry();
          pgeo.setAttribute('position', new THREE.Float32BufferAttribute(pPos, 3));
          pgeo.setAttribute('uv', new THREE.Float32BufferAttribute(pUv, 2));
          pgeo.setIndex(pIdx);
          panelMatNuevo = new THREE.MeshBasicMaterial({
            color: 0xfff6dc, toneMapped: false, fog: false,
          });
          const pm = new THREE.Mesh(pgeo, panelMatNuevo);
          grupo.add(pm);
          bandas.push(pm);
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

    return { grupo, solidos, panelMatNuevo, bandas };
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
    panelMat = res.panelMatNuevo;
    flkHasta = 0;
    if (window.Atmos3D) Atmos3D.buildLevel(world, staticGroup);

    const pal = world.level.paleta;
    const fondo = new THREE.Color(pal.fondo);
    scene.background = fondo;
    fogBase = 0.08 + world.level.oscuridad * 0.16;
    scene.fog = new THREE.FogExp2(fondo, fogBase);
    amb.intensity = Math.max(0.12, 0.55 - world.level.oscuridad * 0.4);
    plight.color = new THREE.Color(pal.luz);
    plight.distance = (world.visionActual() + 3) * 1.6;

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
    const idx = e.y * g.w + e.x;
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

  // ---------- frame ----------
  function frame(world, t) {
    if (!world.level || !world.map) return;
    const key = world.level.id + '::' + (world.entryCount?.[world.level.id] ?? 0) +
      '::' + (world.mapaVersion || 0); // remodelaciones no euclidianas → rebuild
    if (key !== levelKey) {
      const esMismoNivel = lastLevelId === world.level.id && staticGroup;
      levelKey = key;
      lastLevelId = world.level.id;
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

    // luz del jugador con flicker fluorescente
    let flicker = 1;
    if (Math.random() < 0.015) flicker = 0.7;
    plight.intensity = plight.intensity * 0.85 + (1.7 * flicker) * 0.15;
    plight.position.set(px, 1.6, pz);
    plight.distance = (world.visionActual() + 3) * (p.luz ? 2.4 : 1.6);

    // LINTERNA: cono de luz real hacia donde miras + la niebla se abre
    const luzOn = p.luz && !world.luzBloqueada;
    spot.intensity += ((luzOn ? 2.4 : 0) - spot.intensity) * 0.12;
    if (spot.intensity > 0.01) {
      let fx2 = 0, fz2 = 1;
      if (p.dir === 'up') { fx2 = 0; fz2 = -1; }
      else if (p.dir === 'side') { fx2 = p.flip ? -1 : 1; fz2 = 0; }
      spot.position.set(px, 1.2, pz);
      spot.target.position.set(px + fx2 * 3.5, 0.2, pz + fz2 * 3.5);
      spot.target.updateMatrixWorld();
    }
    if (scene.fog)
      scene.fog.density += ((luzOn ? fogBase * 0.45 : fogBase) - scene.fog.density) * 0.06;

    // luminarias cercanas + polvo en suspensión
    if (window.Atmos3D) Atmos3D.frame(world, t, px, pz, luzOn);

    // parpadeo fluorescente (v16): muy de vez en cuando los paneles del techo
    // fallan de forma errática durante ~1 segundo (cosmético; sin RNG de juego)
    if (panelMat && !window.NOFX) {
      if (!flkHasta) {
        if (Math.random() < 0.0003) { flkHasta = t + 600 + Math.random() * 1000; flkNext = 0; }
      } else if (t > flkHasta) {
        flkHasta = 0;
        panelMat.color.setHex(0xfff6dc);
        dlight.intensity = 0.35;
      } else {
        if (t > flkNext) {          // cambia de estado a golpes irregulares
          flkOn = Math.random() < 0.55;
          flkNext = t + 40 + Math.random() * 140;
        }
        const f = flkOn ? 1 : 0.15 + Math.random() * 0.2;
        panelMat.color.setRGB(f, 0.965 * f, 0.863 * f);
        dlight.intensity = flkOn ? 0.35 : 0.12;
      }
    }

    if (CAM_MODO === 'tercera') {
      // --- CÁMARA 3ª PERSONA: pegada a la espalda, baja, inmersiva ---
      const rot = p.rot ?? 2;
      const [fx3, fz3] = ROT_VEC[rot];
      if (world.moving) camBobT += 0.13;
      const bob = Math.sin(camBobT) * TP.bob * (world.moving ? 1 : 0.12);
      // el yaw viaja por el camino angular más corto hasta quedar tras el jugador
      const yawObjetivo = Math.atan2(-fx3, -fz3);
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
    if (!window.NOFX) {
      // viñeta + grano
      const vin = octx.createRadialGradient(W / 2, H / 2, H * 0.38, W / 2, H / 2, H * 0.8);
      vin.addColorStop(0, 'rgba(0,0,0,0)');
      vin.addColorStop(1, 'rgba(0,0,0,0.55)');
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
