// BACKROOMS MMO — cliente de red.
// Se conecta al servidor de salas, construye el MISMO mapa que él a partir de
// la semilla (idéntico código MapGen/RNG a ambos lados) y a partir de ahí solo
// intercambia intenciones y eventos: por la red nunca viaja un mapa.
(function () {
  let ws = null;
  let miId = null;
  let listo = false;
  let reintento = null;
  let inputChat = null;
  // v22 — movimiento libre: estado de input y reconciliación
  const input = { dx: 0, dy: 0 };
  let inputEnviado = { dx: 0, dy: 0 };
  let rotEnviada = 0, rotUltEnvio = 0;
  let tileFov = null; // último tile con FOV calculado
  // v23 — latencia y reconciliación honesta: historial de posiciones locales
  // para comparar la posición del servidor CONTRA DÓNDE ESTABAS cuando él la
  // calculó (comparar contra el presente te arrastra hacia atrás al correr)
  let rtt = 100;           // ms ida y vuelta (medido con ping/pong)
  let pingTimer = null;
  const historia = [];     // [{t, x, y}] de la predicción local (~1 s)

  function urlServidor() {
    const params = new URLSearchParams(location.search);
    if (params.get('ws')) return params.get('ws');
    if (location.protocol === 'http:' || location.protocol === 'https:')
      return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    return 'ws://localhost:8080/ws'; // desarrollo desde file://
  }

  function token() {
    try {
      let t = localStorage.getItem('mmo-token');
      if (!t) {
        t = Array.from(crypto.getRandomValues(new Uint8Array(16)),
          (b) => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem('mmo-token', t);
      }
      return t;
    } catch (e) { return 'sin-token'; }
  }

  function enviar(msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  function iniciar(nombre) {
    const w = Game.world;
    const params = new URLSearchParams(location.search);
    ws = new WebSocket(urlServidor());
    ws.onopen = () => enviar({
      t: 'hola', nombre, token: token(), v: 3, // debe coincidir con protocolo.js
      nivel: params.get('nivel') || undefined, // puerta de desarrollo (solo MMO_DEV=1)
    });
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      recibir(m, w);
    };
    ws.onclose = () => {
      listo = false;
      clearInterval(pingTimer);
      if (w.level) w.log('Conexión perdida con las Backrooms… reintentando.', 'danger');
      clearTimeout(reintento);
      reintento = setTimeout(() => iniciar(nombre), 3000);
    };
    ws.onerror = () => {};
    // medición de RTT: alimenta la reconciliación y el retardo de interpolación
    clearInterval(pingTimer);
    pingTimer = setInterval(() => enviar({ t: 'ping', ts: Math.round(performance.now()) }), 4000);
  }

  function nombreDe(id) {
    if (id === miId) return 'Tú';
    const o = Otros.lista.find((x) => x.id === id);
    return o ? o.nombre : '???';
  }

  function entidadDe(uid) {
    return Game.world.entities.find((e) => e.uid === uid);
  }

  function posDe(id) {
    const w = Game.world;
    if (id === miId) return [w.player.x, w.player.y, w.player];
    const o = Otros.lista.find((x) => x.id === id);
    return o ? [o.x, o.y, o] : null;
  }

  function recibir(m, w) {
    switch (m.t) {
      case 'bienvenida':
        miId = m.id;
        // reconexión = sesión nueva: la condición de guardián hay que revalidarla
        if (w.esAdmin) { w.esAdmin = false; if (window.onAdminCambia) window.onAdminCambia(false); }
        Game.startRun(m.semilla); // jugador, HUD y tarjeta de presentación
        construirNivel(m, w);
        w.log(`Estás en ${w.level.nombre} · instancia ${m.inst}. Pulsa T para hablar.`, 'good');
        crearChatUI();
        break;
      case 'nivel': { // cruce de salida: nivel nuevo (la caminata funde sin tarjeta)
        construirNivel(m, w);
        const def = w.level;
        const listo2 = () => {
          w.ui.updateHUD();
          w.log(`— ${def.nombre} —`, 'event');
          if (m.via) w.log(m.via, 'event');
          if (window.Sfx) { Sfx.stopAmbient(); Sfx.ambient(def); }
        };
        if (m.sinTarjeta) listo2();
        else w.ui.showLevelCard(def, listo2);
        break;
      }
      case 'entra': if (listo) Otros.entra(m); break;
      case 'sale': if (listo) Otros.sale(m.id); break;
      case 'mueve': // teleports: spawn, respawn, corrección dura
        if (!listo) return;
        if (m.id === miId) {
          w.player.x = m.x; w.player.y = m.y;
          w.player.rx = m.x; w.player.ry = m.y;
          historia.length = 0;
          fov(w);
        } else Otros.mueve(m.id, m.x, m.y);
        break;
      case 'pos': // v22: lote de posiciones del tick (jugadores y entidades)
        if (!listo) return;
        for (const [id, x, y] of m.j || []) {
          if (id === miId) reconciliar(w, x, y);
          else Otros.pos(id, x, y);
        }
        for (const [uid, x, y] of m.e || []) {
          const e = entidadDe(uid);
          if (e) { e.x = x; e.y = y; Otros.pushSnap(e, x, y); }
        }
        break;
      case 'pong':
        if (m.ts !== undefined) {
          const medida = performance.now() - m.ts;
          rtt = rtt * 0.7 + medida * 0.3; // suavizado: un pico no dispara nada
        }
        break;
      case 'gira': if (listo) Otros.gira(m.id, m.rot); break;
      case 'chat':
        if (!listo) return;
        Otros.chat(m.id, m.txt, performance.now());
        w.log(`${nombreDe(m.id)}: ${m.txt}`, 'event');
        break;

      // ---------- entidades ----------
      case 'entMueve': { // teleport de entidad: sin interpolación que valga
        const e = entidadDe(m.uid);
        if (e) { e.x = m.x; e.y = m.y; e.rx = m.x; e.ry = m.y; e._snaps = null; }
        break;
      }
      case 'entPrep': {
        const e = entidadDe(m.uid);
        if (!e) return;
        e.preparando = true;
        if (window.Effects) Effects.number(e.x, e.y, '⚠', '#ffd860');
        if (window.Sfx && cerca(w, e.x, e.y, 10)) Sfx.cue('generico');
        break;
      }
      case 'entAtaca': {
        const e = entidadDe(m.uid);
        if (e) { e.preparando = false; e._atkT = performance.now(); }
        if (m.id === miId) {
          if (window.Effects) { Effects.doShake(6, 180); Effects.particles(w.player.x, w.player.y, '#b03030', 12); }
          if (window.Sfx) Sfx.play('golpe');
          w.log(`¡${e ? e.def.nombre : 'Algo'} te ataca!`, 'danger');
        }
        break;
      }
      case 'entFalla': {
        const e = entidadDe(m.uid);
        if (!e) return;
        e.preparando = false;
        if (cerca(w, e.x, e.y, 8)) w.log(`${e.def.nombre} desgarra el aire.`, 'good');
        break;
      }
      case 'entMuere': { const e = entidadDe(m.uid); if (e) e.viva = false; break; }
      case 'entHit': { const e = entidadDe(m.uid); if (e) e._hitT = performance.now(); break; }
      case 'entRevela': {
        const e = entidadDe(m.uid);
        if (!e) return;
        e.revelada = true;
        if (cerca(w, e.x, e.y, 10)) w.log(`Esa figura no era humana. ¡${e.def.nombre}!`, 'danger');
        break;
      }
      case 'aviso2': w.log(m.txt, 'danger'); break;

      // ---------- estado propio ----------
      case 'salud':
        w.player.salud = m.valor;
        w.ui.updateHUD();
        break;
      case 'inv':
        w.player.inv = m.inv;
        w.player.manos = m.manos;
        if (m.equipo) w.player.equipo = m.equipo;
        w.ui.updateHUD();
        if (document.getElementById('backpack-panel').style.display !== 'none')
          w.ui.toggleBackpack(true); // repintar el panel abierto
        break;
      case 'itemSuelto': {
        w.map.items[m.idx] = { x: m.x, y: m.y, id: m.id, taken: false };
        w.itemsVersion = (w.itemsVersion || 0) + 1;
        break;
      }
      case 'muere':
        if (m.id === miId) {
          w.log(`La oscuridad te traga (${m.causa}).`, 'danger');
          if (window.Effects) Effects.doShake(9, 400);
          if (window.Sfx) Sfx.play('muerte');
        } else {
          const p = posDe(m.id);
          if (p && cerca(w, p[0], p[1], 12)) w.log(`${nombreDe(m.id)} cae al suelo…`, 'danger');
        }
        break;

      // ---------- objetos y salidas ----------
      case 'itemCogido': {
        const it = w.map.items[m.idx];
        if (it) it.taken = true;
        w.itemsVersion = (w.itemsVersion || 0) + 1;
        if (m.por === miId) {
          const def = w.data.objects[m.id];
          w.log(`Recoges: ${def ? def.nombre : m.id}.`, 'good');
          if (window.Sfx) Sfx.play('recoger');
        }
        break;
      }
      case 'dado': {
        const p = posDe(m.id);
        if (p && window.Effects)
          Effects.number(p[0], p[1], `d20 → ${m.valor}`, m.exito ? '#a8d8a0' : '#e88a7a');
        if (window.Sfx && p && cerca(w, p[0], p[1], 12)) Sfx.play('dado');
        break;
      }
      case 'canal': {
        const p = posDe(m.id);
        if (p && window.Effects) Effects.number(p[0], p[1], '*GOLPES*', '#e8c95a');
        if (window.Sfx && p && cerca(w, p[0], p[1], 12)) Sfx.play('golpe');
        break;
      }
      case 'canalFin': break;
      case 'abierto': {
        const ex = w.map.exits[m.i];
        if (!ex) return;
        ex.def._abierta = true;
        w.mapaVersion = (w.mapaVersion || 0) + 1; // el render reconstruye el hueco
        if (cerca(w, ex.x, ex.y, 14)) {
          w.log('Algo se DERRUMBA: un camino nuevo queda abierto.', 'good');
          if (window.Sfx) Sfx.play('derrumbe');
          if (window.Effects) Effects.doShake(5, 220);
        }
        break;
      }
      case 'oferta':
        w.ui.showChoice('Una salida', `${m.texto}.`, [
          { label: 'CRUZAR', cb: () => enviar({ t: 'cruzar', si: true }) },
          { label: 'Aún no', cb: () => enviar({ t: 'cruzar', si: false }) },
        ]);
        break;

      // ---------- escondites y luz ----------
      case 'esconde':
        if (m.id === miId) {
          w.escondido = m.si ? { delatado: false } : null;
          if (m.si) w.log('Te metes dentro. Contén la respiración.', 'good');
        } else Otros.esconde(m.id, m.si);
        break;
      case 'luzDe': // v23: la linterna es autoritativa — también la TUYA
        if (m.id === miId) {
          w.player.luz = m.si;
          if (window.Sfx) Sfx.play('ui');
        } else Otros.luz(m.id, m.si);
        break;
      case 'registrado': { // un contenedor de la sala queda registrado
        const pr = (w.map.props || [])[m.i];
        if (!pr) return;
        pr.registrado = true;
        if (cerca(w, pr.x, pr.y, 10) && window.Sfx) Sfx.play('registrar');
        break;
      }
      case 'admin': // respuesta a la contraseña de guardián (Ajustes)
        w.esAdmin = !!m.si;
        if (window.onAdminCambia) window.onAdminCambia(w.esAdmin);
        break;

      case 'caminata': {
        w.pasosNivel = m.pasos;
        w._caminataObjetivo = m.objetivo; // alimenta el fundido gris del render y el zumbido
        const f = m.pasos / Math.max(1, m.objetivo);
        const A = w._caminataAvisos || (w._caminataAvisos = {});
        const avisa = (key, limite, texto) => {
          if (f >= limite && !A[key]) {
            A[key] = true;
            if (window.Effects) Effects.bubble(w.player.x, w.player.y, texto, w.player);
          }
        };
        avisa('lejos1', 0.3, 'He perdido por completo el punto de partida.');
        avisa('lejos2', 0.65, 'El zumbido ya no suena igual… llevo demasiado caminando.');
        avisa('lejos3', 0.82, 'El amarillo se apaga. Bajo la moqueta asoma hormigón.');
        avisa('lejos4', 0.94, 'Hay columnas al final del pasillo. Ya no distingo dónde cambia el nivel.');
        break;
      }
      case 'anuncio':
        w.log(`📢 ${m.txt}`, 'danger');
        if (window.Effects) Effects.bubble(w.player.x, w.player.y, `📢 ${m.txt}`, w.player);
        break;

      // ---------- remodelación no euclidiana: el nivel cambia PARA TODOS ----------
      case 'remodel': {
        const g = w.map.grid;
        for (let y = 0; y < m.ch; y++)
          for (let x = 0; x < m.ch; x++) {
            g.t[(m.y + y) * g.w + (m.x + x)] = m.tiles[y * m.ch + x];
            w.explored[(m.y + y) * g.w + (m.x + x)] = 0; // la memoria de la zona se borra
          }
        w.mapaVersion = (w.mapaVersion || 0) + 1; // el render 3D reconstruye
        fov(w);
        w.log(w.level.id === 'level-0'
          ? 'El zumbido cambia de tono. En algún lugar, un pasillo ya no conduce al mismo sitio.'
          : 'Un crujido lejano recorre el nivel: las Backrooms se reorganizan.', 'danger');
        if (window.Sfx) Sfx.play(w.level.id === 'level-0' ? 'crujido' : 'derrumbe');
        break;
      }

      case 'aviso': w.log(m.txt, 'event'); break;
      case 'error': w.log(m.txt, 'danger'); break;
    }
  }

  function cerca(w, x, y, r) {
    return Math.abs(x - w.player.x) + Math.abs(y - w.player.y) <= r;
  }

  // Construye el estado local de una sala: mapa desde la semilla + estado
  // dinámico que la semilla no puede saber (entidades, objetos cogidos,
  // grietas ya abiertas, censo de jugadores).
  function construirNivel(m, w) {
    const def = w.data.levels[m.nivel];
    w.online = true;
    w.level = def;
    // MISMA transformación que hace el servidor (sim/mundo.js→defParaOnline):
    // online las salidas aparecen siempre — el campo `prob` era del modo solo
    const defOnline = {
      ...def,
      salidas: (def.salidas || []).map((s) => { const c = { ...s }; delete c.prob; return c; }),
    };
    w.map = MapGen.generate(defOnline, RNG.create(m.semilla));
    w.tiles = Tiles.build(def, RNG.create(m.semilla + '::tiles'));
    w.map.caminatas = []; // la caminata online (M3) es personal
    // puerta personal de RETORNO (v23): solo existe en TU cliente — el
    // servidor la vigila con el índice especial 'R'
    if (m.retorno) {
      w.map.exits.push({
        x: m.retorno.x, y: m.retorno.y,
        def: {
          texto: 'El camino por el que llegaste sigue abierto.',
          destino: m.retorno.destino, tipo: 'retorno',
        },
      });
    }
    for (const i of m.itemsTomados || []) if (w.map.items[i]) w.map.items[i].taken = true;
    for (const i of m.abiertas || []) if (w.map.exits[i]) w.map.exits[i].def._abierta = true;
    w.entities = (m.ents || []).map((e) => ({
      uid: e.uid, id: e.id, def: w.data.entities[e.id],
      x: e.x, y: e.y, rx: e.x, ry: e.y,
      viva: e.viva, revelada: e.revelada,
      preparando: false, paralizada: 0, huyendo: 0, vida: 1,
    }));
    w.player.x = m.x; w.player.y = m.y;
    w.player.rx = m.x; w.player.ry = m.y;
    w.player.rot = m.rot ?? 2;
    w.player.salud = m.salud ?? 100;
    w.player.inv = m.inv || [];
    w.player.manos = m.manos || [null, null];
    w.pasosNivel = m.caminata ? m.caminata.pasos : 0;
    w._caminataObjetivo = m.caminata ? m.caminata.objetivo : 0;
    w._caminataAvisos = {};
    w.escondido = null;
    w._ignoraExit = null;
    // el códice local del navegador sigue coleccionando niveles transitados
    try { Game.Profiles.registrarEntrada(m.nivel); } catch (e) {}
    w.itemsVersion = (w.itemsVersion || 0) + 1;
    w.mapaVersion = (w.mapaVersion || 0) + 1;
    historia.length = 0;
    // el servidor frena tu input al cambiar de sala: el cliente refleja lo mismo
    input.dx = 0; input.dy = 0;
    inputEnviado = { dx: 0, dy: 0 };
    const g = w.map.grid;
    w.explored = new Uint8Array(g.w * g.h);
    w.light = new Float32Array(g.w * g.h);
    fov(w);
    Otros.reset(miId);
    for (const j of m.jugadores) Otros.entra(j);
    listo = true;
  }

  function fov(w) {
    const g = w.map.grid;
    // FOV.compute indexa arrays por tile: SIEMPRE coordenadas enteras (v22:
    // la posición es flotante — un índice fraccionario se escribe en el vacío)
    w.light = FOV.compute(g, Fisica.tileDe(w.player.x), Fisica.tileDe(w.player.y), w.visionActual());
    for (let i = 0; i < w.light.length; i++) if (w.light[i] > 0) w.explored[i] = 1;
  }

  // ---------- movimiento libre (v22): input vectorial + predicción local ----------
  function setInput(dx, dy) {
    input.dx = Math.max(-1, Math.min(1, dx || 0));
    input.dy = Math.max(-1, Math.min(1, dy || 0));
    // se envía solo al CAMBIAR (el servidor mantiene el último estado)
    if (Math.abs(input.dx - inputEnviado.dx) > 0.01 || Math.abs(input.dy - inputEnviado.dy) > 0.01) {
      inputEnviado = { dx: input.dx, dy: input.dy };
      enviar({ t: 'input', dx: input.dx, dy: input.dy });
    }
  }

  function setRot(th) {
    const w = Game.world;
    w.player.rot = th;
    const ahora = performance.now();
    if (Math.abs(th - rotEnviada) > 0.03 && ahora - rotUltEnvio > 80) {
      rotEnviada = th; rotUltEnvio = ahora;
      enviar({ t: 'rot', th: Math.round(th * 100) / 100 });
    }
  }

  // predicción: el cliente integra su propio movimiento con LA MISMA física
  // que el servidor — la reconciliación casi nunca tiene que corregir
  function frame(dt) {
    const w = Game.world;
    if (!listo) return;
    if (!w.escondido && (input.dx || input.dy)) {
      const [nx, ny] = Fisica.mover(w.map.grid, w.player.x, w.player.y, input.dx, input.dy, dt, Fisica.VEL_JUGADOR);
      w.player.x = nx; w.player.y = ny;
      const tx = Fisica.tileDe(nx), ty = Fisica.tileDe(ny);
      if (!tileFov || tileFov[0] !== tx || tileFov[1] !== ty) {
        tileFov = [tx, ty];
        fov(w);
      }
    }
    // historial para la reconciliación (también parado: el tiempo sigue)
    const ahora = performance.now();
    historia.push({ t: ahora, x: w.player.x, y: w.player.y });
    while (historia.length && historia[0].t < ahora - 1200) historia.shift();
  }

  // Posición autoritativa propia (v23): se compara contra DÓNDE ESTABAS hace
  // ~RTT/2+medio tick — comparar contra el presente convertía la latencia en
  // tirones de goma hacia atrás cada tick mientras corrías (los «lagazos»).
  function reconciliar(w, sx, sy) {
    const objetivo = performance.now() - (rtt / 2 + 60);
    let ref = null;
    for (let i = historia.length - 1; i >= 0; i--) {
      if (historia[i].t <= objetivo) { ref = historia[i]; break; }
    }
    if (!ref) ref = historia[0] || { x: w.player.x, y: w.player.y };
    const ex = sx - ref.x, ey = sy - ref.y;
    const d = Math.hypot(ex, ey);
    if (d < 0.06) return; // dentro del margen: la predicción va bien
    if (d > 1.4) {
      // desincronización real (empujón, colisión que no vimos): snap limpio
      w.player.x = sx; w.player.y = sy;
      historia.length = 0;
      fov(w);
      return;
    }
    // corrección suave: se APLICA EL ERROR (no se tira hacia la pos vieja)
    const nx = w.player.x + ex * 0.25, ny = w.player.y + ey * 0.25;
    if (!Fisica.choca(w.map.grid, nx, ny)) { w.player.x = nx; w.player.y = ny; }
  }

  // ---------- acciones ----------
  function accion() { enviar({ t: 'accion' }); }           // ESPACIO
  function usar(mano) { enviar({ t: 'usar', mano }); }     // Q/E
  function mochila(que, datos) { enviar({ t: 'mochila', que, ...datos }); }

  function luzToggle() {
    // solo se PIDE: el servidor decide (linterna en mano) y responde luzDe
    enviar({ t: 'luz', si: !Game.world.player.luz });
  }

  function admin(clave) { enviar({ t: 'admin', clave }); }
  function tp(nivelId) { enviar({ t: 'chat', txt: '/tp ' + nivelId }); }

  // ---------- chat ----------
  function crearChatUI() {
    if (inputChat) return;
    inputChat = document.createElement('input');
    inputChat.id = 'chat-input';
    inputChat.maxLength = 120;
    inputChat.placeholder = 'Di algo… (Enter envía, ESC cierra)';
    inputChat.autocomplete = 'off';
    inputChat.style.cssText =
      'position:fixed;left:50%;bottom:12%;transform:translateX(-50%);width:min(480px,80vw);' +
      'display:none;padding:8px 12px;background:rgba(14,12,9,.94);color:#e8dcae;' +
      'border:1px solid #d8c98a;border-radius:4px;font:18px VT323,monospace;z-index:60;outline:none;';
    document.body.appendChild(inputChat);
    inputChat.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') {
        const txt = inputChat.value.trim();
        if (txt) enviar({ t: 'chat', txt });
        cerrarChat();
      } else if (ev.key === 'Escape') cerrarChat();
    });
  }

  function abrirChat() {
    if (!inputChat) return;
    setInput(0, 0); // escribir no es caminar: frena antes de abrir el teclado
    inputChat.style.display = 'block';
    inputChat.value = '';
    inputChat.focus();
  }

  function cerrarChat() {
    inputChat.value = '';
    inputChat.style.display = 'none';
    inputChat.blur();
  }

  function chatAbierto() {
    return !!inputChat && inputChat.style.display !== 'none';
  }

  window.Net = {
    iniciar, setInput, setRot, frame,
    accion, usar, luzToggle, mochila, admin, tp,
    abrirChat, chatAbierto,
    get activo() { return listo; },
    get id() { return miId; },
    get rtt() { return rtt; },
  };
})();
