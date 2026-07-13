// Sonido v5: ambiente único por nivel (archivo del usuario > audio de la wiki >
// receta sintetizada de la ficha > bioma), efectos, pasos por material, cues de
// entidades y volumen regulable. WebAudio puro, sin dependencias.
(function () {
  let ctx = null, master = null, sfxBus = null, ambBus = null;
  let muted = false, vol = 0.5, volFx = 1, volAmb = 1;
  try {
    muted = localStorage.getItem('backrooms-mute') === '1';
    const v = parseFloat(localStorage.getItem('backrooms-vol'));
    if (!isNaN(v)) vol = Math.max(0, Math.min(1, v));
    const vf = parseFloat(localStorage.getItem('backrooms-volfx'));
    if (!isNaN(vf)) volFx = Math.max(0, Math.min(1, vf));
    const va = parseFloat(localStorage.getItem('backrooms-volamb'));
    if (!isNaN(va)) volAmb = Math.max(0, Math.min(1, va));
  } catch (e) {}
  let ambientStop = null;
  let ambientAudioEl = null;
  let menuAudioEl = null;
  let menuAudioSrc = null;
  let idleStop = null;
  const overrides = {};
  const entityLoops = {};

  const NOMBRES = ['paso', 'golpe', 'dano', 'recoger', 'dado', 'puerta', 'registrar', 'muerte', 'victoria', 'latido', 'ui', 'derrumbe', 'bisturi', 'crujido', 'smiler'];
  const SOUND_DIRS = {
    smiler: ['entidades', 'entities'],
  };
  for (const n of NOMBRES) {
    for (const ext of ['mp3', 'ogg', 'wav']) {
      const rutas = [
        ...(SOUND_DIRS[n] || []).map((dir) => `assets/sounds/${dir}/${n}.${ext}`),
        `assets/sounds/${n}.${ext}`,
      ];
      for (const ruta of rutas) {
        const el = new window.Audio();
        el.addEventListener('canplaythrough', () => { if (!overrides[n]) overrides[n] = el; }, { once: true });
        el.src = ruta;
        el.preload = 'auto';
      }
    }
  }

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : vol;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = volFx;
      sfxBus.connect(master);
      ambBus = ctx.createGain();
      ambBus.gain.value = volAmb;
      ambBus.connect(master);
      return true;
    } catch (e) { return false; }
  }

  function unlock() {
    try {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {}
  }

  // ---------- bloques de síntesis ----------
  function noiseBuffer(dur) {
    const b = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * dur), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function ruido(dur, freq, gain, type = 'lowpass', slideTo) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(f).connect(g).connect(sfxBus);
    src.start();
  }

  function tono(freq, dur, gain, type = 'sine', slideTo) {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(sfxBus);
    o.start(); o.stop(ctx.currentTime + dur + 0.05);
  }

  // variación aleatoria de tono para que los pasos no suenen a metralleta
  const vp = () => 0.88 + Math.random() * 0.26;

  // ---------- efectos ----------
  // v13: UNA sola capa por paso, sutil. La variación viene del pitch aleatorio
  // y de un 20% de pasos ligeramente distintos (crujido/chapoteo integrado).
  const PASOS = {
    moqueta: () => ruido(0.09, 520 * vp(), 0.2),
    moqueta_humeda: () => ruido(0.09, (Math.random() < 0.2 ? 850 : 560) * vp(), 0.2, 'bandpass'),
    hormigon: () => ruido(0.07, 1400 * vp(), 0.22, 'bandpass'),
    baldosa: () => ruido(0.06, 2000 * vp(), 0.22, 'bandpass'),
    baldosa_oscura: () => ruido(0.06, 2000 * vp(), 0.22, 'bandpass'),
    piedra: () => ruido(0.07, 1600 * vp(), 0.22, 'bandpass'),
    adoquin: () => ruido(0.07, 1500 * vp(), 0.22, 'bandpass'),
    tablones: () => Math.random() < 0.2
      ? tono(110 * vp(), 0.16, 0.12, 'triangle', 85)
      : ruido(0.08, 800 * vp(), 0.22),
    tablones_claros: () => Math.random() < 0.2
      ? tono(110 * vp(), 0.16, 0.12, 'triangle', 85)
      : ruido(0.08, 800 * vp(), 0.22),
    moqueta_cenefa: () => ruido(0.09, 520 * vp(), 0.2),
    rejilla: () => ruido(0.06, 2400 * vp(), 0.2, 'bandpass'),
    panel: () => ruido(0.07, 1800 * vp(), 0.2, 'bandpass'),
    nieve: () => ruido(0.13, 340 * vp(), 0.26),
    tierra: () => ruido(0.09, 600 * vp(), 0.2),
    hierba: () => ruido(0.1, 500 * vp(), 0.2),
    negro: () => ruido(0.09, 400 * vp(), 0.16),
    blanco: () => ruido(0.06, 2200 * vp(), 0.2, 'bandpass'),
  };

  let pasoAlt = false;
  const SYNTH = {
    paso(material) {
      pasoAlt = !pasoAlt;
      (PASOS[material] ?? PASOS.moqueta)();
    },
    golpe() { tono(90, 0.18, 0.5, 'triangle', 45); ruido(0.16, 1600, 0.28, 'bandpass'); },
    dano() { tono(160, 0.22, 0.32, 'sawtooth', 70); },
    recoger() { tono(660, 0.09, 0.2, 'sine'); setTimeout(() => ctx && tono(990, 0.12, 0.18), 70); },
    dado() {
      for (let i = 0; i < 6; i++)
        setTimeout(() => ctx && ruido(0.05, 2500 + Math.random() * 1500, 0.12, 'bandpass'), i * 110 + Math.random() * 40);
    },
    puerta() { ruido(0.4, 320, 0.36, 'lowpass', 90); tono(70, 0.35, 0.32, 'sine', 45); setTimeout(() => ctx && ruido(0.1, 1800, 0.1, 'bandpass'), 300); },
    registrar() { ruido(0.32, 1800, 0.26, 'bandpass', 500); tono(210, 0.14, 0.18, 'square', 190); },
    crujido() { // versión suave: la expansión del nivel infinito
      tono(46, 0.7, 0.22, 'sine', 30);
      for (let i = 0; i < 3; i++)
        setTimeout(() => ctx && ruido(0.1, 700 + Math.random() * 400, 0.1, 'bandpass', 200), 80 + i * 140);
    },
    derrumbe() {
      // retumbo profundo + crujidos de roca en cascada
      tono(38, 1.4, 0.55, 'sine', 23);
      ruido(1.2, 170, 0.32, 'lowpass', 55);
      for (let i = 0; i < 5; i++)
        setTimeout(() => ctx && ruido(0.13, 650 + Math.random() * 600, 0.2, 'bandpass', 180),
          120 + i * 170 + Math.random() * 90);
    },
    bisturi() {
      ruido(0.32, 3800, 0.16, 'bandpass', 900);                       // silbido de hoja
      setTimeout(() => ctx && tono(2400, 0.12, 0.14, 'sine', 2100), 300); // tintineo
    },
    muerte() { tono(220, 1.4, 0.4, 'sawtooth', 40); ruido(1.2, 500, 0.2, 'lowpass', 60); },
    victoria() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => ctx && tono(f, 0.5, 0.2), i * 160)); },
    latido() { tono(55, 0.12, 0.5, 'sine', 40); setTimeout(() => ctx && tono(50, 0.14, 0.4, 'sine', 38), 180); },
    ui() { tono(440, 0.05, 0.06, 'sine'); },
  };

  // cues cuando una entidad te detecta (canon de cada criatura)
  const CUES = {
    hound() { tono(140, 0.4, 0.25, 'sawtooth', 70); ruido(0.4, 700, 0.14, 'bandpass', 300); },
    smiler() { ruido(0.8, 5000, 0.09, 'highpass', 2000); },              // siseo susurrado
    aranea() { tono(480, 0.07, 0.22, 'square'); setTimeout(() => ctx && tono(390, 0.07, 0.2, 'square'), 110); }, // clank metálico
    hunter() { tono(60, 0.3, 0.4, 'sine', 42); setTimeout(() => ctx && tono(58, 0.3, 0.4, 'sine', 40), 380); },  // pasos graves
    anethika() { ruido(0.5, 900, 0.16, 'bandpass', 200); },
    duller() { tono(90, 0.7, 0.18, 'sine', 60); },
    generico() { ruido(0.4, 2500, 0.1, 'highpass'); },
  };
  function cue(glyph) {
    try {
      if (muted || !ctx) return;
      if (overrides[glyph]) { play(glyph); return; }
      (CUES[glyph] ?? CUES.generico)();
    } catch (e) {}
  }

  function cueDist(glyph, distancia, radio = 8) {
    try {
      if (muted || !ctx) return;
      const k = Math.max(0, Math.min(1, 1 - distancia / radio));
      if (k <= 0) return;
      const ov = overrides[glyph];
      if (ov) {
        const el = ov.cloneNode();
        el.volume = Math.min(1, vol * volFx * (0.08 + k * k * 0.92));
        el.play().catch(() => {});
        return;
      }
      const old = sfxBus.gain.value;
      sfxBus.gain.value = old * (0.15 + k * 0.85);
      (CUES[glyph] ?? CUES.generico)();
      setTimeout(() => { if (sfxBus) sfxBus.gain.value = old; }, 120);
    } catch (e) {}
  }

  function entityLoop(glyph, distancia, radio = 8) {
    try {
      const k = Math.max(0, Math.min(1, 1 - distancia / radio));
      const objetivo = muted ? 0 : Math.min(1, vol * volFx * (k * k));
      const loop = entityLoops[glyph] || (entityLoops[glyph] = { el: null, vol: 0, last: 0 });
      loop.last = performance.now();
      const ov = overrides[glyph];
      if (!ov) {
        if (k > 0.12 && ctx) cueDist(glyph, distancia, radio);
        return;
      }
      if (!loop.el || loop.el.src !== ov.src) {
        if (loop.el) { loop.el.pause(); loop.el.src = ''; }
        loop.el = ov.cloneNode();
        loop.el.loop = true;
        loop.el.volume = 0;
      }
      loop.vol = loop.vol * 0.86 + objetivo * 0.14;
      loop.el.volume = Math.max(0, Math.min(1, loop.vol));
      if (loop.vol > 0.01 && loop.el.paused) loop.el.play().catch(() => {});
      if (loop.vol <= 0.003 && !loop.el.paused) loop.el.pause();
    } catch (e) {}
  }

  function updateEntityLoops() {
    const now = performance.now();
    for (const loop of Object.values(entityLoops)) {
      if (!loop.el) continue;
      if (now - loop.last < 180) continue;
      loop.vol *= 0.86;
      loop.el.volume = Math.max(0, Math.min(1, loop.vol));
      if (loop.vol <= 0.003 && !loop.el.paused) loop.el.pause();
    }
  }

  function play(nombre, arg) {
    try {
      if (muted) return;
      const ov = overrides[nombre];
      if (ov) { const el = ov.cloneNode(); el.volume = Math.min(1, vol * volFx); el.play().catch(() => {}); return; }
      if (!ctx) return;
      SYNTH[nombre]?.(arg);
    } catch (e) {}
  }

  // El mismo evento que apaga visualmente los fluorescentes produce el golpe
  // seco del balasto. Se mantiene corto y sin frecuencias de alarma/estrobo.
  function level0Flicker() {
    try {
      if (!ctx || muted) return;
      ruido(0.055, 2800, 0.055, 'bandpass', 900);
      setTimeout(() => ctx && !muted && tono(92, 0.08, 0.035, 'square', 76), 65);
    } catch (e) {}
  }

  function level0Distant() {
    try {
      if (!ctx || muted) return;
      tono(43 + Math.random() * 8, 0.65, 0.045, 'sine', 34);
      setTimeout(() => ctx && !muted && ruido(0.18, 240, 0.035, 'lowpass', 75), 210 + Math.random() * 180);
    } catch (e) {}
  }

  // ---------- recetas de ambiente por nivel ----------
  // cada receta devuelve nodos; el gain común hace fade in/out
  const RECETAS = {
    // EL zumbido clásico de las Backrooms: senos suaves 120/240/100 Hz con
    // batido lento, respiración de amplitud y soplo agudo mínimo. Sin asperezas.
    hum_clasico(g, nodes) {
      const hum = ctx.createGain();
      hum.gain.value = 1;
      hum.connect(g);
      const osciladores = [];
      for (const [f, v] of [[120, 0.42], [240, 0.14], [100, 0.16], [360, 0.04]]) {
        const o = ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = f + (Math.random() - 0.5) * 0.6; // batido
        const og = ctx.createGain(); og.gain.value = v;
        o.connect(og).connect(hum); o.start();
        nodes.push(o);
        osciladores.push([o, f]);
      }
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.16;       // respiración
      const lg = ctx.createGain(); lg.gain.value = 0.055;
      lfo.connect(lg).connect(g.gain); lfo.start();
      nodes.push(lfo);
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(2); n.loop = true;
      const nf = ctx.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 7500;
      const ng = ctx.createGain(); ng.gain.value = 0.012;
      n.connect(nf).connect(ng).connect(hum); n.start();
      nodes.push(n);
      // El zumbido se deteriora con el viaje: se desafina, respira peor y a
      // veces desaparece. El silencio crea contraste; no se limita a subir volumen.
      const flick = setInterval(() => {
        if (!ctx || muted) return;
        const w = window.Game?.world;
        const progreso = w?.level?.id === 'level-0' && w._caminataObjetivo
          ? Math.max(0, Math.min(1, w.pasosNivel / w._caminataObjetivo)) : 0;
        osciladores.forEach(([o, base], i) => {
          const desvio = (i % 2 ? -1 : 1) * progreso * (0.004 + i * 0.0015);
          o.frequency.setTargetAtTime(base * (1 + desvio), ctx.currentTime, 1.2);
        });
        if (Math.random() < 0.18 + progreso * 0.42) {
          const ahora = ctx.currentTime;
          const silencio = progreso > 0.72 && Math.random() < 0.45;
          hum.gain.cancelScheduledValues(ahora);
          hum.gain.setValueAtTime(Math.max(0.001, hum.gain.value), ahora);
          hum.gain.exponentialRampToValueAtTime(silencio ? 0.015 : 0.28, ahora + 0.035);
          hum.gain.exponentialRampToValueAtTime(1, ahora + (silencio ? 0.9 : 0.28));
          level0Flicker();
        }
        if (progreso > 0.25 && Math.random() < 0.12 + progreso * 0.16) level0Distant();
      }, 4000);
      nodes.push({ stop: () => clearInterval(flick) });
    },
    hum_suave(g, nodes) {
      for (const [f, v] of [[120, 0.28], [240, 0.08]]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const og = ctx.createGain(); og.gain.value = v;
        o.connect(og).connect(g); o.start(); nodes.push(o);
      }
    },
    futurista(g, nodes) {
      RECETAS.hum_suave(g, nodes);
      const beep = setInterval(() => {
        if (ctx && !muted && Math.random() < 0.5) tono(1180, 0.09, 0.03, 'sine');
      }, 5200);
      nodes.push({ stop: () => clearInterval(beep) });
    },
    goteo_tuberias(g, nodes) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 66;
      const og = ctx.createGain(); og.gain.value = 0.4;
      o.connect(og).connect(g); o.start(); nodes.push(o);
      const drip = setInterval(() => {
        if (ctx && !muted) tono(900 + Math.random() * 900, 0.07, 0.05, 'sine', 420);
      }, 2400 + Math.random() * 1600);
      nodes.push({ stop: () => clearInterval(drip) });
    },
    maquinas(g, nodes) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 47;
      const og = ctx.createGain(); og.gain.value = 0.12;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
      o.connect(f).connect(og).connect(g); o.start(); nodes.push(o);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.8;
      const lg = ctx.createGain(); lg.gain.value = 0.05;
      lfo.connect(lg).connect(g.gain); lfo.start(); nodes.push(lfo);
    },
    relojes(g, nodes) {
      for (const periodo of [1000, 1130, 870]) {
        const iv = setInterval(() => {
          if (ctx && !muted) ruido(0.03, 3200, 0.05, 'bandpass');
        }, periodo);
        nodes.push({ stop: () => clearInterval(iv) });
      }
    },
    feria(g, nodes) {
      // caja de música lenta y desafinada
      const melodia = [392, 440, 392, 330, 294, 330, 392, 0, 440, 494, 440, 392, 0, 0];
      let i = 0;
      const iv = setInterval(() => {
        if (!ctx || muted) return;
        const f = melodia[i % melodia.length];
        if (f) tono(f * (1 + (Math.random() - 0.5) * 0.012), 0.55, 0.05, 'triangle');
        i++;
      }, 620);
      nodes.push({ stop: () => clearInterval(iv) });
      RECETAS.hum_suave(g, nodes);
    },
    estatica_nave(g, nodes) {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(3); n.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
      const ng = ctx.createGain(); ng.gain.value = 0.35;
      n.connect(f).connect(ng).connect(g); n.start(); nodes.push(n);
      const ping = setInterval(() => {
        if (ctx && !muted && Math.random() < 0.35) tono(660, 1.2, 0.03, 'sine', 640);
      }, 7000);
      nodes.push({ stop: () => clearInterval(ping) });
    },
    susurros(g, nodes) {
      const iv = setInterval(() => {
        if (!ctx || muted || Math.random() > 0.55) return;
        // ráfaga con forma de susurro
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(0.7);
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
        f.frequency.setValueAtTime(1400, ctx.currentTime);
        f.frequency.linearRampToValueAtTime(2600, ctx.currentTime + 0.35);
        f.frequency.linearRampToValueAtTime(1100, ctx.currentTime + 0.7);
        const sg = ctx.createGain();
        sg.gain.setValueAtTime(0.0001, ctx.currentTime);
        sg.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 0.2);
        sg.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
        src.connect(f).connect(sg).connect(ambBus);
        src.start();
      }, 5200);
      nodes.push({ stop: () => clearInterval(iv) });
      RECETAS.silencio_sub(g, nodes);
    },
    viento(g, nodes) {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(3); n.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.6;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
      const lg = ctx.createGain(); lg.gain.value = 220;
      lfo.connect(lg).connect(f.frequency); lfo.start();
      const ng = ctx.createGain(); ng.gain.value = 0.6;
      n.connect(f).connect(ng).connect(g); n.start();
      nodes.push(n, lfo);
    },
    viento_nieve(g, nodes) {
      RECETAS.viento(g, nodes);
      const camp = setInterval(() => {
        if (ctx && !muted && Math.random() < 0.3) tono(1560, 1.8, 0.02, 'sine');
      }, 9000);
      nodes.push({ stop: () => clearInterval(camp) });
    },
    silencio_sub(g, nodes) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 42;
      const og = ctx.createGain(); og.gain.value = 0.3;
      o.connect(og).connect(g); o.start(); nodes.push(o);
    },
    invernadero(g, nodes) {
      RECETAS.viento(g, nodes);
      const tin = setInterval(() => {
        if (ctx && !muted && Math.random() < 0.4) tono(2100 + Math.random() * 600, 0.5, 0.02, 'sine');
      }, 6500);
      nodes.push({ stop: () => clearInterval(tin) });
    },
    oscuridad(g, nodes) {
      RECETAS.silencio_sub(g, nodes);
      const crujido = setInterval(() => {
        if (ctx && !muted && Math.random() < 0.4) ruido(0.2, 250, 0.06, 'lowpass', 90);
      }, 6000);
      nodes.push({ stop: () => clearInterval(crujido) });
    },
    cristales(g, nodes) {
      RECETAS.silencio_sub(g, nodes);
      const tin = setInterval(() => {
        if (ctx && !muted && Math.random() < 0.5) {
          const f = 1800 + Math.random() * 1400;
          tono(f, 1.4, 0.025, 'sine');
          setTimeout(() => ctx && tono(f * 1.5, 1.2, 0.015, 'sine'), 200);
        }
      }, 7000);
      nodes.push({ stop: () => clearInterval(tin) });
    },
    piscina(g, nodes) {
      RECETAS.hum_suave(g, nodes);
      const agua = setInterval(() => {
        if (ctx && !muted) ruido(0.6, 500, 0.045, 'lowpass', 200);
      }, 3200);
      nodes.push({ stop: () => clearInterval(agua) });
    },
    crujidos(g, nodes) {
      RECETAS.silencio_sub(g, nodes);
      const cru = setInterval(() => {
        if (ctx && !muted && Math.random() < 0.5) tono(110, 0.3, 0.05, 'triangle', 70);
      }, 5000);
      nodes.push({ stop: () => clearInterval(cru) });
    },
    ciudad_noche(g, nodes) { RECETAS.viento(g, nodes); },
  };

  const RECETA_BIOMA = {
    pasillos: 'hum_clasico', garaje: 'hum_suave', tuneles: 'goteo_tuberias',
    hospital: 'hum_suave', oficinas: 'hum_suave', exterior: 'viento',
    bosque: 'viento', ciudad: 'ciudad_noche', torres: 'viento', invernadero: 'invernadero',
  };

  function stopAmbient() {
    ambientGen++; // invalida cargas de audio pendientes
    try { ambientStop?.(); } catch (e) {}
    ambientStop = null;
    ambientAudioEl = null;
  }

  // música generativa: acordes lentos sembrados por partida+nivel, con el ánimo
  // acorde al peligro (mayor suave / menor / disonante)
  function padGenerativo(nodes, levelDef) {
    const semilla = ((window.Game?.world?.runSeed) || 'x') + '::' + levelDef.id;
    let h = 0;
    for (const c of semilla) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const azar = () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
    const peligro = levelDef.peligro ?? 2;
    const base = 110 * Math.pow(2, Math.floor(azar() * 3) / 2); // 110-220 Hz
    const escala = peligro <= 1 ? [0, 4, 7, 9, 12]          // mayor cálida
      : peligro >= 4 ? [0, 1, 6, 7, 13]                     // disonante
      : [0, 3, 7, 10, 12];                                  // menor
    const acorde = () => {
      if (!ctx || muted) return;
      const raiz = base * Math.pow(2, escala[Math.floor(azar() * escala.length)] / 12);
      for (const inter of [0, escala[1 + Math.floor(azar() * 2)], 7]) {
        const f = raiz * Math.pow(2, inter / 12);
        const o = ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = f * (1 + (azar() - 0.5) * 0.004);
        const og = ctx.createGain();
        og.gain.setValueAtTime(0.0001, ctx.currentTime);
        og.gain.exponentialRampToValueAtTime(0.055, ctx.currentTime + 2.2);
        og.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 6.5);
        o.connect(og).connect(ambBus);
        o.start(); o.stop(ctx.currentTime + 7);
      }
    };
    acorde();
    const iv = setInterval(acorde, 7500 + azar() * 3000);
    nodes.push({ stop: () => clearInterval(iv) });
  }

  function ambientSynth(levelDef) {
    if (!ctx) return;
    const nodes = [];
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.13, ctx.currentTime + 2);
    g.connect(ambBus);
    const receta = RECETAS[levelDef.sonido] ?? RECETAS[RECETA_BIOMA[levelDef.bioma]] ?? RECETAS.hum_suave;
    receta(g, nodes);
    // En Level 0 la música anticipa demasiado; solo quedan arquitectura y hum.
    if (levelDef.id !== 'level-0') padGenerativo(nodes, levelDef);
    ambientStop = () => {
      try { g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6); } catch (e) {}
      setTimeout(() => nodes.forEach((x) => { try { x.stop(); } catch (e) {} }), 700);
    };
  }

  let ambientGen = 0; // generación: descarta callbacks tardíos (fix acumulación)
  function ambient(levelDef) {
    try {
      stopAmbient();
      if (muted) return;
      const gen = ++ambientGen;
      // 1) archivo del nivel (del usuario o de la wiki): prueba extensiones en cadena
      const candidatos = [];
      const wikiSrc = (window.AUDIO_MANIFEST || {})[levelDef.id];
      if (wikiSrc) candidatos.push(wikiSrc);
      for (const ext of ['mp3', 'wav', 'ogg']) {
        const ruta = `assets/sounds/niveles/${levelDef.id}.${ext}`;
        if (ruta !== wikiSrc) candidatos.push(ruta);
      }
      let i = 0;
      let synthHecho = false;
      const intenta = () => {
        if (gen !== ambientGen) return; // llegó otro ambiente: abortar
        if (i >= candidatos.length) {
          // una sola síntesis por generación (si no, cada rama huérfana
          // arrancaba OTRO ambiente y solo el último era parable)
          if (ctx && !synthHecho) { synthHecho = true; ambientSynth(levelDef); }
          return;
        }
        const el = new window.Audio(candidatos[i++]);
        el.loop = true;
        el.volume = Math.min(1, 0.62 * vol * volAmb);
        // un archivo fallido dispara TANTO el evento 'error' COMO el rechazo de
        // play(): sin este candado la cadena se bifurcaba en dos (acumulación)
        let siguiente = false;
        const next = () => { if (siguiente) return; siguiente = true; intenta(); };
        el.addEventListener('error', next, { once: true });
        el.play().then(() => {
          siguiente = true; // éxito: un error posterior del stream ya no encadena otro
          if (gen !== ambientGen) { el.pause(); el.src = ''; return; } // tardío: descartar
          ambientAudioEl = el;
          ambientStop = () => { el.pause(); el.src = ''; };
        }).catch(next);
      };
      intenta();
    } catch (e) {}
  }

  // latido con cordura baja
  setInterval(() => {
    try {
      const w = window.Game?.world;
      if (!w || !w.player || w.over || muted || !ctx) return;
      if (w.player.cordura < 25 && w.level) SYNTH.latido();
    } catch (e) {}
  }, 1600);

  function setVolume(v, canal = 'general') {
    v = Math.max(0, Math.min(1, v));
    if (canal === 'general') {
      vol = v;
      try { localStorage.setItem('backrooms-vol', String(vol)); } catch (e) {}
      if (master && !muted) master.gain.value = vol;
    } else if (canal === 'fx') {
      volFx = v;
      try { localStorage.setItem('backrooms-volfx', String(volFx)); } catch (e) {}
      if (sfxBus) sfxBus.gain.value = volFx;
    } else if (canal === 'amb') {
      volAmb = v;
      try { localStorage.setItem('backrooms-volamb', String(volAmb)); } catch (e) {}
      if (ambBus) ambBus.gain.value = volAmb;
    }
    if (ambientAudioEl) ambientAudioEl.volume = Math.min(1, 0.62 * vol * volAmb);
    if (menuAudioEl) menuAudioEl.volume = Math.min(1, 0.62 * vol * volAmb);
  }

  // pad suave para la tarjeta entre niveles y pantallas de fin
  function idle(on, tipo = 'neutro') {
    try {
      if (idleStop) { idleStop(); idleStop = null; }
      if (!on || muted || !ctx) return;
      stopAmbient();
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 1.5);
      g.connect(ambBus);
      const acorde = tipo === 'victoria' ? [262, 330, 392, 523]
        : tipo === 'muerte' ? [110, 131, 165]
        : [220, 262, 330];
      const nodes = [];
      for (const f of acorde) {
        for (const det of [-1.2, 1.2]) {
          const o = ctx.createOscillator();
          o.type = 'sine'; o.frequency.value = f + det;
          const og = ctx.createGain(); og.gain.value = 0.5 / acorde.length;
          o.connect(og).connect(g); o.start();
          nodes.push(o);
        }
      }
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
      const lg = ctx.createGain(); lg.gain.value = 0.025;
      lfo.connect(lg).connect(g.gain); lfo.start();
      nodes.push(lfo);
      idleStop = () => {
        try { g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5); } catch (e) {}
        setTimeout(() => nodes.forEach((x) => { try { x.stop(); } catch (e) {} }), 600);
      };
    } catch (e) {}
  }

  function playMenu(src) {
    // Si viene la misma canción y ya está sonando, no reiniciar
    if (menuAudioSrc === src && menuAudioEl) return;
    
    stopMenu();
    menuAudioSrc = src;
    if (!src || muted || !ctx) {
      return;
    }
    try {
      const el = new window.Audio(src);
      el.loop = true;
      el.volume = Math.min(1, 0.62 * vol * volAmb);
      el.play().then(() => {
        menuAudioEl = el;
      }).catch(e => {});
    } catch (e) {}
  }

  function stopMenu() {
    if (menuAudioEl) {
      try {
        menuAudioEl.pause();
        menuAudioEl.src = '';
      } catch (e) {}
      menuAudioEl = null;
    }
    menuAudioSrc = null;
  }

  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem('backrooms-mute', muted ? '1' : '0'); } catch (e) {}
    if (master) master.gain.value = muted ? 0 : vol;
    if (muted) {
      for (const loop of Object.values(entityLoops)) if (loop.el) loop.el.pause();
      stopAmbient();
      if (menuAudioEl) {
        try { menuAudioEl.pause(); } catch (e) {}
        menuAudioEl = null;
      }
    } else {
      if (window.Game?.world?.level) ambient(window.Game.world.level);
      if (menuAudioSrc) playMenu(menuAudioSrc);
    }
    return muted;
  }

  window.Sfx = {
    unlock, play, cue, cueDist, entityLoop, updateEntityLoops, ambient, stopAmbient, toggleMute, setVolume, idle,
    level0Flicker, playMenu, stopMenu,
    get muted() { return muted; },
    get volumen() { return vol; },
    get volumenFx() { return volFx; },
    get volumenAmb() { return volAmb; },
  };
})();
