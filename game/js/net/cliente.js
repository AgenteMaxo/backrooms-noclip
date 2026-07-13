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
  // v24 — EL MOVIMIENTO ES DEL CLIENTE (el servidor valida): aquí se integra
  // la física local (input vectorial o intención av/giro de 3ª persona) y se
  // REPORTA la posición ~15 veces/s ({t:'p'}). Sin reconciliación: lo que ves
  // es donde estás. El servidor solo interviene si un informe es imposible
  // (velocidad, paredes, teleport) devolviendo 'mueve' con `sec`.
  const input = { dx: 0, dy: 0 };
  const mov = { av: 0, giro: 0 };
  let modoMov = false;   // true si el último gesto fue de intención (3ªP)
  let sec = 0;           // nº de teleport del servidor: los informes viejos caducan
  let repX = 0, repY = 0, repRot = 0, repT = 0; // último informe enviado
  let tileFov = null;    // último tile con FOV calculado
  let rtt = 100;         // ms ida y vuelta (medido con ping/pong; telemetría)
  let pingTimer = null;
  let ultimoError = null; // último rechazo del servidor (lo muestra el título)
  let salaActual = null;
  let pasoAcum = 0;       // distancia andada desde el último sonido de paso
  const r2 = (v) => Math.round(v * 100) / 100;

  // fuerza la recarga real de los scripts (sin caché) y reinicia la página.
  // Guarda de sesión: si tras recargar seguimos con versión vieja, no ciclar.
  function autoActualizar() {
    try {
      if (sessionStorage.getItem('mmo-actualizando')) return false;
      sessionStorage.setItem('mmo-actualizando', '1');
    } catch (e) { return false; }
    const urls = [...document.querySelectorAll('script[src], link[rel=stylesheet]')]
      .map((el) => el.src || el.href).filter(Boolean);
    Promise.allSettled(urls.map((u) => fetch(u, { cache: 'reload' })))
      .then(() => location.reload());
    return true;
  }

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

  function iniciar(nombre, sala) {
    const w = Game.world;
    const params = new URLSearchParams(location.search);
    salaActual = sala || null;
    ultimoError = null;
    ws = new WebSocket(urlServidor());
    ws.onopen = () => enviar({
      t: 'hola', nombre, token: token(), v: 7, // debe coincidir con protocolo.js
      nivel: params.get('nivel') || undefined, // puerta de desarrollo (solo MMO_DEV=1)
      sala: salaActual || undefined,
    });
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      recibir(m, w);
    };
    ws.onclose = (ev) => {
      listo = false;
      clearInterval(pingTimer);
      // rechazo por VERSIÓN: el navegador (o el edge de Cloudflare) sirvió
      // código viejo — refrescar los scripts y recargar, una sola vez
      if (ev && ev.reason === 'version') {
        if (autoActualizar()) return;
        ultimoError = 'El juego se actualizó y tu navegador cargó una versión vieja. Pulsa Ctrl+F5.';
        return; // reintentar con el mismo código viejo no lleva a nada
      }
      if (ev && ev.reason === 'sala') return;
      if (w.level) w.log('Conexión perdida con las Backrooms… reintentando.', 'danger');
      clearTimeout(reintento);
      reintento = setTimeout(() => iniciar(nombre, salaActual), 3000);
    };
    ws.onerror = () => { ultimoError = ultimoError || 'No se pudo conectar con el servidor.'; };
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
        ultimoError = null;
        try { sessionStorage.removeItem('mmo-actualizando'); } catch (e) {}
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
      case 'mueve': // teleports: spawn, respawn, corrección (informe ilegal)
        if (!listo) return;
        if (m.id === miId) {
          w.player.x = m.x; w.player.y = m.y;
          w.player.rx = m.x; w.player.ry = m.y;
          if (m.sec !== undefined) sec = m.sec;
          repX = m.x; repY = m.y; // el próximo informe parte de aquí
          fov(w);
        } else Otros.mueve(m.id, m.x, m.y);
        break;
      case 'pos': // v22: lote de posiciones del tick (jugadores y entidades)
        if (!listo) return;
        for (const [id, x, y, rot] of m.j || []) {
          // v24: la posición propia es NUESTRA — el eco del servidor se ignora
          if (id !== miId) Otros.pos(id, x, y, rot);
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
      case 'estado':
        w.player.salud = m.salud ?? w.player.salud;
        w.player.sed = m.sed ?? w.player.sed;
        w.player.cordura = m.cordura ?? w.player.cordura;
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
      case 'itemSuelto': { // tu objeto tirado/arrojado (mundo de botín individual)
        w.map.items.push({ x: m.x, y: m.y, id: m.id, taken: false, recien: !!m.recien });
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
      case 'botinReset':
        try { localStorage.removeItem('mmo-cajas::' + m.semilla); } catch (e) {}
        break;

      // ---------- objetos y salidas ----------
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
      case 'golpe': {
        const p = posDe(m.id);
        if (p) {
          // Golpe a corta distancia (tubería, etc.)
          if (window.Effects) {
            Effects.flash(m.x, m.y, '#e8c95a');
          }
          if (window.Sfx && cerca(w, m.x, m.y, 12)) Sfx.play('golpe');
        }
        break;
      }
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
      case 'error':
        ultimoError = m.txt; // visible en el título si aún no hay partida
        w.log(m.txt, 'danger');
        break;
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
    for (const i of m.abiertas || []) if (w.map.exits[i]) w.map.exits[i].def._abierta = true;
    // v25: botín INDIVIDUAL — las cajas que TÚ ya registraste en esta sala
    // (persistido en el navegador: reconectar no rellena los muebles)
    w._semillaSala = m.semilla;
    try {
      const hechas = new Set(JSON.parse(localStorage.getItem('mmo-cajas::' + m.semilla) || '[]'));
      for (const pr of w.map.props || [])
        if (pr.contenedor && hechas.has(pr.x + ',' + pr.y)) pr.registrado = true;
      // ...y los objetos del suelo que ya recogiste: la semilla los regenera
      // intactos y sin esto se podían re-farmear cruzando de sala ida y vuelta
      for (const it of w.map.items || [])
        if (hechas.has('suelo:' + it.x + ',' + it.y)) it.taken = true;
    } catch (e) {}
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
    w.player.sed = m.sed ?? 100;
    w.player.cordura = m.cordura ?? 100;
    w.player.inv = m.inv || [];
    w.player.manos = m.manos || [null, null];
    w.player.equipo = m.equipo || { cara: null, cuerpo: null, pies: null };
    w.pasosNivel = m.caminata ? m.caminata.pasos : 0;
    w._caminataObjetivo = m.caminata ? m.caminata.objetivo : 0;
    w._caminataAvisos = {};
    w.escondido = null;
    w._ignoraExit = null;
    // el códice local del navegador sigue coleccionando niveles transitados
    try { Game.Profiles.registrarEntrada(m.nivel); } catch (e) {}
    w.itemsVersion = (w.itemsVersion || 0) + 1;
    w.mapaVersion = (w.mapaVersion || 0) + 1;
    // cambio de sala = teleport: sec nuevo y el próximo informe parte de aquí
    sec = m.sec ?? 0;
    repX = m.x; repY = m.y; repRot = m.rot ?? 0; repT = 0;
    input.dx = 0; input.dy = 0;
    mov.av = 0; mov.giro = 0;
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

  // ---------- movimiento (v24): TODO local — solo se reporta la posición ----------
  function setInput(dx, dy) {
    modoMov = false;
    input.dx = Math.max(-1, Math.min(1, dx || 0));
    input.dy = Math.max(-1, Math.min(1, dy || 0));
  }

  // 3ª persona: intención local (avance ±1, giro ±1); frame() integra el rumbo
  function setMov(av, giro) {
    modoMov = true;
    mov.av = Math.sign(av || 0);
    mov.giro = Math.sign(giro || 0);
    input.dx = 0; input.dy = 0;
  }

  function setRot(th) {
    Game.world.player.rot = th; // viaja con el próximo informe de posición
  }

  // física LOCAL (la compartida de sim/fisica.js) + informe {t:'p'} ~15/s.
  // Lo que ves es donde estás: sin reconciliación, sin saltos. El servidor
  // valida cada informe (velocidad/paredes/teleport) y solo responde 'mueve'
  // si es imposible — p. ej. un cliente trucado.
  function informarPosicion(w, forzar) {
    const ahora = performance.now();
    const dMov = Math.abs(w.player.x - repX) + Math.abs(w.player.y - repY);
    const dRot = Math.abs(Fisica.normAng((w.player.rot || 0) - repRot));
    if ((dMov > 0.03 || dRot > 0.05) && (forzar || ahora - repT > 60) && !w.escondido) {
      repX = w.player.x; repY = w.player.y; repRot = w.player.rot || 0; repT = ahora;
      enviar({ t: 'p', x: r2(repX), y: r2(repY), rot: r2(repRot), sec });
    }
  }

  function integrarPaso(w, dt) {
    let idx = input.dx, idy = input.dy;
    if (modoMov) {
      if (mov.giro) {
        w.player.rot = Fisica.normAng((w.player.rot || 0) + mov.giro * Fisica.GIRO_JUGADOR * dt);
      }
      idx = mov.av ? Math.sin(w.player.rot || 0) * mov.av : 0;
      idy = mov.av ? -Math.cos(w.player.rot || 0) * mov.av : 0;
    }
    if (!w.escondido && (idx || idy)) {
      const [nx, ny] = Fisica.mover(w.map.grid, w.player.x, w.player.y, idx, idy, dt, Fisica.VEL_JUGADOR);
      const distancia = Fisica.dist(w.player.x, w.player.y, nx, ny);
      w.player.x = nx; w.player.y = ny;
      return distancia;
    }
    return 0;
  }

  function frame(dt) {
    const w = Game.world;
    if (!listo) return;
    // Tras un microparón, conservar la trayectoria REAL (incluidas curvas junto
    // a paredes) y reportarla en tramos cortos. El servidor acumula el presupuesto
    // de velocidad de esos 0.6 s, pero mantiene el anti-teleport por informe.
    const trocear = dt > 0.1;
    let restante = dt;
    let distancia = 0;
    do {
      const paso = Math.min(0.1, restante);
      distancia += integrarPaso(w, paso);
      if (trocear) informarPosicion(w, true);
      restante -= paso;
    } while (restante > 0.0001);
    if (distancia) {
      // pasos y botín conservan una sola evaluación por frame, aun si el
      // movimiento tuvo que trocearse para informar el rastro al servidor
      pasoAcum += distancia;
      // umbral ~ media zancada real a VEL_JUGADOR (antes 0.75 daba ~6 pasos/s,
      // sonaba a metralleta y no guardaba ritmo con el avance del personaje)
      if (pasoAcum > 1.6) {
        pasoAcum = 0;
        if (window.Sfx) Sfx.play('paso', w.level?.estilo?.suelo);
      }
      recogerSuelo(w); // botín del suelo: proximidad local
    }
    const tx = Fisica.tileDe(w.player.x), ty = Fisica.tileDe(w.player.y);
    if (!tileFov || tileFov[0] !== tx || tileFov[1] !== ty) {
      tileFov = [tx, ty];
      fov(w);
    }
    // informe de posición: al moverte/girar (mín. 60 ms entre informes) — los
    // tramos cortos mantienen legal el chequeo de paredes del servidor
    if (!trocear) informarPosicion(w, false);
  }

  // ---------- botín INDIVIDUAL (v25): cajas, dado y suelo en TU navegador ----------
  function poolCajas(w) {
    const basicos = ['agua_almendras', 'agua_almendras', 'botiquin', 'linterna', 'tuberia', 'trebol'];
    return basicos.concat(Object.keys(w.data.objects).filter((id) => !basicos.includes(id)));
  }

  // persiste el botín ya resuelto de esta sala: cajas ('x,y') y suelo ('suelo:x,y')
  function guardarLoot(w, clave) {
    try {
      const k = 'mmo-cajas::' + (w._semillaSala || '');
      const lista = JSON.parse(localStorage.getItem(k) || '[]');
      lista.push(clave);
      localStorage.setItem(k, JSON.stringify(lista.slice(-400)));
    } catch (e) {}
  }

  // El alta de botín tiene cadencia en el server (sala.loot descarta EN
  // SILENCIO a <1.2 s del anterior): los envíos se espacian aquí para que un
  // objeto ya consumido en este lado no se pierda por llegar demasiado seguido.
  // 1.3 s da margen al jitter de red; lootPend cuenta los aún no enviados
  // (ocupan hueco de mochila mientras viajan).
  let lootT = 0, lootPend = 0;
  function enviarLoot(id) {
    const cuando = Math.max(Date.now(), lootT + 1300);
    lootT = cuando;
    const espera = cuando - Date.now();
    if (espera <= 0) { enviar({ t: 'loot', id }); return; }
    lootPend++;
    setTimeout(() => { lootPend--; enviar({ t: 'loot', id }); }, espera);
  }

  // ESPACIO sobre un contenedor sin registrar: TODO local (dado, botín,
  // sonido); al servidor solo viaja el alta del objeto encontrado
  function registrarLocal(w) {
    const pr = (w.map.props || []).find((p) => p.contenedor && !p.registrado &&
      Fisica.dist(p.x, p.y, w.player.x, w.player.y) <= 1.2);
    if (!pr) return false;
    pr.registrado = true;
    guardarLoot(w, pr.x + ',' + pr.y);
    if (window.Sfx) Sfx.play('registrar');
    w.rollDice('Registras el contenedor…', (d) => {
      if (d >= 14) {
        const pool = poolCajas(w);
        const id = pool[Math.min(pool.length - 1,
          Math.floor((d - 14) / 7 * pool.length + Math.floor(Math.random() * 3)))];
        if ((w.player.inv || []).length + lootPend >= 6) {
          w.log(`Dado: ${d}. Hay algo útil… pero no te cabe nada más.`, 'event');
        } else {
          w.log(`Dado: ${d}. Encuentras: ${w.data.objects[id].nombre}.`, 'good');
          try { Game.Profiles.registrarDescubierto('objetos', id); } catch (e) {}
          if (window.Effects) Effects.flash(w.player.x, w.player.y, '#ffe9a0');
          enviarLoot(id); // el server revalida hueco al recibirlo
        }
      } else if (d >= 7) {
        w.log(`Dado: ${d}. Vacío. Solo polvo y papel amarillento.`, 'event');
      } else {
        w.log(`Dado: ${d}. Algo se escurre entre tus dedos. Retrocedes de golpe.`, 'danger');
      }
    });
    return true;
  }

  // objetos del suelo: recogida local por proximidad (cada errante ve y
  // recoge SU copia del mundo — nada de peleas por la tubería)
  let sueloT = 0;
  function recogerSuelo(w) {
    const ahora = performance.now();
    if (ahora - sueloT < 150) return;
    sueloT = ahora;
    for (const it of w.map.items || []) {
      if (it.taken) continue;
      const d = Fisica.dist(it.x, it.y, w.player.x, w.player.y);
      if (it.recien) { if (d > 0.8) it.recien = false; continue; }
      if (d >= 0.5) continue;
      if ((w.player.inv || []).length + lootPend >= 6) continue; // sin hueco: se queda
      it.taken = true;
      guardarLoot(w, 'suelo:' + it.x + ',' + it.y); // que no reaparezca al re-entrar
      w.itemsVersion = (w.itemsVersion || 0) + 1;
      const def = w.data.objects[it.id];
      w.log(`Recoges: ${def ? def.nombre : it.id}.`, 'good');
      try { Game.Profiles.registrarDescubierto('objetos', it.id); } catch (e) {}
      if (window.Sfx) Sfx.play('recoger');
      enviarLoot(it.id);
      break; // uno por escaneo
    }
  }

  // ---------- acciones ----------
  function accion() { // ESPACIO contextual
    const w = Game.world;
    if (!w.escondido && registrarLocal(w)) return; // cajas: asunto tuyo
    enviar({ t: 'accion' });                       // esconderse/romper/salidas: del server
  }
  function usar(mano) { enviar({ t: 'usar', mano }); }     // Q/E
  function mochila(que, datos) { enviar({ t: 'mochila', que, ...datos }); }

  function luzToggle() {
    // solo se PIDE: el servidor decide (linterna en mano) y responde luzDe
    enviar({ t: 'luz', si: !Game.world.player.luz });
  }

  function admin(clave) { enviar({ t: 'admin', clave }); }
  function tp(nivelId) { enviar({ t: 'chat', txt: '/tp ' + nivelId }); }
  function give(itemId) { enviar({ t: 'chat', txt: '/give ' + itemId }); }

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

  // frena cualquier movimiento en curso (chat, blur, modales)
  function parar() {
    if (modoMov) { mov.av = 0; mov.giro = 0; }
    else { input.dx = 0; input.dy = 0; }
  }

  function abrirChat() {
    if (!inputChat) return;
    parar(); // escribir no es caminar: frena antes de abrir el teclado
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
    iniciar, setInput, setMov, setRot, parar, frame,
    accion, usar, luzToggle, mochila, admin, tp, give,
    abrirChat, chatAbierto,
    get activo() { return listo; },
    get id() { return miId; },
    get rtt() { return rtt; },
    get ultimoError() { return ultimoError; },
  };
})();
