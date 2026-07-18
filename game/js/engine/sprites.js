// Sprites pixel-art procedurales (rejilla 16×16 ó 24×24 → salida siempre 48px)
// con contorno automático y N frames de animación. Soporta override con PNG
// externos en game/assets/sprites/<id>.png (hoja horizontal de frames de 48×48).
(function () {
  const OUT = 'rgba(12,10,8,0.9)';

  // cache-bust por sesión para CUALQUIER override de imagen (sprites base,
  // objetos, capas de apariencia...): sin esto el navegador puede seguir
  // sirviendo desde caché la versión vieja de un PNG editado (player_down.png,
  // Hair1.png...) tras un simple F5 — recién se nota con Ctrl+F5. Un solo
  // valor por carga de página alcanza (no hace falta uno nuevo por archivo).
  const CACHE_BUST = Date.now();

  // ---------- rasterizador de matrices ----------
  function shadeHex(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
    const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
    const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
    return `rgb(${r},${g},${b})`;
  }

  function rasterize(pal, rows) {
    // la rejilla se deriva de la matriz (16→×3, 24→×2); la salida es siempre 48px
    const S = rows.length;
    const P = Math.max(1, Math.round(48 / S));
    const c = document.createElement('canvas');
    c.width = S * P; c.height = S * P;
    const ctx = c.getContext('2d');
    const grid = [];
    let minY = S, maxY = 0;
    for (let y = 0; y < S; y++) {
      grid[y] = [];
      const row = rows[y] || '';
      for (let x = 0; x < S; x++) {
        grid[y][x] = pal[row[x]] || null;
        if (grid[y][x]) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      }
    }
    const hSpan = Math.max(1, maxY - minY);
    // contorno automático: celda vacía adyacente a una llena
    ctx.fillStyle = OUT;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        if (grid[y][x]) continue;
        const near = (grid[y - 1]?.[x]) || (grid[y + 1]?.[x]) || grid[y][x - 1] || grid[y][x + 1];
        if (near) ctx.fillRect(x * P, y * P, P, P);
      }
    // relleno con sombreado volumétrico: luz cenital (claro arriba, oscuro abajo)
    // y realce del borde superior-izquierdo de cada masa
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const col = grid[y][x];
        if (!col) continue;
        let f = 1.1 - 0.32 * ((y - minY) / hSpan);
        if (!grid[y - 1]?.[x] || !grid[y][x - 1]) f *= 1.16;  // borde iluminado
        if (grid[y][x + 1] === null && x < S - 1) f *= 0.88;  // borde derecho en sombra
        ctx.fillStyle = col[0] === '#' ? shadeHex(col, f) : col;
        ctx.fillRect(x * P, y * P, P, P);
      }
    return c;
  }

  // ---------- definiciones ----------
  // caracteres: '.'=transparente; el resto según paleta de cada sprite
  const DEFS = {};

  // ===== JUGADOR (v10: más detalle — pelo 2 tonos, cremallera, cuello, mochila con hebilla) =====
  const palPlayer = {
    h: '#523c28', H: '#38281a', f: '#e8c9a0', F: '#d0b088', e: '#2a2018',
    j: '#5f7454', J: '#49593f', z: '#c9c9b2', c: '#70855f',
    s: '#e8c9a0', p: '#3e3a36', P: '#312e2b', b: '#2a2622', B: '#4d4438',
    k: '#8a5a30', K: '#6e4826', Q: '#87603a',
  };
  // v14: rejilla 24×24 (+50% de detalle) y ciclo de andar de 4 frames por
  // dirección [neutro, zancada A, neutro, zancada B] — el frame 0 (quieto) es neutro
  const torsoDown = [
    '........................',
    '.........hhhhhh.........',
    '........hhhhhhhh........',
    '.......hhhhhhhhhh.......',
    '.......Hhhhhhhhhh.......',
    '.......hffffffffh.......',
    '.......hfeffffefh.......',
    '........fffFFfff........',
    '.........ffffff.........',
    '........cjjzzjjc........',
    '......jjjkjzzjkjjj......',
    '.....sjjjkjzzjkjjjs.....',
    '.....sjjjkjzzjkjjjs.....',
    '......jjJjjzzjjJjj......',
    '.......jjjjzzjjjj.......',
    '.......jjjjzzjjjj.......',
  ];
  const piernasFrontal = {
    neutro: [
      '.......pppppppppp.......',
      '.......pppp..pppp.......',
      '.......pPpp..ppPp.......',
      '.......pppp..pppp.......',
      '.......pppp..pppp.......',
      '.......bbBb..bBbb.......',
      '........................',
      '........................',
    ],
    zancadaA: [
      '.......pppppppppp.......',
      '.......pppp..pppp.......',
      '.......pPpp..ppPp.......',
      '.......pppp...ppp.......',
      '.......pppp..bBbb.......',
      '.......bbBb.............',
      '........................',
      '........................',
    ],
    zancadaB: [
      '.......pppppppppp.......',
      '.......pppp..pppp.......',
      '.......pPpp..ppPp.......',
      '.......ppp...pppp.......',
      '.......bbBb..pppp.......',
      '.............bBbb.......',
      '........................',
      '........................',
    ],
  };
  const ciclo = (torso, piernas) => [
    [...torso, ...piernas.neutro],
    [...torso, ...piernas.zancadaA],
    [...torso, ...piernas.neutro],
    [...torso, ...piernas.zancadaB],
  ];
  DEFS.player_down = { pal: palPlayer, frames: ciclo(torsoDown, piernasFrontal) };

  const torsoUp = [
    '........................',
    '.........hhhhhh.........',
    '........hhhhhhhh........',
    '.......hhhhhhhhhh.......',
    '.......hHHHHHHHHh.......',
    '.......hHHHHHHHHh.......',
    '.......hhHHHHHHhh.......',
    '........hhhhhhhh........',
    '.........hhhhhh.........',
    '........cjjjjjjc........',
    '......jjKKKKKKKKjj......',
    '.....sjKQQKKKKQQKjs.....',
    '.....sjKQQKKKKQQKjs.....',
    '......jKKKKKKKKKKj......',
    '......jKKKKkkKKKKj......',
    '.......jjjjjjjjjj.......',
  ];
  DEFS.player_up = { pal: palPlayer, frames: ciclo(torsoUp, piernasFrontal) };

  const torsoSide = [
    '........................',
    '..........hhhhhh........',
    '.........hhhhhhhh.......',
    '.........Hhhhhhhh.......',
    '.........Hhhhhhhh.......',
    '.........hhffffff.......',
    '..........hffeff........',
    '..........hffff.........',
    '...........ffff.........',
    '.........cjjjjjc........',
    '........jKjjjjjjj.......',
    '........jKQjjjjjjs......',
    '........jKQjjjjjjs......',
    '........jKQjjJjjj.......',
    '.........jjjjjjjj.......',
    '.........jjjjjjj........',
  ];
  const piernasSide = {
    neutro: [
      '.........pppppppp.......',
      '..........pppppp........',
      '..........pPpppp........',
      '..........pppppp........',
      '..........bbBbbb........',
      '........................',
      '........................',
      '........................',
    ],
    zancadaA: [
      '.........pppppppp.......',
      '........ppp...ppp.......',
      '.......pPp.....pPp......',
      '.......pp......ppp......',
      '......bBb.......bBbb....',
      '........................',
      '........................',
      '........................',
    ],
    zancadaB: [
      '.........pppppppp.......',
      '........ppp...ppp.......',
      '......pPp......pPp......',
      '......ppp.......pp......',
      '....bbBb.........bBb....',
      '........................',
      '........................',
      '........................',
    ],
  };
  DEFS.player_side = { pal: palPlayer, frames: ciclo(torsoSide, piernasSide) };

  // ===== TRAJE HAZMAT: skin PREDETERMINADA (v28.14) — mismo esqueleto y
  // ciclo de caminata que el jugador base (ciclo()+piernasFrontal/Side
  // reusadas TAL CUAL): capucha+visor en vez de pelo/cara, mono amarillo en
  // vez de piel/ropa elegibles. Filas de capucha = las de pelo/cara del
  // jugador con un remapeo de letra 1 a 1 (h→m capucha, H→M sombra,
  // f→v visor, F→z acento oscuro/filtro, e→z remache) — conserva la
  // silueta/proporciones exactas sin tener que volver a medir nada; las
  // filas de torso/piernas (9 en adelante) se REUSAN sin cambios, solo con
  // paleta nueva (mismo mecanismo: las letras j/J/c/s/k/K/Q/p/P/b/B ya
  // existían, acá apuntan a tonos del mono/guantes/botas en vez de
  // ropa/piel). Es la skin que se usa cuando apariencia.modo==='hazmat'
  // (getTintado, más abajo) — override PNG opcional en
  // assets/sprites/hazmat_down/up/side.png, mismo mecanismo que el cuerpo
  // base (Sprites.list() ya incluye estos ids para tryOverrides). El
  // usuario proveyó un hazmat_down.png real (arte propio, sombreado real de
  // ~120 tonos) — up/side siguen siendo ESTE placeholder procedural hasta
  // que suba esos dos archivos también, pero la paleta de acá está
  // muestreada directo de su PNG (con un decoder pngjs ad-hoc) para que al
  // menos los COLORES combinen con el override real de abajo mientras tanto.
  const palHazmat = {
    m: '#c49b0e', M: '#ab6f0f', v: '#180b04', z: '#724b45',
    c: '#d6af29', j: '#c49b0e', J: '#ab6f0f',
    s: '#211e1f', k: '#121111', K: '#0d0c0c', Q: '#2e282a',
    p: '#c49b0e', P: '#ab6f0f', b: '#121111', B: '#0d0c0c',
  };
  const hazmatHoodDown = [
    '........................',
    '.........mmmmmm.........',
    '........mmmmmmmm........',
    '.......mmmmmmmmmm.......',
    '.......Mmmmmmmmmm.......',
    '.......mvvvvvvvvm.......',
    '.......mvzvvvvzvm.......',
    '........vvvzzvvv........',
    '.........vvvvvv.........',
  ];
  const hazmatHoodUp = [
    '........................',
    '.........mmmmmm.........',
    '........mmmmmmmm........',
    '.......mmmmmmmmmm.......',
    '.......mMMMMMMMMm.......',
    '.......mMMMMMMMMm.......',
    '.......mmMMMMMMmm.......',
    '........mmmmmmmm........',
    '.........mmmmmm.........',
  ];
  const hazmatHoodSide = [
    '........................',
    '..........mmmmmm........',
    '.........mmmmmmmm.......',
    '.........Mmmmmmmm.......',
    '.........Mmmmmmmm.......',
    '.........mmvvvvvv.......',
    '..........mvvzvv........',
    '..........mvvvv.........',
    '...........vvvv.........',
  ];
  const torsoHazmatDown = [...hazmatHoodDown, ...torsoDown.slice(9)];
  const torsoHazmatUp = [...hazmatHoodUp, ...torsoUp.slice(9)];
  const torsoHazmatSide = [...hazmatHoodSide, ...torsoSide.slice(9)];
  DEFS.hazmat_down = { pal: palHazmat, frames: ciclo(torsoHazmatDown, piernasFrontal) };
  DEFS.hazmat_up = { pal: palHazmat, frames: ciclo(torsoHazmatUp, piernasFrontal) };
  DEFS.hazmat_side = { pal: palHazmat, frames: ciclo(torsoHazmatSide, piernasSide) };

  // ===== FACELING: humanoide gris pálido SIN rostro =====
  const palFace = { f: '#d8ccb8', F: '#c0b4a0', t: '#8a8074', T: '#736a60', p: '#5a544c' };
  DEFS.faceling = { pal: palFace, frames: [[
    '................',
    '.....ffffff.....',
    '....ffffffff....',
    '....ffffffff....',
    '....ffffffff....',
    '.....ffffff.....',
    '....tttttttt....',
    '...tttttttttt...',
    '...ftttTTttff...',
    '...ftttTTttff...',
    '....tttttttt....',
    '....pppppppp....',
    '....ppp..ppp....',
    '....pp....pp....',
    '....FF....FF....',
    '................',
  ], [
    '................',
    '.....ffffff.....',
    '....ffffffff....',
    '....ffffffff....',
    '....ffffffff....',
    '.....ffffff.....',
    '....tttttttt....',
    '...tttttttttt...',
    '...ftttTTttff...',
    '...ftttTTttff...',
    '....tttttttt....',
    '....pppppppp....',
    '....ppp..pp.....',
    '.....pp...pp....',
    '.....FF...FF....',
    '................',
  ]] };

  // ===== SKIN-STEALER: "superviviente" con costuras =====
  const palSkin = { f: '#d8c090', F: '#c0a878', x: '#8a4030', t: '#7a6a50', p: '#4e4438' };
  DEFS.skinstealer = { pal: palSkin, frames: [[
    '................',
    '.....ffffff.....',
    '....ffxfffff....',
    '....ffxfffff....',
    '....fffxxfff....',
    '.....ffffxf.....',
    '....tttttttt....',
    '...tttxttttat...'.replace('a', 't'),
    '...ftttttxtff...',
    '...fttttttttf...',
    '....ttxttttt....',
    '....pppppppp....',
    '....ppp..ppp....',
    '....pp....pp....',
    '....FF....FF....',
    '................',
  ], [
    '................',
    '.....ffffff.....',
    '....ffxfffff....',
    '....ffxfffff....',
    '....fffxxfff....',
    '.....ffffxf.....',
    '....tttttttt....',
    '...tttxtttttt...',
    '...ftttttxtff...',
    '...fttttttttf...',
    '....ttxttttt....',
    '....pppppppp....',
    '.....pp..ppp....',
    '....pp...pp.....',
    '....FF...FF.....',
    '................',
  ]] };

  // ===== HUNTER: cazador oscuro de ojos rojos =====
  const palHunter = { d: '#241214', D: '#180a0c', r: '#e03030', c: '#3a1c20' };
  DEFS.hunter = { pal: palHunter, frames: [[
    '................',
    '.....dddddd.....',
    '....dddddddd....',
    '....drddddrd....',
    '....dddddddd....',
    '.....dddddd.....',
    '....cccccccc....',
    '...dccccccccd...',
    '..ddccDDDDccdd..',
    '..d.ccDDDDcc.d..',
    '....cccccccc....',
    '....dddddddd....',
    '....ddd..ddd....',
    '....dd....dd....',
    '....DD....DD....',
    '................',
  ], [
    '................',
    '.....dddddd.....',
    '....dddddddd....',
    '....drddddrd....',
    '....dddddddd....',
    '.....dddddd.....',
    '....cccccccc....',
    '...dccccccccd...',
    '..ddccDDDDccdd..',
    '..d.ccDDDDcc.d..',
    '....cccccccc....',
    '....dddddddd....',
    '.....dd..ddd....',
    '....dd....dd....',
    '....DD...DD.....',
    '................',
  ]] };

  // ===== DULLER: silueta alargada de rostro fundido =====
  const palDuller = { d: '#4a4a58', D: '#3a3a46', m: '#2c2c36' };
  DEFS.duller = { pal: palDuller, frames: [[
    '......dddd......',
    '.....dddddd.....',
    '.....ddmmdd.....',
    '.....dmmmmd.....',
    '......dddd......',
    '......dDDd......',
    '......dDDd......',
    '.....ddDDdd.....',
    '.....d.DD.d.....',
    '.....d.DD.d.....',
    '.......DD.......',
    '.......DD.......',
    '......dDDd......',
    '......d..d......',
    '......d..d......',
    '......d..d......',
  ], [
    '......dddd......',
    '.....dddddd.....',
    '.....ddmmdd.....',
    '.....dmmmmd.....',
    '......dddd......',
    '......dDDd......',
    '......dDDd......',
    '.....ddDDdd.....',
    '.....d.DD.d.....',
    '.....d.DD.d.....',
    '.......DD.......',
    '.......DD.......',
    '......dDDd......',
    '......d.d.......',
    '.....d...d......',
    '.....d...d......',
  ]] };

  // ===== ANETHIKA: gigante encorvado de cuello torcido =====
  const palAne = { m: '#8f5fb0', M: '#734a91', d: '#5c3a75', e: '#e8e0f0' };
  DEFS.anethika = { pal: palAne, frames: [[
    '.........mmm....',
    '........memm....',
    '........mmmm....',
    '.......Mmm......',
    '......MMm.......',
    '.....MMMM.......',
    '....mMMMMm......',
    '....mMMMMm......',
    '...mmMMMMmm.....',
    '...m.MMMM.m.....',
    '...m.MMMM.m.....',
    '...d.dMMd.d.....',
    '.....dMMd.......',
    '.....d..d.......',
    '.....d..d.......',
    '.....dd.dd......',
  ], [
    '.........mmm....',
    '........memm....',
    '........mmmm....',
    '.......Mmm......',
    '......MMm.......',
    '.....MMMM.......',
    '....mMMMMm......',
    '....mMMMMm......',
    '...mmMMMMmm.....',
    '...m.MMMM.m.....',
    '...m.MMMM.m.....',
    '...d.dMMd.d.....',
    '.....dMMd.......',
    '.....d.d........',
    '....d...d.......',
    '....dd..dd......',
  ]] };

  // ===== HOUND: cuadrúpedo famélico =====
  const palHound = { h: '#9e7b6b', H: '#7e6154', e: '#f0e0d0', d: '#5e463c' };
  DEFS.hound = { pal: palHound, frames: [[
    '................',
    '................',
    '................',
    '............hh..',
    '...........hhhh.',
    '..hhhhhhhhhhhe..',
    '.hhHHHHHHHhhh...',
    '.hHHHHHHHHHh....',
    '.hhHHHHHHHhh....',
    '..hh.hh.hh.hh...',
    '..hh.hh.hh.hh...',
    '..dd.dd.dd.dd...',
    '................',
    '................',
    '................',
    '................',
  ], [
    '................',
    '................',
    '................',
    '............hh..',
    '...........hhhh.',
    '..hhhhhhhhhhhe..',
    '.hhHHHHHHHhhh...',
    '.hHHHHHHHHHh....',
    '.hhHHHHHHHhh....',
    '..hh..hh.hh.....',
    '.hh..hh...hh....',
    '.dd..dd...dd....',
    '................',
    '................',
    '................',
    '................',
  ]] };

  // ===== DEATHMOTH: polilla colosal =====
  const palMoth = { w: '#8f8fa8', W: '#6e6e86', b: '#3e3e50', e: '#d8a040' };
  DEFS.deathmoth = { pal: palMoth, frames: [[
    '................',
    '..ww........ww..',
    '.wwww......wwww.',
    '.wwWWw....wWWww.',
    '.wWWWWw..wWWWWw.',
    '..wWWWWwwWWWWw..',
    '...wWWbbbbWWw...',
    '....wbbebbbw....',
    '.....bbbbbb.....',
    '......bbbb......',
    '......bbbb......',
    '.......bb.......',
    '.......bb.......',
    '................',
    '................',
    '................',
  ], [
    '................',
    '................',
    '................',
    '..w..........w..',
    '.wwww......wwww.',
    '.wwWWwww.wwWWww.',
    '..wWWWbbbbWWWw..',
    '...wwbbebbbww...',
    '.....bbbbbb.....',
    '......bbbb......',
    '......bbbb......',
    '.......bb.......',
    '.......bb.......',
    '................',
    '................',
    '................',
  ]] };

  // ===== NEEDLELIMB: una pierna, un brazo, dedos-aguja =====
  const palNeedle = { d: '#3a3a45', D: '#2a2a33', n: '#585866' };
  DEFS.needlelimb = { pal: palNeedle, frames: [[
    '......ddd.......',
    '.....ddddd......',
    '.....ddDdd......',
    '......ddd.......',
    '......dDd.......',
    '......dDdn......',
    '......dDd.n.....',
    '......dDdnn.....',
    '......dDd.nn....',
    '......dDdn.n....',
    '.......Dd.......',
    '.......Dd.......',
    '.......Dd.......',
    '.......Dd.......',
    '......dDd.......',
    '................',
  ], [
    '......ddd.......',
    '.....ddddd......',
    '.....ddDdd......',
    '......ddd.......',
    '......dDd.......',
    '.....ndDd.......',
    '....n.dDd.......',
    '....nndDd.......',
    '...nn.dDd.......',
    '...n.ndDd.......',
    '.......Dd.......',
    '.......Dd.......',
    '.......Dd.......',
    '.......Dd.......',
    '.......dDd......',
    '................',
  ]] };

  const cache = {};      // id -> [canvas, canvas]
  const overrides = {};  // id -> [canvas...] desde PNG
  let overrideVersion = 0;

  function itemRows(tipo) {
    const rows = {
      botella: [
        '................',
        '.......gg.......',
        '......gGGg......',
        '......gGGg......',
        '.....gCCCCg.....',
        '.....gCCCCg.....',
        '.....gCCCCg.....',
        '.....gCCCCg.....',
        '.....gCCCCg.....',
        '.....gCCCCg.....',
        '.....gCCCCg.....',
        '......gggg......',
        '................',
        '................',
        '................',
        '................',
      ],
      caja: [
        '................',
        '................',
        '.....gggggg.....',
        '....gCCCCCCg....',
        '...gCCCCCCCCg...',
        '...gCCcCCcCCg...',
        '...gCCCCCCCCg...',
        '...gCccccccCg...',
        '...gCCCCCCCCg...',
        '...gCCcCCcCCg...',
        '...gCCCCCCCCg...',
        '....gggggggg....',
        '................',
        '................',
        '................',
        '................',
      ],
      herramienta: [
        '................',
        '..........gg....',
        '.........gCCg...',
        '........gCCg....',
        '.......gCCg.....',
        '......gCCg......',
        '.....gCCg.......',
        '....gCCg........',
        '...gCCg.........',
        '..gCCg..........',
        '..gCg...........',
        '..gg............',
        '................',
        '................',
        '................',
        '................',
      ],
      arma: [
        '................',
        '................',
        '...gggggggggg...',
        '..gCCCCCCCCCCg..',
        '..gCCCCgggggg...',
        '...ggCCg........',
        '.....gCCg.......',
        '.....gCCg.......',
        '......gg........',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      luz: [
        '................',
        '.......YY.......',
        '......YGGY......',
        '.....YGCCGY.....',
        '....YGCCCCGY....',
        '.....YGCCGY.....',
        '......YGGY......',
        '.......YY.......',
        '.......gg.......',
        '......gCCg......',
        '......gCCg......',
        '.......gg.......',
        '................',
        '................',
        '................',
        '................',
      ],
      papel: [
        '................',
        '.....gggggg.....',
        '....gCCCCCCg....',
        '....gCccccCg....',
        '....gCCCCCCg....',
        '....gCccccCg....',
        '....gCCCCCCg....',
        '....gCccccCg....',
        '....gCCCCCCg....',
        '....gCCCCCCg....',
        '.....gggggg.....',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      mineral: [
        '................',
        '................',
        '.......g........',
        '......gCg.......',
        '.....gCCCg......',
        '....gCCcCCg.....',
        '...gCCCCCCCg....',
        '....gCCcCCg.....',
        '.....gCCCg......',
        '......gCg.......',
        '.......g........',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      peligro: [
        '................',
        '.......gg.......',
        '......gCCg......',
        '.....gCCCCg.....',
        '....gCCCCCCg....',
        '...gCCCCCCCCg...',
        '..gCCCCccCCCCg..',
        '...gCCCCCCCCg...',
        '....gCCccCCg....',
        '.....gCCCCg.....',
        '......gCCg......',
        '.......gg.......',
        '................',
        '................',
        '................',
        '................',
      ],
      refugio: [
        '................',
        '................',
        '......gggg......',
        '.....gCCCCg.....',
        '....gCCCCCCg....',
        '...gCCCCCCCCg...',
        '...gCCcCCcCCg...',
        '...gCCCCCCCCg...',
        '...gCCCCCCCCg...',
        '...gCCcCCcCCg...',
        '...ggggggggg....',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
    };
    return rows[tipo] || rows.caja;
  }

  function itemTipo(def) {
    const e = def.efecto || {};
    const t = `${def.id} ${def.nombre}`.toLowerCase();
    if (e.toggle === 'luz' || /lantern|linterna|bulb|flash|luz|llama|fire|fuego/.test(t)) return 'luz';
    if (e.activo === 'disparo' || /rifle|brc|anark|automatic|arma/.test(t)) return 'arma';
    if (e.activo === 'salida' || e.activo === 'blink' || /key|llave|pomo|portal|cubo|hyperlink|ascensor/.test(t)) return 'herramienta';
    if (e.activo === 'riesgo' || e.activo === 'toxina' || e.activo === 'gas' || /pain|void|corrupt|nuclear|gas/.test(t)) return 'peligro';
    if (e.activo === 'claridad' || /diario|fax|box|heads|server|archivo|telefono/.test(t)) return 'papel';
    if (/stone|silicate|crystal|salt|fiolgine|energy/.test(t)) return 'mineral';
    if (e.activo === 'refugio' || e.pasivo || /jacket|mask|boots|guante|traje|ocelot/.test(t)) return 'refugio';
    if (e.salud || e.sed || e.cordura || /water|juice|soup|candy|jelly|meat|asada|caramelo|sopa|bebida/.test(t)) return 'botella';
    return 'caja';
  }

  function addObjectSprites() {
    const objects = window.GAME_DATA?.objects || {};
    for (const [id, def] of Object.entries(objects)) {
      if (DEFS[id]) continue;
      const c = def.color || '#d8c070';
      DEFS[id] = {
        pal: {
          C: c,
          c: shadeHex(c, 0.65),
          G: shadeHex(c, 1.35),
          g: OUT,
          Y: '#fff1a8',
        },
        frames: [itemRows(itemTipo(def)), itemRows(itemTipo(def))],
      };
    }
  }

  function build() {
    addObjectSprites();
    for (const [id, def] of Object.entries(DEFS))
      cache[id] = def.frames.map((rows) => rasterize(def.pal, rows));
    // variantes HERIDO del jugador (v15): sangre y palidez sobre el sprite base
    // — el HUD sin barras comunica la salud con el propio personaje
    // (hazmat_* sumado en v28.14: es la skin predeterminada, también
    // necesita su variante herida para el mismo aviso visual de salud)
    for (const id of ['player_down', 'player_up', 'player_side', 'hazmat_down', 'hazmat_up', 'hazmat_side'])
      if (cache[id]) cache[id + '_herido'] = cache[id].map(herir);
  }

  function herir(base) {
    const c = document.createElement('canvas');
    c.width = base.width; c.height = base.height;
    const x = c.getContext('2d');
    x.drawImage(base, 0, 0);
    x.globalCompositeOperation = 'source-atop'; // solo pinta SOBRE el cuerpo
    x.fillStyle = 'rgba(122,26,18,0.85)';       // manchas de sangre
    const w = c.width;
    // manchas chicas (reportado: en un sprite de 48px, el tamaño viejo
    // cubría ~1/3 del torso y terminaba leyéndose como "otro traje" en vez
    // de heridas sobre la skin elegida — reducidas a la mitad por lado
    // (1/4 del área) para que Personalizado/Hazmat sigan reconociéndose)
    for (const [mx, my, mw, mh] of [
      [w * 0.40, w * 0.42, 3, 4], [w * 0.56, w * 0.50, 3, 3],
      [w * 0.34, w * 0.62, 3, 3], [w * 0.52, w * 0.74, 4, 3],
      [w * 0.47, w * 0.30, 3, 3],
    ]) x.fillRect(mx, my, mw, mh);
    x.fillStyle = 'rgba(200,200,215,0.14)';     // palidez general
    x.fillRect(0, 0, w, c.height);
    return c;
  }

  const mirrorCache = {};
  function mirror(c) {
    const m = document.createElement('canvas');
    m.width = c.width; m.height = c.height;
    const mc = m.getContext('2d');
    mc.translate(c.width, 0);
    mc.scale(-1, 1);
    mc.drawImage(c, 0, 0);
    return m;
  }

  function get(id, frame, flip) {
    let base;
    if (overrides[id]) base = overrides[id][frame % overrides[id].length];
    else {
      const f = cache[id];
      base = f ? f[frame % f.length] : null;
    }
    if (!base || !flip) return base;
    const key = id + '::' + frame;
    if (!mirrorCache[key] || mirrorCache[key].src !== base) {
      mirrorCache[key] = { src: base, canvas: mirror(base) };
    }
    return mirrorCache[key].canvas;
  }

  // nº de frames reales de un sprite (los llamadores animan con % frameCount)
  function frameCount(id) {
    if (overrides[id]) return overrides[id].length;
    return cache[id] ? cache[id].length : 2;
  }
  const tiene = (id) => !!(overrides[id] || cache[id]);

  function cargarOverride(id, url) {
    const img = new Image();
    img.onload = () => {
      const frameW = img.height === 48 ? 48 : Math.max(1, img.height);
      const n = Math.max(1, Math.floor(img.width / frameW));
      const frames = [];
      for (let i = 0; i < n; i++) {
        const c = document.createElement('canvas');
        c.width = 48; c.height = 48;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        const sx = i * frameW;
        const sw = Math.min(frameW, img.width - sx);
        const sh = img.height;
        const esc = Math.min(48 / sw, 48 / sh);
        const dw = Math.max(1, Math.round(sw * esc));
        const dh = Math.max(1, Math.round(sh * esc));
        const dx = Math.round((48 - dw) / 2);
        const dy = Math.round(48 - dh);
        ctx.drawImage(img, sx, 0, sw, sh, dx, dy, dw, dh);
        frames.push(c);
      }
      overrides[id] = frames;
      overrideVersion++;
    };
    img.src = url;
    return img;
  }

function rutasOverride(id) {
    // "apariencia" sumada acá (v28.15): el usuario coloca ahí TODO el arte de
    // personaje por costumbre (Hair1.png, Superior1_down.png...), así que un
    // override de cuerpo completo como hazmat_down.png también se busca ahí
    // aunque conceptualmente viva en el mismo mecanismo que player_down.png
    const dirs = ['assets/sprites', 'assets/objetos', 'assets/apariencia', 'assets'];
    const exts = ['webp', 'png', 'jpg', 'jpeg'];
    const out = [];
    for (const dir of dirs) for (const ext of exts) out.push(`${dir}/${id}.${ext}?t=${CACHE_BUST}`);
    return out;
  }

  // intenta cargar imagenes externas (hoja horizontal de frames de 48x48).
  // Si no existe archivo, queda activo el sprite procedural generado.
  function tryOverrides(ids) {
    const M = (window.ASSETS_MANIFEST || {}).sprites || {};
    for (const id of ids) {
      if (overrides[id] || !M[id]) continue;
      cargarOverride(id, M[id]);
    }
  }

  // ---------- personalización: capas de pelo/ojos/ropa recoloreables (v28) ----------
  // Cada "estilo" (Hair1, Eyes1, Clothes1...) es UN solo PNG de 144x48 (3
  // frames de 48x48 en fila): frame 0 = down, frame 1 = up, frame 2 = side —
  // ver game/assets/apariencia/LEEME.txt. Un frame puede quedar vacío/
  // transparente (p. ej. ojos que no se ven de espaldas): esa dirección
  // simplemente no dibuja nada ahí. Cada píxel ya viene en gris puro de 3
  // tonos (#4d4d4d/#808080/#b3b3b3). Se dibuja SIN escalar ni centrar (a
  // diferencia de cargarOverride): la alineación píxel a píxel con el cuerpo
  // base es responsabilidad del archivo, no del motor. El motor las tiñe al
  // color elegido y las compone sobre el cuerpo base
  // (game/assets/sprites/player_down/up/side.png, que para este sistema debe
  // ser un cuerpo neutro sin pelo/ropa propios).
  const PREFIJOS_APARIENCIA = window.Apariencia.PREFIJOS; // fuente única, ver js/apariencia.js
  const SIN_COLOR_APARIENCIA = window.Apariencia.CATEGORIAS_SIN_COLOR; // ["superior","inferior"]: se dibujan tal cual
  const DIRS_CAPA = ['down', 'up', 'side'];
  const capasEstilo = {};        // estiloId -> {down, up, side} (canvas SIN teñir — gris para las capas
                                  // tintables, ya en color final para "superior"/"inferior")
  const estilosPorCategoria = {}; // categoria -> [ids encontrados, en orden]
  const tintCache = {};     // 'estilo::dir::color' -> canvas ya teñido
  const tintadoCache = {};  // clave compuesta -> {canvas, flipped}

  // Corrección de posición POR ESTILO/DIRECCIÓN (px), aplicada al dibujar —
  // el PNG del usuario nunca se toca/reacomoda, solo se desplaza dónde cae
  // dentro del frame de 48x48. Calibrado a mano comparando el centro del
  // dibujo contra el centro de la cabeza del cuerpo base (ver
  // game/assets/apariencia/LEEME.txt); agregar una entrada acá si un estilo
  // nuevo aparece corrido.
  const AJUSTE_CAPA = {
  };

  function rutasCapaEstilo(id) {
    return ['webp', 'png', 'jpg', 'jpeg']
      .map((ext) => `assets/apariencia/${id}.${ext}?t=${CACHE_BUST}`);
  }
  function rutasCapaDireccion(id, dir) {
    return ['webp', 'png', 'jpg', 'jpeg']
      .map((ext) => `assets/apariencia/${id}_${dir}.${ext}?t=${CACHE_BUST}`);
  }

  // intenta cargar UN estilo (probando extensiones en orden); cb(true/false)
  // al terminar. Si carga, guarda las 3 direcciones ya recortadas (con el
  // ajuste de AJUSTE_CAPA si corresponde) en capasEstilo[id]. Formato de
  // hoja única (192x48, 4 frames) — usado por cabello/ojos/vello.
  function probarEstilo(id, cb) {
    const urls = rutasCapaEstilo(id);
    let i = 0;
    const siguiente = () => {
      if (i >= urls.length) { cb(false); return; }
      const img = new Image();
      img.onload = () => {
        const out = {};
        const ajuste = AJUSTE_CAPA[id] || {};
        for (let k = 0; k < DIRS_CAPA.length; k++) {
          const dir = DIRS_CAPA[k];
          const { dx = 0, dy = 0 } = ajuste[dir] || {};
          const c = document.createElement('canvas');
          c.width = 48; c.height = 48;
          const ctx = c.getContext('2d');
          ctx.imageSmoothingEnabled = false;
          // recorte 1:1 del frame k-ésimo (48px de ancho), desplazado dx/dy
          ctx.drawImage(img, k * 48, 0, 48, 48, dx, dy, 48, 48);
          out[dir] = c;
        }
        capasEstilo[id] = out;
        overrideVersion++;
        cb(true);
      };
      img.onerror = siguiente;
      img.src = urls[i++];
    };
    siguiente();
  }

  // variante de probarEstilo para categorías "multiarchivo" (hoy:
  // superior/inferior): <Estilo>_down.png, _up.png, _side.png sueltos, CADA
  // UNO puede traer hasta 4 frames de ciclo de caminata (hoja horizontal de
  // 48x48, igual que player_down/up/side.png: 96x48=2 frames, 192x48=4
  // frames...) — a diferencia del resto de las capas (pelo/ojos/vello, una
  // sola pose estática), la ropa SÍ anima con las piernas. Guarda un ARRAY
  // de canvases por dirección (out[dir] = [frame0, frame1, ...]), leído con
  // `frame % out[dir].length` al dibujar (ver capaAnimada en getTintado).
  // "encontrado" = existe al menos "_down"; las otras direcciones que
  // falten quedan vacías, mismo espíritu que un frame en blanco en el
  // formato de hoja única.
  function probarEstiloMultiarchivo(id, cb) {
    const out = {};
    let idx = 0;
    const siguienteDir = () => {
      if (idx >= DIRS_CAPA.length) {
        if (out.down) { capasEstilo[id] = out; overrideVersion++; cb(true); }
        else cb(false);
        return;
      }
      const dir = DIRS_CAPA[idx++];
      const urls = rutasCapaDireccion(id, dir);
      let i = 0;
      const siguienteExt = () => {
        if (i >= urls.length) { siguienteDir(); return; } // esta dirección no tiene archivo: seguir
        const img = new Image();
        img.onload = () => {
          const { dx = 0, dy = 0 } = (AJUSTE_CAPA[id] && AJUSTE_CAPA[id][dir]) || {};
          const n = Math.max(1, Math.floor(img.width / 48)); // hasta 4 frames, como el cuerpo base
          const frames = [];
          for (let k = 0; k < n; k++) {
            const c = document.createElement('canvas');
            c.width = 48; c.height = 48;
            const ctx = c.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, k * 48, 0, 48, 48, dx, dy, 48, 48);
            frames.push(c);
          }
          out[dir] = frames;
          siguienteDir();
        };
        img.onerror = siguienteExt;
        img.src = urls[i++];
      };
      siguienteExt();
    };
    siguienteDir();
  }

  // capa "sin color" (superior/inferior) para el frame de caminata actual —
  // out[dir] es un array de 1 a 4 canvases, ver probarEstiloMultiarchivo
  function capaAnimada(estilo, dir, frame) {
    const frames = capasEstilo[estilo] && capasEstilo[estilo][dir];
    return frames ? frames[frame % frames.length] : null;
  }

  // SIN límite fijo de estilos por categoría: prueba <Prefijo>1, <Prefijo>2...
  // y corta tras MAX_HUECOS_ESTILO números seguidos sin archivo (ver
  // game/assets/apariencia/LEEME.txt) — agregar un estilo nuevo es solo subir
  // el PNG con el número que sigue, sin tocar código. TOPE_ESTILO es una
  // salvaguarda dura (nunca debería alcanzarse con la lógica de huecos).
  const MAX_HUECOS_ESTILO = 3;
  const TOPE_ESTILO = 300;
  const MULTIARCHIVO_APARIENCIA = window.Apariencia.CATEGORIAS_MULTIARCHIVO; // ["superior","inferior"]
  function probarCategoria(categoria, prefijo) {
    estilosPorCategoria[categoria] = estilosPorCategoria[categoria] || [];
    const cargador = MULTIARCHIVO_APARIENCIA.includes(categoria) ? probarEstiloMultiarchivo : probarEstilo;
    let n = 1, huecos = 0;
    const paso = () => {
      if (n > TOPE_ESTILO) return;
      cargador(prefijo + n, (ok) => {
        if (ok) { estilosPorCategoria[categoria].push(prefijo + n); huecos = 0; }
        else huecos++;
        n++;
        if (huecos < MAX_HUECOS_ESTILO) paso();
      });
    };
    paso();
  }
  const tryCapasApariencia = () => {
    for (const [categoria, prefijo] of Object.entries(PREFIJOS_APARIENCIA)) probarCategoria(categoria, prefijo);
  };
  const estilosDisponibles = (categoria) => estilosPorCategoria[categoria] || [];

  function hexToArr(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbStrToArr(s) {
    const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(s);
    return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
  }

  // Remapea los 3 tonos grises exactos de una capa al color elegido con un
  // filtro SVG (feComponentTransfer discreto de 3 pasos por canal) en vez de
  // getImageData/putImageData: las capas se cargan por file:// (juego sin
  // servidor) y Chrome marca esos canvases como "tainted" — getImageData
  // tira SecurityError ahí. drawImage (con o sin filtro) SÍ funciona sobre
  // contenido file://, así que el remapeo se hace enteramente por filtro,
  // nunca leyendo píxeles de vuelta a JS.
  let filtroTinte = null, ffR = null, ffG = null, ffB = null;
  function asegurarFiltroTinte() {
    if (filtroTinte) return;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.style.position = 'absolute'; svg.style.pointerEvents = 'none';
    const filter = document.createElementNS(NS, 'filter');
    filter.setAttribute('id', 'ap-tinte-filtro');
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    const transfer = document.createElementNS(NS, 'feComponentTransfer');
    ffR = document.createElementNS(NS, 'feFuncR');
    ffG = document.createElementNS(NS, 'feFuncG');
    ffB = document.createElementNS(NS, 'feFuncB');
    for (const f of [ffR, ffG, ffB]) f.setAttribute('type', 'discrete');
    transfer.append(ffR, ffG, ffB);
    filter.appendChild(transfer);
    svg.appendChild(filter);
    document.body.appendChild(svg);
    filtroTinte = filter;
  }

  // remapea un canvas CUALQUIERA ya en gris puro de 3 tonos al color elegido
  // (reutilizando shadeHex, misma fórmula de sombreado que el resto del
  // motor) — usada SOLO por el tono de piel (tintarCuerpo, más abajo), que
  // sigue eligiéndose de una paleta fija de swatches. Las capas de cabello/
  // ojos/vello usan tintarMultiply (ver debajo): color continuo, no paleta.
  function remapTonos(fuente, colorHex) {
    asegurarFiltroTinte();
    const sombra = rgbStrToArr(shadeHex(colorHex, 0.62));  // gris #4d4d4d (77)
    const medio = hexToArr(colorHex);                      // gris #808080 (128)
    const brillo = rgbStrToArr(shadeHex(colorHex, 1.32));  // gris #b3b3b3 (179)
    const tabla = (i) => [sombra[i], medio[i], brillo[i]].map((v) => (v / 255).toFixed(4)).join(' ');
    ffR.setAttribute('tableValues', tabla(0));
    ffG.setAttribute('tableValues', tabla(1));
    ffB.setAttribute('tableValues', tabla(2));
    const c = document.createElement('canvas');
    c.width = fuente.width; c.height = fuente.height;
    const ctx = c.getContext('2d');
    ctx.filter = 'url(#ap-tinte-filtro)';
    ctx.drawImage(fuente, 0, 0);
    ctx.filter = 'none';
    return c;
  }

  // Tinte por MULTIPLICACIÓN (v28.9): cabello/ojos/vello pasaron a color
  // CONTINUO (3 sliders R/G/B en la UI, ver ui.js), así que ya no alcanza
  // con el remapeo discreto de 3 tonos de remapTonos (pensado para una
  // paleta cerrada). El sprite gris de la capa actúa de "máscara de
  // sombreado": se compone una vez con globalCompositeOperation='multiply'
  // contra un relleno sólido del color elegido (cada canal del gris queda
  // escalado — multiplicado — por el canal correspondiente del color, así
  // que las zonas más claras del gris se acercan más al color pleno y las
  // oscuras quedan más oscurecidas) y LUEGO se recorta con
  // 'destination-in' contra el MISMO sprite gris para restaurar su alpha
  // original — el 'multiply' de por sí vuelve opaco todo el lienzo
  // (incluidas las zonas transparentes del sprite), así que sin este paso
  // el tinte "rellenaría" la silueta entera en vez de respetarla. Ambos
  // pasos son composición pura de canvas (drawImage/fillRect +
  // globalCompositeOperation) — CERO getImageData, así que sigue
  // funcionando sobre canvases "tainted" por file:// (ver nota grande de
  // v28 más arriba sobre esa trampa).
  function tintarMultiply(fuente, colorHex) {
    const c = document.createElement('canvas');
    c.width = fuente.width; c.height = fuente.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(fuente, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = colorHex;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(fuente, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    return c;
  }

  function tintarCapa(estiloId, dir, colorHex) {
    const gris = capasEstilo[estiloId] && capasEstilo[estiloId][dir];
    if (!gris || !colorHex) return null;
    const key = estiloId + '::' + dir + '::' + colorHex;
    if (tintCache[key]) return tintCache[key];
    const c = tintarMultiply(gris, colorHex);
    tintCache[key] = c;
    return c;
  }

  // tono de piel: el cuerpo base (game/assets/sprites/player_down/up/side.png)
  // debe venir en gris puro de 3 tonos como cualquier capa — se tiñe frame a
  // frame (el ciclo de caminata) con la MISMA remapTonos, cacheado por
  // id+frame+color para no repetir el filtro en cada dibujado
  const tintCuerpoCache = {};
  function tintarCuerpo(baseCanvas, limpioId, frame, colorHex) {
    if (!colorHex) return baseCanvas;
    // overrideVersion en la key: mismo motivo que en getTintado — si el
    // primer teñido de un id+frame+color se pide antes de que
    // player_down/up/side.png termine de cargar, baseCanvas es el sprite
    // PROCEDURAL de respaldo (con colores propios, no gris puro) y
    // remapTonos sobre eso da cualquier cosa; sin esto quedaba cacheado mal
    // para siempre aunque después llegara el override correcto.
    const key = limpioId + '::' + frame + '::' + colorHex + '::' + overrideVersion;
    if (tintCuerpoCache[key]) return tintCuerpoCache[key];
    const c = remapTonos(baseCanvas, colorHex);
    tintCuerpoCache[key] = c;
    return c;
  }

  // sprite del jugador (o de un jugador remoto) con su apariencia elegida
  // compuesta encima: apariencia = {cabello:{estilo,color}, ojos:{...},
  // vello:{...}, superior:{estilo,color:null}, inferior:{...},
  // piel:{estilo:null,color}}. "piel" no es una capa — tiñe el cuerpo base
  // entero con la MISMA remapTonos que el resto (el cuerpo base debe venir
  // en gris de 3 tonos, ver game/assets/sprites/LEEME.txt). "superior"/
  // "inferior" (ropa) tampoco se tiñen — cada estilo ya viene en su color
  // final, se dibujan tal cual (ver CATEGORIAS_SIN_COLOR en apariencia.js).
  function getTintado(baseId, apariencia, frame, flip) {
    if (!apariencia) return get(baseId, frame, flip);
    const herido = baseId.endsWith('_herido');
    const limpioId = herido ? baseId.slice(0, -'_herido'.length) : baseId;
    const dir = limpioId.replace('player_', '');
    // v28.14: skin predeterminada — nada de capas/tinte, es un sprite fijo
    // (hazmat_down/up/side, arriba) que sustituye al cuerpo+capas entero.
    // La variante "_herido" NO se pide directa por get() (bug real: build()
    // arma cache['hazmat_down_herido'] una sola vez, en frío, a partir del
    // sprite PROCEDURAL — nadie sube nunca un archivo "hazmat_down_herido.png",
    // así que get() jamás encuentra un override para ese id y siempre cae al
    // placeholder viejo con sangre encima, ignorando el hazmat_down.png real
    // que haya subido el usuario). Se arma en caliente sobre el sprite sano
    // YA resuelto (que sí respeta overrides[]), cacheado con overrideVersion
    // para no repetir herir() en cada frame ni quedar pegado a un override
    // que todavía no había cargado.
    if (apariencia.modo === 'hazmat') {
      if (!herido) return get('hazmat_' + dir, frame, flip);
      const sano = get('hazmat_' + dir, frame, false);
      if (!sano) return null;
      const key = 'hazmat_' + dir + '|herido|' + frame + '|' + overrideVersion;
      let entry = tintadoCache[key];
      if (!entry) {
        entry = { canvas: herir(sano), flipped: null };
        tintadoCache[key] = entry;
      }
      if (!flip) return entry.canvas;
      if (!entry.flipped) entry.flipped = mirror(entry.canvas);
      return entry.flipped;
    }
    const cats = ['ojos', 'inferior', 'superior', 'vello', 'cabello']; // orden de dibujo, de atrás a adelante — vello y cabello AL FRENTE de la ropa (si no, el cuello de "superior" tapaba la barba, feo sobre todo mirando "down")
    const piel = apariencia.piel;
    // overrideVersion en la key: el cuerpo base (player_down/up/side.png) y
    // las capas cargan async (Image.onload) — si el primer composite de una
    // combinación se pide ANTES de que terminen de cargar, se arma con el
    // sprite procedural de respaldo (get() cae a cache[] mientras
    // overrides[] todavía no existe) y sin esto quedaba cacheado mal PARA
    // SIEMPRE, sin refrescarse cuando el override real llegaba (bug real:
    // "down" se veía distinto a "up"/"side" porque es la primera dirección
    // que se pide, más propensa a la carrera).
    const key = [limpioId, herido ? 1 : 0, frame, piel ? piel.color : '', overrideVersion]
      .concat(cats.map((cat) => {
        const sel = apariencia[cat];
        return sel ? sel.estilo + ':' + sel.color : '';
      }))
      .join('|');
    let entry = tintadoCache[key];
    if (!entry) {
      const baseCanvas = get(limpioId, frame, false);
      if (!baseCanvas) return get(baseId, frame, flip);
      const cuerpo = piel && piel.color ? tintarCuerpo(baseCanvas, limpioId, frame, piel.color) : baseCanvas;
      let c = document.createElement('canvas');
      c.width = 48; c.height = 48;
      const ctx = c.getContext('2d');
      ctx.drawImage(cuerpo, 0, 0);
      for (const cat of cats) {
        const sel = apariencia[cat];
        if (!sel || !sel.estilo) continue;
        const capa = SIN_COLOR_APARIENCIA.includes(cat)
          ? capaAnimada(sel.estilo, dir, frame)
          : tintarCapa(sel.estilo, dir, sel.color);
        if (capa) ctx.drawImage(capa, 0, 0);
      }
      if (herido) c = herir(c);
      entry = { canvas: c, flipped: null };
      tintadoCache[key] = entry;
    }
    if (!flip) return entry.canvas;
    if (!entry.flipped) entry.flipped = mirror(entry.canvas);
    return entry.flipped;
  }

  // ---------- props del entorno ----------
  // mueble con volumen: frente + techo iluminado + lateral derecho en sombra
  function mueble(ctx, cx, baseY, w, h, color) {
    const x = cx - w / 2, y = baseY - h;
    ctx.fillStyle = shadeHex(color, 0.55);            // lateral derecho
    ctx.fillRect(x + w, y + 2, 3, h - 2);
    ctx.fillStyle = color;                            // frente
    ctx.fillRect(x, y + 4, w, h - 4);
    ctx.fillStyle = shadeHex(color, 1.35);            // techo
    ctx.fillRect(x, y, w + 3, 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w + 2, h - 1);
    return { x, y: y + 4, w, h: h - 4 };              // rect del frente para detalles
  }

  function drawProp(ctx, id, cx, cy, t, shade) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 12, 11, 4, 0, 0, 7); ctx.fill();
    switch (id) {
      case 'cono':
        ctx.fillStyle = '#d86830';
        ctx.beginPath(); ctx.moveTo(cx, cy - 12); ctx.lineTo(cx + 8, cy + 10); ctx.lineTo(cx - 8, cy + 10); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f0e8e0';
        ctx.fillRect(cx - 5, cy - 2, 10, 4);
        break;
      case 'bidon': {
        // barril cilíndrico: cuerpo con brillo lateral y tapa elíptica
        ctx.fillStyle = '#3a5446';
        ctx.fillRect(cx - 8, cy - 9, 16, 21);
        ctx.fillStyle = '#4a6858';
        ctx.fillRect(cx - 8, cy - 9, 11, 21);
        ctx.fillStyle = '#5e7c6c';
        ctx.fillRect(cx - 6, cy - 9, 3, 21);
        ctx.fillStyle = '#324a3e';
        ctx.fillRect(cx - 8, cy - 3, 16, 2.5); ctx.fillRect(cx - 8, cy + 5, 16, 2.5);
        ctx.fillStyle = '#6e8c7c';
        ctx.beginPath(); ctx.ellipse(cx, cy - 9, 8, 3, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.strokeRect(cx - 8.5, cy - 9.5, 17, 22);
        break;
      }
      case 'camilla': {
        // camilla: superficie superior visible + faldón + ruedas
        ctx.fillStyle = '#6a746e';
        ctx.fillRect(cx - 14, cy - 2, 28, 8);        // faldón
        ctx.fillStyle = '#c8d4cc';
        ctx.fillRect(cx - 15, cy - 8, 30, 7);        // colchoneta (techo)
        ctx.fillStyle = '#e0e8e2';
        ctx.fillRect(cx - 15, cy - 8, 30, 2.5);
        ctx.fillStyle = '#a8b4ac';
        ctx.fillRect(cx - 15, cy - 8, 8, 7);         // almohada
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.strokeRect(cx - 15.5, cy - 8.5, 31, 8);
        ctx.fillStyle = '#3a403c';
        ctx.beginPath(); ctx.arc(cx - 11, cy + 8, 2.5, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 11, cy + 8, 2.5, 0, 7); ctx.fill();
        break;
      }
      case 'silla':
        ctx.fillStyle = '#6e5a44';
        ctx.fillRect(cx - 7, cy - 12, 3, 20);
        ctx.fillRect(cx - 7, cy - 2, 14, 4);
        ctx.fillRect(cx + 5, cy + 2, 3, 8); ctx.fillRect(cx - 7, cy + 2, 3, 8);
        break;
      case 'seta':
        ctx.fillStyle = '#e8e0d0';
        ctx.fillRect(cx - 2, cy, 4, 9);
        ctx.fillStyle = '#b060c8';
        ctx.beginPath(); ctx.ellipse(cx, cy - 2, 9, 6, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#d8a0e8';
        ctx.fillRect(cx - 4, cy - 5, 3, 2); ctx.fillRect(cx + 2, cy - 4, 2, 2);
        break;
      case 'roca_p':
        ctx.fillStyle = shade ?? '#7a7a72';
        ctx.beginPath(); ctx.moveTo(cx - 9, cy + 8); ctx.lineTo(cx - 6, cy - 4); ctx.lineTo(cx + 3, cy - 7); ctx.lineTo(cx + 9, cy + 8); ctx.closePath(); ctx.fill();
        break;
      case 'farola': {
        ctx.fillStyle = '#2a2a30';
        ctx.fillRect(cx - 2, cy - 26, 4, 38);
        const glow = 0.75 + Math.sin(t / 300) * 0.15;
        ctx.shadowColor = '#ff9860'; ctx.shadowBlur = 14 * glow;
        ctx.fillStyle = '#ffb070';
        ctx.beginPath(); ctx.arc(cx, cy - 28, 5, 0, 7); ctx.fill();
        break;
      }
      case 'caja': {
        const f = mueble(ctx, cx, cy + 10, 18, 18, '#8a6a42');
        ctx.strokeStyle = '#5e4830';
        ctx.beginPath();
        ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + f.w, f.y + f.h);
        ctx.moveTo(f.x + f.w, f.y); ctx.lineTo(f.x, f.y + f.h);
        ctx.stroke();
        break;
      }
      case 'reloj': {
        ctx.fillStyle = '#5e4a34';
        ctx.fillRect(cx - 6, cy - 18, 12, 30);
        ctx.fillStyle = '#e8d8b0';
        ctx.beginPath(); ctx.arc(cx, cy - 11, 4.5, 0, 7); ctx.fill();
        ctx.strokeStyle = '#3a2e20';
        const a = t / 700;
        ctx.beginPath(); ctx.moveTo(cx, cy - 11); ctx.lineTo(cx + Math.cos(a) * 3.5, cy - 11 + Math.sin(a) * 3.5); ctx.stroke();
        break;
      }
      case 'cable':
        ctx.strokeStyle = '#2a2622'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx - 12, cy + 8);
        ctx.quadraticCurveTo(cx - 2, cy - 4, cx + 4, cy + 6);
        ctx.quadraticCurveTo(cx + 10, cy + 12, cx + 14, cy + 4);
        ctx.stroke();
        break;
      // ----- contenedores registrables (muebles con volumen) -----
      case 'taquilla': {
        const f = mueble(ctx, cx, cy + 12, 17, 36, '#5a6a74');
        ctx.strokeStyle = '#39434b';
        ctx.beginPath(); ctx.moveTo(cx, f.y); ctx.lineTo(cx, f.y + f.h); ctx.stroke(); // dos puertas
        ctx.fillStyle = '#414c54';                                    // rejillas de ventilación
        for (const px of [cx - 6.5, cx + 2]) {
          ctx.fillRect(px, f.y + 4, 5, 1.6);
          ctx.fillRect(px, f.y + 7, 5, 1.6);
          ctx.fillRect(px, f.y + 10, 5, 1.6);
        }
        ctx.fillStyle = '#2c343a';                                    // tiradores
        ctx.fillRect(cx - 3.5, f.y + f.h - 14, 1.6, 5);
        ctx.fillRect(cx + 2, f.y + f.h - 14, 1.6, 5);
        break;
      }
      case 'archivador': {
        const f = mueble(ctx, cx, cy + 12, 17, 30, '#7a7264');
        ctx.strokeStyle = '#544e42';
        for (let i = 0; i < 3; i++) {
          ctx.strokeRect(f.x + 2, f.y + 2 + i * 8, f.w - 4, 6.5);     // cajones
          ctx.fillStyle = '#4a463c';
          ctx.fillRect(cx - 2.5, f.y + 4.5 + i * 8, 5, 1.6);          // asas
        }
        break;
      }
      case 'nevera': {
        const f = mueble(ctx, cx, cy + 12, 17, 34, '#c8d0cc');
        ctx.strokeStyle = '#8e9a94';
        ctx.beginPath(); ctx.moveTo(f.x, f.y + 11); ctx.lineTo(f.x + f.w, f.y + 11); ctx.stroke();
        ctx.fillStyle = '#6e7a74';                                     // tiradores
        ctx.fillRect(f.x + f.w - 4, f.y + 3, 2, 6);
        ctx.fillRect(f.x + f.w - 4, f.y + 14, 2, 9);
        break;
      }
      case 'cofre': {
        const f = mueble(ctx, cx, cy + 10, 20, 16, '#8a6a42');
        ctx.fillStyle = '#6e5434';                                     // fleje central
        ctx.fillRect(cx - 1.5, f.y - 4, 3, f.h + 4);
        ctx.fillStyle = '#e0b040';                                     // cerradura
        ctx.fillRect(cx - 2.5, f.y + 4, 5, 5);
        break;
      }
    }
    ctx.restore();
  }

  // capa visual de la máscara de gas (v25.1): sin arte procedural — solo
  // overrides PNG en game/assets/sprites/mascara_down.png, _up.png, _side.png
  // (hoja horizontal de 48×48 como cualquier otro override; opcional, si no
  // existen no se dibuja nada). Se compone SOBRE el sprite del jugador.
  const CAPA_MASCARA_GAS = ['mascara_down', 'mascara_up', 'mascara_side'];

  // los 3 cachés de teñido (tintCache/tintadoCache/tintCuerpoCache) crecen
  // sin límite mientras dura la sesión — sobre todo arrastrando un slider
  // RGB del personalizador, que genera un canvas nuevo por cada valor
  // intermedio. Se limpian solas en gameplay (no hace falta llamarlo ahí:
  // la combinación real que se usa se recachea al toque), pero conviene
  // vaciarlas al cerrar el panel de Personalizar, donde se genera la
  // mayoría de esa basura y no vuelve a hacer falta.
  function limpiarTintado() {
    for (const k in tintCache) delete tintCache[k];
    for (const k in tintadoCache) delete tintadoCache[k];
    for (const k in tintCuerpoCache) delete tintCuerpoCache[k];
  }

  build();
  window.Sprites = {
    get, tryOverrides, drawProp, frameCount, tiene,
    list: () => Object.keys(DEFS),
    CAPA_MASCARA_GAS,
    version: () => overrideVersion,
// personalización de personaje (v28)
    tryCapasApariencia, estilosDisponibles, getTintado, limpiarTintado,
  };
})();
