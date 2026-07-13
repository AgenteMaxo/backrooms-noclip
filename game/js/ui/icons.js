// Iconos pixel-art de la UI (v14): sustituyen a los emojis del sistema para que
// el HUD tenga arte propio y consistente. Matrices 12×12 rasterizadas a 36px con
// contorno y sombreado (mismo espíritu que sprites.js). También genera el marco
// 9-slice de los paneles (variable CSS --marco).
(function () {
  const OUT = 'rgba(10,8,6,0.9)';

  function shadeHex(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
    const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
    const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
    return `rgb(${r},${g},${b})`;
  }

  function rasterize(pal, rows) {
    const S = 12, P = 3;
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
    ctx.fillStyle = OUT;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        if (grid[y][x]) continue;
        const near = (grid[y - 1]?.[x]) || (grid[y + 1]?.[x]) || grid[y][x - 1] || grid[y][x + 1];
        if (near) ctx.fillRect(x * P, y * P, P, P);
      }
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const col = grid[y][x];
        if (!col) continue;
        let f = 1.08 - 0.22 * ((y - minY) / hSpan);
        if (!grid[y - 1]?.[x]) f *= 1.1;
        ctx.fillStyle = col[0] === '#' ? shadeHex(col, f) : col;
        ctx.fillRect(x * P, y * P, P, P);
      }
    return c;
  }

  // ---------- definiciones ----------
  const D = {};
  D.corazon = { pal: { r: '#c94a3a', w: '#f0a898' }, m: [
    '............', '..rr...rr...', '.rrrr.rrrr..', '.rwrrrrrrr..',
    '.rrrrrrrrr..', '.rrrrrrrrr..', '..rrrrrrr...', '...rrrrr....',
    '....rrr.....', '.....r......', '............', '............'] };
  D.yin = { pal: { p: '#8a78c0' }, m: [
    '............', '...pppppp...', '..pp....pp..', '.pp..pp..pp.',
    '.pp.p..p.pp.', '.pp.p.pp.pp.', '.pp.p....pp.', '.pp..pppppp.',
    '..pp........', '...pppppp...', '............', '............'] };
  D.gota = { pal: { b: '#4a80a8', B: '#88c0e0' }, m: [
    '.....b......', '.....bb.....', '....bbbb....', '....bbbb....',
    '...bbbbbb...', '..bbbbbbbb..', '..bBbbbbbb..', '..bBbbbbbb..',
    '..bbbbbbbb..', '...bbbbbb...', '....bbbb....', '............'] };
  D.pan = { pal: { t: '#c89858', T: '#8a6430', x: '#e8c088' }, m: [
    '............', '............', '...tttttt...', '..tttttttt..',
    '.txttxttxtt.', '.tttttttttt.', '.tTtttTttTt.', '.tttttttttt.',
    '..TTTTTTTT..', '............', '............', '............'] };
  D.refresco = { pal: { c: '#4a90a0', C: '#2a6070', g: '#c0c8cc' }, m: [
    '............', '...gggggg...', '...g.gg.g...', '...cccccc...',
    '...cccccc...', '...cgggcc...', '...cgggcc...', '...cccccc...',
    '...cccccc...', '...CCCCCC...', '............', '............'] };
  D.botiquin = { pal: { w: '#e8e4d8', r: '#c94a3a', G: '#a8a49a' }, m: [
    '............', '..wwwwwwww..', '.wwwwwwwwww.', '.wwwwrrwwww.',
    '.wwwwrrwwww.', '.wwrrrrrrww.', '.wwrrrrrrww.', '.wwwwrrwwww.',
    '.wwwwrrwwww.', '.wGGGGGGGGw.', '..wwwwwwww..', '............'] };
  D.linterna = { pal: { g: '#5a5a52', y: '#c8b040', Y: '#f8f0c0' }, m: [
    '............', '............', '..ggg.......', '.ggggg.Y....',
    '.gyygg.YY...', '.gyygg.YYY..', '.gyygg.YY...', '.ggggg.Y....',
    '..ggg.......', '............', '............', '............'] };
  D.chaqueta = { pal: { j: '#5f7454', z: '#c9c9b2' }, m: [
    '............', '..jj.zz.jj..', '.jjjjzzjjjj.', '.jjjjzzjjjj.',
    '.jj.jzzj.jj.', '.jj.jzzj.jj.', '.jj.jzzj.jj.', '....jzzj....',
    '....jzzj....', '....jjjj....', '............', '............'] };
  D.cuadro = { pal: { m: '#8a6430', s: '#7a90a8', v: '#49593f' }, m: [
    '............', '.mmmmmmmmmm.', '.mssssssssm.', '.msssssvssm.',
    '.mssssvvvsm.', '.msvssvvvsm.', '.mvvvvvvvsm.', '.mvvvvvvvvm.',
    '.mmmmmmmmmm.', '............', '............', '............'] };
  D.llave = { pal: { k: '#d9b95a' }, m: [
    '............', '...kkk......', '..kk.kk.....', '..kk.kk.....',
    '...kkk......', '....kk......', '....kk......', '....kkkk....',
    '....kk......', '....kkkk....', '............', '............'] };
  D.tuberia = { pal: { g: '#8a8a82', G: '#5a5a52', r: '#9a5a30' }, m: [
    '............', '.ggg........', '.gGg........', '.gGg........',
    '.gGggggg....', '.gGGGGGgg...', '.ggggggGg...', '......gGg...',
    '......gGg...', '..r...ggg...', '............', '............'] };
  D.fuego = { pal: { o: '#e0742c', y: '#f0c040', r: '#c94a35' }, m: [
    '.....o......', '.....oo.....', '....roo.....', '....rooo....',
    '...rroooo...', '...royyoo...', '..rooyyyoo..', '..royyyyro..',
    '..royyyyro..', '...oyyyyo...', '....oyyo....', '............'] };
  D.guante = { pal: { g: '#c0b090', G: '#8a7a60' }, m: [
    '............', '...g.g.g....', '..gggggg....', '..gggggg.g..',
    '..gggggggg..', '..gggggggg..', '..gggggg....', '...ggggg....',
    '...ggggg....', '...GGGGG....', '............', '............'] };
  D.antena = { pal: { a: '#9a9a92', w: '#7ae0e8' }, m: [
    '............', '........w...', '...a...w....', '..aaa.w.w...',
    '..aaa.w.w...', '...a...w....', '...a....w...', '..aaa.......',
    '.aaaaa......', '............', '............', '............'] };
  D.trebol = { pal: { v: '#4aa84a', t: '#8a6430' }, m: [
    '............', '...vv.vv....', '..vvvvvvv...', '..vvvvvvv...',
    '...vvvvv....', '..vvvvvvv...', '..vvvvvvv...', '...vv.vv....',
    '.....t......', '.....tt.....', '............', '............'] };
  D.interrogante = { pal: { y: '#e8c95a' }, m: [
    '............', '...yyyy.....', '..yy..yy....', '..yy..yy....',
    '......yy....', '.....yy.....', '....yy......', '....yy......',
    '............', '....yy......', '....yy......', '............'] };
  D.dado = { pal: { w: '#e8e4d8', d: '#2a2622' }, m: [
    '............', '..wwwwwwww..', '.wwwwwwwwww.', '.wwdwwwwwww.',
    '.wwwwwwwwww.', '.wwwwdwwwww.', '.wwwwwwwwww.', '.wwwwwwwdww.',
    '.wwwwwwwwww.', '..wwwwwwww..', '............', '............'] };
  D.engranaje = { pal: { g: '#9a9a92' }, m: [
    '............', '...g.gg.g...', '..gggggggg..', '.gggg..gggg.',
    '.ggg....ggg.', 'gggg....gggg', 'gggg....gggg', '.ggg....ggg.',
    '.gggg..gggg.', '..gggggggg..', '...g.gg.g...', '............'] };
  D.altavoz = { pal: { s: '#d9c66e', w: '#efe8d0' }, m: [
    '............', '....ss......', '..ssss..w...', '..ssss.w.w..',
    '..ssss.w.w..', '..ssss.w.w..', '..ssss..w...', '....ss......',
    '............', '............', '............', '............'] };
  D.altavoz_mudo = { pal: { s: '#9a9482', r: '#c94a3a' }, m: [
    '............', '....ss......', '..ssss......', '..ssss.r.r..',
    '..ssss..r...', '..ssss.r.r..', '..ssss......', '....ss......',
    '............', '............', '............', '............'] };
  D.libro = { pal: { b: '#8a6430', B: '#5a4020', w: '#e8dcc0' }, m: [
    '............', '..bbbbbbbb..', '.bwwwwwwwwb.', '.bwwwwwwwwb.',
    '.bwBBBwwwwb.', '.bwwwwwwwwb.', '.bwBBBBwwwb.', '.bwwwwwwwwb.',
    '.bwwwwwwwwb.', '..bbbbbbbb..', '............', '............'] };
  D.puerta = { pal: { d: '#8a6430', D: '#5a4020', k: '#d9b95a' }, m: [
    '............', '..dddddddd..', '..dDDDDDDd..', '..dDddddDd..',
    '..dDddddDd..', '..dDddddDd..', '..dDddkdDd..', '..dDddddDd..',
    '..dDddddDd..', '..dDDDDDDd..', '..dddddddd..', '............'] };
  D.estrella = { pal: { y: '#e8c95a', Y: '#f8ecb0' }, m: [
    '.....yy.....', '.....yy.....', '....yyyy....', '.yyyyYYyyyy.',
    '..yyyYYyyy..', '...yyyyyy...', '...yyyyyy...', '..yyy..yyy..',
    '..yy....yy..', '............', '............', '............'] };
  D.calavera = { pal: { w: '#e8e4d8', d: '#2a2622' }, m: [
    '............', '...wwwwww...', '..wwwwwwww..', '..wddwwddw..',
    '..wddwwddw..', '..wwwwwwww..', '...wwdwww...', '...wwwwww...',
    '....w.w.w...', '............', '............', '............'] };
  D.onda = { pal: { c: '#7ac0e0' }, m: [
    '............', '............', '............', '.cc.....cc..',
    'c...c..c...c', '.....cc.....', '............', '.cc.....cc..',
    'c...c..c...c', '.....cc.....', '............', '............'] };
  D.infinito = { pal: { c: '#c0a8e0' }, m: [
    '............', '............', '............', '..cc....cc..',
    '.c..c..c..c.', '.c...cc...c.', '.c...cc...c.', '.c..c..c..c.',
    '..cc....cc..', '............', '............', '............'] };
  D.frio = { pal: { w: '#bce4f0' }, m: [
    '.....w......', '..w..w..w...', '...w.w.w....', '....www.....',
    '.wwwwwwwww..', '....www.....', '...w.w.w....', '..w..w..w...',
    '.....w......', '............', '............', '............'] };
  D.punto = { pal: { k: '#e0d8c0' }, m: [
    '............', '............', '............', '....kkkk....',
    '...kkkkkk...', '...kkkkkk...', '...kkkkkk...', '...kkkkkk...',
    '....kkkk....', '............', '............', '............'] };
  D.paraguas = { pal: { r: '#c05050', g: '#8a8a82' }, m: [
    '............', '....rrrr....', '..rrrrrrrr..', '.rrrrrrrrrr.',
    '.rr.rr.rr.r.', '.....g......', '.....g......', '.....g......',
    '.....gg.....', '............', '............', '............'] };
  D.carne = { pal: { m: '#b06048', M: '#8a4030', h: '#e8e0d0' }, m: [
    '............', '...mmmm.....', '..mmmmmm....', '..mMmmmm....',
    '..mmmmmmh...', '...mmmm.hh..', '.........h..', '........hh..',
    '............', '............', '............', '............'] };
  D.ojo = { pal: { w: '#e8e4d8', i: '#4a80a8', d: '#1a1a16' }, m: [
    '............', '............', '....wwww....', '..wwwwwwww..',
    '.wwwiiiiwww.', '.wwiiddiiww.', '.wwwiiiiwww.', '..wwwwwwww..',
    '....wwww....', '............', '............', '............'] };
  D.ojos = { pal: { w: '#e8e4d8', d: '#1a1a16' }, m: [
    '............', '............', '..www..www..', '.wwww..wwww.',
    '.wdww..wdww.', '.wwww..wwww.', '..ww....ww..', '............',
    '............', '............', '............', '............'] };
  D.diametro = { pal: { g: '#c0b8a0' }, m: [
    '............', '........g...', '...gggg.g...', '..g....gg...',
    '.g....g..g..', '.g...g....g.', '.g..g.....g.', '.g.g......g.',
    '..gg.....g..', '.g.gggggg...', '............', '............'] };
  D.reloj = { pal: { d: '#3a3a32', w: '#efe8d0' }, m: [
    '............', '...wwwwww...', '..ww....ww..', '.ww..d...ww.',
    '.w...d....w.', '.w...ddd..w.', '.ww......ww.', '..ww....ww..',
    '...wwwwww...', '............', '............', '............'] };
  D.pluma = { pal: { w: '#d8d0c0', W: '#a8a090' }, m: [
    '........ww..', '.......www..', '......wwww..', '.....wwwW...',
    '....wwwW....', '...wwwW.....', '..wwwW......', '..wwW.......',
    '.wW.........', '.W..........', '............', '............'] };
  D.vacio = { pal: { g: '#b0a890' }, m: [
    '............', '....gg.gg...', '..g......g..', '.g........g.',
    '............', '.g........g.', '..g......g..', '....gg.gg...',
    '............', '............', '............', '............'] };
  D.espejo = { pal: { m: '#8a94a8', w: '#d8e4f0', W: '#ffffff' }, m: [
    '............', '....mmmm....', '...mwwwwm...', '..mwWwwwwm..',
    '..mwwWwwwm..', '..mwwwwwwm..', '..mwwwwwwm..', '...mwwwwm...',
    '....mmmm....', '.....mm.....', '....mmmm....', '............'] };
  D.niebla = { pal: { f: '#b8b4a4' }, m: [
    '............', '............', '..ffffff....', '.f......f...',
    '...ffffffff.', '............', '.ffffff.....', '.......fff..',
    '...ffffff...', '............', '............', '............'] };
  D.mochila = { pal: { m: '#7a5c38', M: '#5a4226', k: '#d9b95a' }, m: [
    '............', '...m....m...', '..mm....mm..', '..mmmmmmmm..',
    '.mmmmmmmmmm.', '.mMMMMMMMMm.', '.mmmmmmmmmm.', '.mmmkkkkmmm.',
    '.mmmkmmkmmm.', '.mmmmmmmmmm.', '..MMMMMMMM..', '............'] };
  D.cuchillo = { pal: { b: '#c8ccd0', h: '#5a4632' }, m: [
    '.........b..', '........bb..', '.......bbb..', '......bbb...',
    '.....bbb....', '....bbb.....', '...bbb......', '..hh........',
    '.hhh........', '.hh.........', '............', '............'] };
  D.mascara = { pal: { g: '#5a6a58', G: '#39443a', v: '#a8c0b0', f: '#2a3028' }, m: [
    '............', '...gggggg...', '..gggggggg..', '..gvvggvvg..',
    '..gvvggvvg..', '..gggggggg..', '..gGGggGGg..', '...gGGGGg...',
    '....gffg....', '....ffff....', '....ffff....', '............'] };
  D.bota = { pal: { b: '#7a5c38', B: '#54401f', s: '#3a2f18' }, m: [
    '............', '....bb......', '....bbb.....', '....bbb.....',
    '....bbb.....', '....bbbb....', '....bbbbbb..', '....bbbbbb..',
    '...BbbbbbB..', '..ssssssss..', '..ssssssss..', '............'] };
  // mano IZQUIERDA vista desde atrás (pulgar hacia dentro); la derecha se espeja
  D.mano = { pal: { p: '#d8a878', P: '#b08050', m: '#5f7454' }, m: [
    '............', '...p.p.p....', '..pppppp....', '..pppppp.p..',
    '..pppppppp..', '..pppppppp..', '..PpPpPp....', '...ppppp....',
    '...ppppp....', '...mmmmm....', '...mmmmm....', '............'] };
  D.mando = { pal: { c: '#9a9482', d: '#14120d', r: '#c94a3a', b: '#4a80a8' }, m: [
    '............', '............', '..cccccccc..', '.cccccccccc.',
    '.cc.d..b..c.', '.cd.d.c.r.c.', '.cc.d.....c.', '.ccc....ccc.',
    '..c......c..', '............', '............', '............'] };
  D.nota = { pal: { n: '#d9c66e', w: '#efe8d0' }, m: [
    '....nnnnnnnn', '....nnnnnnnw', '....n.....n.', '....n.....n.',
    '....n.....n.', '....n.....n.', '..nnn...nnn.', '.nnnn..nnnn.',
    '.nnnn..nnnn.', '..nn....nn..', '............', '............'] };
  D.pergamino = { pal: { p: '#d8c9a0', P: '#a8946a', l: '#6a5c40' }, m: [
    '............', '..PPPPPPPP..', '..Pppppppp..', '..pllllllp..',
    '..pppppppp..', '..plllllpp..', '..pppppppp..', '..pllllllp..',
    '..pppppppp..', '..plllpppp..', '..PPPPPPPP..', '............'] };

  // emojis históricos → id de icono (rules.js y textos siguen escribiendo emojis;
  // la UI los traduce aquí; si no hay traducción, se muestra el texto tal cual)
  const EMOJI2ID = {
    '♥': 'corazon', '☯': 'yin', '💧': 'gota', '🍞': 'pan', '🥤': 'refresco',
    '🩹': 'botiquin', '🔦': 'linterna', '🧥': 'chaqueta', '🖼': 'cuadro',
    '🗝': 'llave', '🔧': 'tuberia', '🔥': 'fuego', '🧤': 'guante',
    '📡': 'antena', '🍀': 'trebol', '❓': 'interrogante', '🎲': 'dado',
    '⚙': 'engranaje', '🔊': 'altavoz', '🔇': 'altavoz_mudo', '📓': 'libro',
    '📖': 'libro', '🚪': 'puerta', '⭐': 'estrella', '☠': 'calavera',
    '〰': 'onda', '♾': 'infinito', '❄': 'frio', '●': 'punto', '☔': 'paraguas',
    '🍖': 'carne', '👁': 'ojo', '👀': 'ojos', '⌀': 'diametro', '🕰': 'reloj',
    '🪶': 'pluma', '∅': 'vacio', '🪞': 'espejo', '🌫': 'niebla', '🔪': 'cuchillo', '🎵': 'nota',
  };

  const cache = {}, urls = {}, overrides = {};
  function canvasOf(id) {
    if (!D[id]) return null;
    if (!cache[id]) cache[id] = rasterize(D[id].pal, D[id].m);
    return cache[id];
  }
  function url(id) {
    if (overrides[id]) return overrides[id];
    if (!urls[id]) {
      const c = canvasOf(id);
      urls[id] = c ? c.toDataURL() : '';
    }
    return urls[id];
  }
  // overrides PNG opcionales en game/assets/icons/<id>.png (v25.2): mismo
  // espíritu que Sprites.tryOverrides, pero un solo cuadrado (sin frames).
  // Se piden al arrancar (main.js), antes de que se pinte ningún panel, así
  // que en la práctica ya están listos para cuando el jugador abre algo.
  function tryOverrides(ids) {
    for (const id of ids) {
      if (overrides[id]) continue;
      const im = new Image();
      im.onload = () => { overrides[id] = 'assets/icons/' + id + '.png'; };
      im.src = 'assets/icons/' + id + '.png';
    }
  }
  function img(id, size = 16, flip = false) {
    const im = document.createElement('img');
    im.className = 'icono';
    im.src = url(id);
    im.style.width = im.style.height = size + 'px';
    if (flip) im.style.transform = 'scaleX(-1)';
    im.alt = '';
    return im;
  }
  // sustituye el contenido de un elemento por un icono (para botones que alternan)
  function set(el, id, size = 16) {
    el.textContent = '';
    el.appendChild(img(id, size));
  }
  function deEmoji(ch) { return EMOJI2ID[ch] || null; }

  // ---------- marco 9-slice de paneles (variable CSS --marco) ----------
  function marco() {
    const c = document.createElement('canvas');
    c.width = c.height = 24;
    const x = c.getContext('2d');
    x.fillStyle = '#14120d'; x.fillRect(0, 0, 24, 24);          // fondo (fill)
    x.fillStyle = '#060504'; x.fillRect(0, 0, 24, 1); x.fillRect(0, 23, 24, 1);
    x.fillRect(0, 0, 1, 24); x.fillRect(23, 0, 1, 24);          // contorno exterior
    x.fillStyle = '#8a7a3d';                                     // banda dorada
    x.fillRect(1, 1, 22, 2); x.fillRect(1, 21, 22, 2);
    x.fillRect(1, 1, 2, 22); x.fillRect(21, 1, 2, 22);
    x.fillStyle = '#d9c66e';                                     // bisel iluminado
    x.fillRect(1, 1, 22, 1); x.fillRect(1, 1, 1, 22);
    x.fillStyle = '#060504';                                     // línea interior
    x.fillRect(3, 3, 18, 1); x.fillRect(3, 20, 18, 1);
    x.fillRect(3, 3, 1, 18); x.fillRect(20, 3, 1, 18);
    x.fillStyle = '#d9c66e';                                     // remaches de esquina
    x.fillRect(2, 2, 2, 2); x.fillRect(20, 2, 2, 2);
    x.fillRect(2, 20, 2, 2); x.fillRect(20, 20, 2, 2);
    return c.toDataURL();
  }
  document.documentElement.style.setProperty('--marco', `url(${marco()})`);

  // al cargar: rellena todos los [data-icon] estáticos del HTML
  function boot() {
    document.querySelectorAll('[data-icon]').forEach((el) => {
      const id = el.getAttribute('data-icon');
      const size = parseInt(el.getAttribute('data-icon-size') || '16', 10);
      if (D[id]) { el.textContent = ''; el.appendChild(img(id, size)); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.Icons = {
    url, img, set, deEmoji, tryOverrides, has: (id) => !!D[id],
    list: () => Object.keys(D),
  };
})();
