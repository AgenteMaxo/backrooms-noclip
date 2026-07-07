// Una SALA = una instancia viva de un nivel («level-0::1»). Censo de jugadores,
// entidades simuladas (sim/entidades.js), objetos del suelo, salidas con
// mecánica (romper pared/suelo con canal + dado) y escondites. Los jugadores
// NO se bloquean entre sí; las entidades sí ocupan casilla.
'use strict';

const { DATA, RNG, MapGen, generarMapa, esTransitable } = require('./sim/mundo');
const Entidades = require('./sim/entidades');
const Fisica = require('../game/js/sim/fisica');
const P = require('./protocolo');
const db = require('./db');

let siguienteId = 1;
const ESCONDITES = new Set(['taquilla', 'nevera', 'archivador']);

// vector cardinal más cercano a un ángulo θ (0=N, π/2=E, π=S, 3π/2=O)
function cardinalDe(th) {
  const k = ((Math.round(th / (Math.PI / 2)) % 4) + 4) % 4;
  return [[0, -1], [1, 0], [0, 1], [-1, 0]][k];
}
const r2 = (v) => Math.round(v * 100) / 100;

class Sala {
  constructor(nivelId, inst) {
    this.nivelId = nivelId;
    this.inst = inst;
    this.clave = `${nivelId}::${inst}`;
    // La semilla es el contrato con el cliente: mismo string → mismo mapa.
    this.semilla = `mmo::${nivelId}::${inst}`;
    const { def, map } = generarMapa(nivelId, this.semilla);
    this.def = def;
    this.map = map;
    this.jugadores = new Map();
    this.rng = RNG.create(this.semilla + '::sim'); // dados y azar de la sala
    this.entidades = Entidades.crear(map, DATA.entities, RNG.create(this.semilla + '::ents'));
    this.ruido = null;
    this.alCruzar = null; // lo inyecta server.js (cambio de sala)
    this.alMorir = null;  // ídem (respawn en Level 0)
  }

  get llena() { return this.jugadores.size >= P.CAP_SALA; }

  ocupada(x, y) {
    for (const j of this.jugadores.values())
      if (Fisica.tileDe(j.x) === x && Fisica.tileDe(j.y) === y) return true;
    return false;
  }

  // busca hueco transitable y libre en anillos crecientes alrededor de un
  // punto (por defecto el spawn del mapa; v23: también junto a una puerta)
  buscarSpawn(cx, cy) {
    const [sx, sy] = cx === undefined ? this.map.spawn : [cx, cy];
    for (let r = 0; r < 20; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = sx + dx, y = sy + dy;
          if (esTransitable(this.map, x, y) && !this.ocupada(x, y)) return [x, y];
        }
    return [sx, sy];
  }

  censo() {
    return [...this.jugadores.values()].map((j) => ({
      id: j.id, nombre: j.nombre, x: j.x, y: j.y, rot: j.rot,
      escondido: !!j.escondido,
    }));
  }

  // estado de sala que el cliente no puede derivar de la semilla
  estadoDinamico() {
    return {
      ents: this.entidades.map((e) => ({
        uid: e.uid, id: e.id, x: e.x, y: e.y, viva: e.viva, revelada: e.revelada,
      })),
      itemsTomados: this.map.items.map((it, i) => it.taken ? i : -1).filter((i) => i >= 0),
      abiertas: this.map.exits.map((ex, i) => ex.def._abierta ? i : -1).filter((i) => i >= 0),
    };
  }

  entrar(ws, nombre, token, expediente) {
    const id = siguienteId++;
    const [x, y] = this.buscarSpawn();
    const jug = {
      id, ws, nombre, token, x, y, rot: Math.PI, // θ continuo (π = mirando al sur)
      input: { dx: 0, dy: 0 }, distSala: 0,
      salud: 100, luz: false, escondido: null, muerto: false,
      inv: [], manos: [null, null], equipo: { cara: null, cuerpo: null, pies: null },
      esAdmin: false, muteadoHasta: 0,
      ultMov: 0, ultChat: 0, canal: null, ofertaEn: null,
      retorno: null, // puerta personal de vuelta (v23; la pone cambiarDeSala)
    };
    this.prepararCaminata(jug);
    this.enviar(ws, {
      t: 'bienvenida', id, nivel: this.nivelId, inst: this.inst,
      semilla: this.semilla, x, y, rot: jug.rot,
      salud: jug.salud, inv: jug.inv, manos: jug.manos,
      caminata: jug.caminataObjetivo ? { pasos: 0, objetivo: jug.caminataObjetivo } : null,
      jugadores: this.censo(), ...this.estadoDinamico(),
    });
    this.difundir({ t: 'entra', id, nombre, x, y, rot: jug.rot });
    this.jugadores.set(id, jug);
    return jug;
  }

  // La caminata online es PERSONAL: tus pasos reales en el nivel te van
  // desintonizando hasta que TÚ haces no-clip al destino (el nivel no puede
  // «ceder» para 60 personas a la vez). El objetivo sale de tu token: cada
  // errante recorre su propia distancia.
  prepararCaminata(jug) {
    jug.pasosSala = 0;
    jug.distSala = 0;
    jug.caminataObjetivo = (this.map.caminatas || []).length
      ? MapGen.walkingGoal(this.def, `${jug.token}::${this.clave}`, 1, 0)
      : 0;
  }

  enviarInv(jug) {
    this.enviar(jug.ws, {
      t: 'inv', inv: jug.inv, manos: jug.manos, equipo: jug.equipo,
    });
  }

  salir(jug) {
    if (!this.jugadores.delete(jug.id)) return;
    this.difundir({ t: 'sale', id: jug.id });
  }

  // ---------- movimiento libre (v22): el cliente manda un VECTOR de deseo ----------
  input(jug, dx, dy) {
    if (jug.muerto) return;
    jug.input = { dx, dy };
  }

  // integración de un jugador en el tick: física + consecuencias de la posición
  integrar(jug, dt, movidos) {
    const inp = jug.input;
    if (!inp || (!inp.dx && !inp.dy) || jug.muerto) return;
    if (jug.escondido) this.esconder(jug, false); // moverse te saca del mueble
    const [nx, ny] = Fisica.mover(this.map.grid, jug.x, jug.y, inp.dx, inp.dy, dt, Fisica.VEL_JUGADOR);
    const d = Fisica.dist(jug.x, jug.y, nx, ny);
    if (d < 0.0005) return;
    jug.x = nx; jug.y = ny;
    movidos.push(jug);
    // canal de romper: alejarse del punto de inicio lo interrumpe
    if (jug.canal && Fisica.dist(nx, ny, jug.canal.origen[0], jug.canal.origen[1]) > 0.3)
      this.cancelarCanal(jug, 'Te apartas: dejas lo que estabas haciendo.');
    this.proximidad(jug);
    this.caminataAvanza(jug, d);
  }

  // caminata personal por DISTANCIA recorrida (1 «paso» ≈ 1 tile)
  caminataAvanza(jug, d) {
    if (!jug.caminataObjetivo || jug.muerto) return;
    jug.distSala = (jug.distSala || 0) + d;
    const pasos = Math.floor(jug.distSala);
    if (pasos > (jug.pasosSala || 0)) {
      jug.pasosSala = pasos;
      if (pasos % 20 === 0 || pasos >= jug.caminataObjetivo)
        this.enviar(jug.ws, { t: 'caminata', pasos, objetivo: jug.caminataObjetivo });
      if (pasos >= jug.caminataObjetivo) {
        const defC = this.map.caminatas[0];
        if (!defC) return;
        if (this.alCruzar) this.alCruzar(jug, this, defC, { sinTarjeta: true });
      }
    }
  }

  // consecuencias de la posición (v22, por PROXIMIDAD): recoger a <0.5,
  // ofertar salida a <0.6 (histéresis: se rearma al alejarse >1.0)
  proximidad(jug) {
    for (const it of this.map.items)
      if (it.recien === jug.id && Fisica.dist(it.x, it.y, jug.x, jug.y) > 0.8) delete it.recien;
    const i = this.map.items.findIndex(
      (it) => !it.taken && it.recien !== jug.id && Fisica.dist(it.x, it.y, jug.x, jug.y) < 0.5
    );
    if (i >= 0 && jug.inv.length < 6) {
      const it = this.map.items[i];
      it.taken = true;
      delete it.recien;
      jug.inv.push(it.id);
      // tubería o linterna a una mano libre: lista para usar
      const m = jug.manos.indexOf(null);
      if (m >= 0 && (it.id === 'tuberia' || it.id === 'linterna')) {
        jug.manos[m] = it.id;
        jug.inv.pop();
      }
      this.difundir({ t: 'itemCogido', idx: i, por: jug.id, id: it.id });
      this.enviarInv(jug);
    }
    const s = this.salidaCerca(jug, 0.6);
    if (s && jug.ofertaEn !== s.i) this.ofrecer(jug, s);
    else if (!s && jug.ofertaEn !== null && !this.salidaCerca(jug, 1.0)) jug.ofertaEn = null;
  }

  salidaCerca(jug, radio) {
    let mejor = null, mejorD = radio;
    this.map.exits.forEach((e, i) => {
      const d = Fisica.dist(e.x, e.y, jug.x, jug.y);
      if (d <= mejorD) { mejorD = d; mejor = { i, ex: e }; }
    });
    // tu puerta personal de retorno (v23) compite como una salida más
    if (jug.retorno) {
      const r = jug.retorno;
      const d = Fisica.dist(r.x, r.y, jug.x, jug.y);
      if (d <= mejorD) {
        mejor = { i: 'R', ex: { x: r.x, y: r.y, def: {
          texto: 'El camino por el que llegaste sigue abierto', destino: r.destino, tipo: 'retorno',
        } } };
      }
    }
    return mejor;
  }

  ofrecer(jug, { i, ex }) {
    jug.ofertaEn = i;
    const def = ex.def;
    if ((def._mec === 'romper' || def._mec === 'romper_suelo') && !def._abierta) {
      this.enviar(jug.ws, {
        t: 'aviso',
        txt: def._mec === 'romper_suelo'
          ? 'El suelo CRUJE bajo la moqueta. Pulsa ESPACIO para intentar romperlo.'
          : 'Esta pared está AGRIETADA: suena hueca. Pulsa ESPACIO para intentar abrirla.',
      });
      return;
    }
    this.enviar(jug.ws, { t: 'oferta', i, texto: def.texto, destino: def.destino, tipo: def.tipo });
  }

  // ---------- ESPACIO contextual (v22: todo por proximidad) ----------
  accion(jug) {
    if (jug.muerto || jug.canal) return;
    // 1) escondite: salir de él
    if (jug.escondido) { this.esconder(jug, false); return; }
    // 2) contenedor SIN registrar cerca: registrarlo (v23 — como el modo solo)
    const iCont = (this.map.props || []).findIndex(
      (p) => p.contenedor && !p.registrado && Fisica.dist(p.x, p.y, jug.x, jug.y) <= 1.2
    );
    if (iCont >= 0) { this.registrarCont(jug, iCont); return; }
    const prop = (this.map.props || []).find(
      (p) => ESCONDITES.has(p.id) && p.registrado && Fisica.dist(p.x, p.y, jug.x, jug.y) <= 1.2
    );
    // 3) salida con mecánica de romper (a ≤1.0)
    const s = this.salidaCerca(jug, 1.0);
    if (s && (s.ex.def._mec === 'romper' || s.ex.def._mec === 'romper_suelo') && !s.ex.def._abierta) {
      this.iniciarRomper(jug, s);
      return;
    }
    // 4) salida normal: reofrecer
    if (s) { this.ofrecer(jug, s); return; }
    if (prop) { this.esconder(jug, true, prop); return; }
    this.enviar(jug.ws, { t: 'aviso', txt: 'No hay nada con lo que interactuar aquí.' });
  }

  // ---------- registrar contenedores (v23): dado autoritativo, botín compartido ----------
  registrarCont(jug, i) {
    const prop = this.map.props[i];
    prop.registrado = true;
    this.difundir({ t: 'registrado', i }); // todos ven que ese mueble ya está abierto
    this.hacerRuido(jug.x, jug.y, 10);     // registrar HACE RUIDO (como en el modo solo)
    const d = this.rng.int(1, 20);
    this.difundir({ t: 'dado', id: jug.id, valor: d, exito: d >= 14 });
    if (d >= 14) {
      const pool = ['agua_almendras', 'agua_almendras', 'botiquin', 'amuleto', 'linterna', 'chaqueta', 'mascara_gas', 'botas_reforzadas', 'tuberia', 'fuego_griego', 'guante_paralisis', 'trebol'];
      const id = pool[Math.min(pool.length - 1, Math.floor((d - 14) / 7 * pool.length + this.rng.int(0, 2)))];
      if (jug.inv.length >= 6) {
        this.enviar(jug.ws, { t: 'aviso', txt: 'Hay algo útil… pero no te cabe nada más.' });
      } else {
        jug.inv.push(id);
        this.enviarInv(jug);
        const def = DATA.objects[id];
        this.enviar(jug.ws, { t: 'aviso', txt: `Encuentras: ${def ? def.nombre : id}.` });
      }
    } else if (d >= 7) {
      this.enviar(jug.ws, { t: 'aviso', txt: 'Vacío. Solo polvo y papel amarillento.' });
    } else if (d >= 2) {
      this.enviar(jug.ws, { t: 'aviso', txt: 'Algo se escurre entre tus dedos. Retrocedes de golpe.' });
    } else {
      // pifia: el estruendo pone a cazar a la entidad más cercana
      this.enviar(jug.ws, { t: 'aviso', txt: 'El ruido ha despertado algo en la oscuridad…' });
      this.hacerRuido(jug.x, jug.y, 14);
      let best = null, bestD = Infinity;
      for (const e of this.entidades) {
        if (!e.viva) continue;
        const dd = Math.abs(e.x - jug.x) + Math.abs(e.y - jug.y);
        if (dd < bestD) { bestD = dd; best = e; }
      }
      if (best) {
        best.estado = 'caza';
        if (!best.revelada) { best.revelada = true; this.difundir({ t: 'entRevela', uid: best.uid }); }
      }
    }
  }

  esconder(jug, si, prop) {
    if (si) {
      jug.escondido = { x: prop.x, y: prop.y };
      // el cuerpo se queda EN el mueble: al salir, sales de ahí
      jug.x = prop.x; jug.y = prop.y;
      jug.input = { dx: 0, dy: 0 };
      this.difundir({ t: 'mueve', id: jug.id, x: r2(jug.x), y: r2(jug.y) });
      this.enviar(jug.ws, { t: 'aviso', txt: 'Te metes dentro. Nada debería verte… si nadie te vio entrar.' });
    } else {
      jug.escondido = null;
    }
    this.difundir({ t: 'esconde', id: jug.id, si: !!si });
  }

  // ---------- romper pared/suelo: canal de 1 s + dado ----------
  iniciarRomper(jug, { i, ex }) {
    const herramienta = jug.manos.includes('tuberia');
    jug.canal = { tipo: 'romper', i, hasta: Date.now() + 1000, herramienta, origen: [jug.x, jug.y] };
    this.hacerRuido(jug.x, jug.y, 10);
    this.difundir({ t: 'canal', id: jug.id, ms: 1000 });
  }

  cancelarCanal(jug, motivo) {
    jug.canal = null;
    this.enviar(jug.ws, { t: 'canalFin', ok: false });
    if (motivo) this.enviar(jug.ws, { t: 'aviso', txt: motivo });
  }

  resolverCanal(jug) {
    const c = jug.canal;
    jug.canal = null;
    const ex = this.map.exits[c.i];
    if (!ex || ex.def._abierta) return;
    const d = this.rng.int(1, 20);
    const esSuelo = ex.def._mec === 'romper_suelo';
    const umbral = c.herramienta ? 7 : (esSuelo ? 11 : 12);
    const exito = d >= umbral;
    this.difundir({ t: 'dado', id: jug.id, valor: d, exito });
    this.enviar(jug.ws, { t: 'canalFin', ok: true });
    if (exito) {
      ex.def._abierta = true;
      this.difundir({ t: 'abierto', i: c.i });
      this.hacerRuido(ex.x, ex.y, 12);
    } else if (!c.herramienta) {
      // romper a puñetazos/pisotones duele
      jug.salud = Math.max(0, jug.salud - 2);
      this.enviar(jug.ws, { t: 'salud', valor: jug.salud });
      if (jug.salud <= 0) this.morir(jug, 'tus propios golpes');
    }
  }

  // ---------- cruzar salidas ----------
  cruzar(jug, si) {
    if (!si) { jug.ofertaEn = null; return; }
    const s = this.salidaCerca(jug, 1.0);
    if (!s || jug.muerto) return;
    const def = s.ex.def;
    if ((def._mec === 'romper' || def._mec === 'romper_suelo') && !def._abierta) return;
    if (!DATA.levels[def.destino]) {
      this.enviar(jug.ws, { t: 'aviso', txt: 'Ese camino no lleva a ninguna parte (nivel fuera del piloto).' });
      return;
    }
    if (this.alCruzar) this.alCruzar(jug, this, def);
  }

  // ---------- manos: tubería (golpe hacia donde miras) y linterna ----------
  usar(jug, mano) {
    if (jug.muerto || jug.escondido) return;
    const id = jug.manos[mano];
    if (id === 'linterna') { this.luz(jug, !jug.luz); return; }
    if (id !== 'tuberia') return;
    const ahora = Date.now();
    if (ahora - (jug.ultGolpe || 0) < 400) return;
    jug.ultGolpe = ahora;
    const [fx, fy] = cardinalDe(jug.rot ?? Math.PI);
    const tx = jug.x + fx, ty = jug.y + fy;
    this.difundir({ t: 'golpe', id: jug.id, x: tx, y: ty });
    this.hacerRuido(jug.x, jug.y, 8);
    // el barrido alcanza a la entidad viva más cercana al punto de impacto
    let e = null, mejor = 0.9;
    for (const e2 of this.entidades) {
      if (!e2.viva) continue;
      const d = Fisica.dist(e2.x, e2.y, tx, ty);
      if (d <= mejor) { mejor = d; e = e2; }
    }
    if (!e) return;
    e.vida -= 12;
    e.revelada = true;
    if (e.vida <= 0) {
      e.viva = false;
      this.difundir({ t: 'entMuere', uid: e.uid });
    } else {
      this.difundir({ t: 'entHit', uid: e.uid });
    }
  }

  // la linterna solo alumbra EN LA MANO (v23): el servidor manda, el cliente
  // refleja — luzDe llega también al dueño (nada de encender en local)
  luz(jug, si) {
    if (si && !jug.manos.includes('linterna')) {
      this.enviar(jug.ws, { t: 'aviso', txt: 'Necesitas la linterna en la mano (B: mochila, arrástrala a una mano).' });
      si = false;
    }
    if (jug.luz === !!si) return;
    jug.luz = !!si;
    this.difundir({ t: 'luzDe', id: jug.id, si: jug.luz });
  }

  // ---------- mochila autoritativa (los gestos del panel llegan por red) ----------
  mochila(jug, m) {
    if (jug.muerto) return;
    const OBJ = DATA.objects;
    const aviso = (txt) => this.enviar(jug.ws, { t: 'aviso', txt });
    switch (m.que) {
      case 'equipar': {
        const id = jug.inv[m.slot];
        const def = id && OBJ[id];
        if (!def || !def.manos) { aviso('Eso no se empuña.'); return; }
        if (def.manos === 2) {
          if (jug.manos[0] || jug.manos[1]) { aviso('Necesitas las DOS manos libres.'); return; }
          jug.manos = [id, '='];
        } else {
          const libre = jug.manos.indexOf(null);
          if (libre < 0) { aviso('Tienes las manos ocupadas.'); return; }
          jug.manos[libre] = id;
        }
        jug.inv.splice(m.slot, 1);
        break;
      }
      case 'desequipar': {
        let mano = m.mano;
        if (jug.manos[mano] === '=') mano = 0;
        const id = jug.manos[mano];
        if (!id) return;
        if (jug.inv.length >= 6) { aviso('La mochila está llena.'); return; }
        if (OBJ[id] && OBJ[id].manos === 2) jug.manos = [null, null];
        else jug.manos[mano] = null;
        jug.inv.push(id);
        break;
      }
      case 'usarItem': {
        const id = jug.inv[m.slot];
        const def = id && OBJ[id];
        if (!def) return;
        const ef = def.efecto || {};
        if (ef.salud) {
          jug.salud = Math.min(100, jug.salud + ef.salud);
          jug.inv.splice(m.slot, 1);
          this.enviar(jug.ws, { t: 'salud', valor: jug.salud });
          aviso(`${def.nombre}: recuperas ${ef.salud} de salud.`);
        } else if (ef.activo === 'fuego') {
          jug.inv.splice(m.slot, 1);
          this.hacerRuido(jug.x, jug.y, 10);
          for (const e of this.entidades) {
            if (!e.viva || Math.abs(e.x - jug.x) + Math.abs(e.y - jug.y) > 3) continue;
            e.vida -= 30;
            e.huyendoHasta = Date.now() + 4000;
            if (e.vida <= 0) { e.viva = false; this.difundir({ t: 'entMuere', uid: e.uid }); }
            else this.difundir({ t: 'entHit', uid: e.uid });
          }
          this.difundir({ t: 'golpe', id: jug.id, x: jug.x, y: jug.y });
        } else if (ef.activo === 'paralisis') {
          jug.inv.splice(m.slot, 1);
          for (const e of this.entidades) {
            if (!e.viva || Math.abs(e.x - jug.x) + Math.abs(e.y - jug.y) > 1) continue;
            e.paralizadaHasta = Date.now() + 2400;
            this.difundir({ t: 'entHit', uid: e.uid });
          }
        } else if (ef.toggle === 'luz') {
          this.luz(jug, !jug.luz);
        } else {
          aviso('Aquí dentro, eso todavía no surte efecto.');
          return;
        }
        break;
      }
      case 'tirar': case 'arrojar': {
        const id = jug.inv[m.slot];
        if (!id) return;
        jug.inv.splice(m.slot, 1);
        let tx = jug.x, ty = jug.y;
        if (m.que === 'arrojar') {
          // vuela hasta 4 casillas hacia donde miras: distracción sonora
          const [fx, fy] = cardinalDe(jug.rot ?? Math.PI);
          const jx = Fisica.tileDe(jug.x), jy = Fisica.tileDe(jug.y);
          for (let d = 4; d >= 1; d--) {
            if (esTransitable(this.map, jx + fx * d, jy + fy * d)) { tx = jx + fx * d; ty = jy + fy * d; break; }
          }
          this.hacerRuido(tx, ty, 12);
        }
        const it = { x: tx, y: ty, id, taken: false };
        if (m.que === 'tirar') it.recien = jug.id;
        this.map.items.push(it);
        this.difundir({ t: 'itemSuelto', idx: this.map.items.length - 1, x: tx, y: ty, id });
        break;
      }
      case 'ponerEquipo': {
        const id = jug.inv[m.slot];
        const def = id && OBJ[id];
        if (!def || !def.equipo) { aviso('Eso no se viste.'); return; }
        const anterior = jug.equipo[def.equipo];
        jug.equipo[def.equipo] = id;
        jug.inv.splice(m.slot, 1);
        if (anterior) jug.inv.push(anterior);
        break;
      }
      case 'quitarEquipo': {
        const id = jug.equipo[m.tipo];
        if (!id) return;
        if (jug.inv.length >= 6) { aviso('La mochila está llena.'); return; }
        jug.equipo[m.tipo] = null;
        jug.inv.push(id);
        break;
      }
    }
    this.enviarInv(jug);
    // si la linterna salió de las manos con la luz encendida, se apaga sola
    if (jug.luz && !jug.manos.includes('linterna')) this.luz(jug, false);
  }

  hacerRuido(x, y, radio) {
    this.ruido = { x, y, radio, hasta: Date.now() + 3200 };
  }

  // ---------- muerte: como el roguelike, despiertas otra vez en Level 0 ----------
  morir(jug, causa) {
    jug.muerto = true;
    jug.escondido = null;
    jug.canal = null;
    if (jug.luz) this.luz(jug, false); // la linterna se pierde con el resto
    db.sumarMuerte(jug.token);
    this.difundir({ t: 'muere', id: jug.id, causa });
    setTimeout(() => {
      if (!this.jugadores.has(jug.id)) return;
      jug.salud = 100;
      jug.muerto = false;
      jug.inv = []; jug.manos = [null, null];
      if (this.alMorir) this.alMorir(jug, this, causa);
    }, 2500);
  }

  // ---------- remodelación no euclidiana: EVENTO de sala (v21) ----------
  // El mismo algoritmo del modo solo (regenerar un chunk 14×14 lejos de la
  // vista, conservando bordes y validando conectividad) pero para TODOS a la
  // vez: el crujido que recorre el nivel lo oye la sala entera.
  remodelar() {
    const g = this.map.grid, T = MapGen.T, CH = 14;
    if (g.w < CH + 6 || g.h < CH + 6) return false;
    const rng = this.rng;
    for (let intento = 0; intento < 12; intento++) {
      const cx = rng.int(2, g.w - CH - 3);
      const cy = rng.int(2, g.h - CH - 3);
      // fuera de la vista de TODOS los jugadores de la sala
      let vista = false;
      for (const j of this.jugadores.values()) {
        const ncx = Math.max(cx, Math.min(j.x, cx + CH - 1));
        const ncy = Math.max(cy, Math.min(j.y, cy + CH - 1));
        if (Math.max(Math.abs(j.x - ncx), Math.abs(j.y - ncy)) < 20) { vista = true; break; }
      }
      if (vista) continue;
      if (this.map.exits.some((e) => e.x >= cx && e.x < cx + CH && e.y >= cy && e.y < cy + CH)) continue;

      const backup = new Uint8Array(CH * CH);
      for (let y = 0; y < CH; y++)
        for (let x = 0; x < CH; x++)
          backup[y * CH + x] = g.t[(cy + y) * g.w + (cx + x)];

      for (let y = 1; y < CH - 1; y++)
        for (let x = 1; x < CH - 1; x++) {
          const gx = cx + x, gy = cy + y;
          const viejo = g.t[gy * g.w + gx];
          if (viejo === T.VACIO || viejo === T.AGUA) continue;
          const pilar = (gx % 2 === 0 && gy % 2 === 0) || rng.chance(0.22);
          g.t[gy * g.w + gx] = pilar ? T.PARED : T.SUELO;
        }
      const dentro = (x, y) => x >= cx && x < cx + CH && y >= cy && y < cy + CH;
      for (const it of this.map.items) if (!it.taken && dentro(it.x, it.y)) g.t[it.y * g.w + it.x] = T.SUELO;
      for (const pr of this.map.props || []) if (dentro(pr.x, pr.y)) g.t[pr.y * g.w + pr.x] = T.SUELO;
      for (const e of this.entidades) if (e.viva && dentro(e.x, e.y)) g.t[e.y * g.w + e.x] = T.SUELO;

      // validar: salidas Y jugadores siguen conectados entre sí (BFS del spawn)
      const dist = MapGen.bfsDist(g, this.map.spawn[0], this.map.spawn[1]);
      const ok = this.map.exits.every((e) => dist[e.y * g.w + e.x] >= 0) &&
        [...this.jugadores.values()].every(
          (j) => dist[Fisica.tileDe(j.y) * g.w + Fisica.tileDe(j.x)] >= 0);
      if (!ok) {
        for (let y = 0; y < CH; y++)
          for (let x = 0; x < CH; x++)
            g.t[(cy + y) * g.w + (cx + x)] = backup[y * CH + x];
        continue;
      }

      const tiles = [];
      for (let y = 0; y < CH; y++)
        for (let x = 0; x < CH; x++) tiles.push(g.t[(cy + y) * g.w + (cx + x)]);
      this.difundir({ t: 'remodel', x: cx, y: cy, ch: CH, tiles });
      return true;
    }
    return false;
  }

  // ---------- tick de simulación (lo llama server.js a 10 Hz) ----------
  tick(ahora) {
    if (!this.jugadores.size) return;
    const dt = Math.min(0.25, (ahora - (this._ultTick || ahora)) / 1000);
    this._ultTick = ahora;
    const movidos = [];
    for (const jug of this.jugadores.values()) {
      this.integrar(jug, dt, movidos);
      if (jug.canal && ahora >= jug.canal.hasta) this.resolverCanal(jug);
    }
    Entidades.tick(this, ahora, dt);
    // difusión BATCHED de posiciones: un solo mensaje por tick con lo que se movió
    if (movidos.length || (this._entMovidas && this._entMovidas.length)) {
      this.difundir({
        t: 'pos',
        j: movidos.map((j) => [j.id, r2(j.x), r2(j.y)]),
        e: (this._entMovidas || []).map((e) => [e.uid, r2(e.x), r2(e.y)]),
      });
      this._entMovidas = [];
    }
    // regla no_euclidiana de la ficha: cada 45-90 s el nivel se reorganiza
    if ((this.def.reglas || []).includes('no_euclidiano')) {
      if (!this._remodelEn) this._remodelEn = ahora + 45000 + this.rng.int(0, 45000);
      if (ahora >= this._remodelEn) {
        this._remodelEn = ahora + 45000 + this.rng.int(0, 45000);
        this.remodelar();
      }
    }
  }

  chat(jug, txt) {
    const ahora = Date.now();
    if (ahora < (jug.muteadoHasta || 0)) {
      this.enviar(jug.ws, { t: 'aviso', txt: 'Estás silenciado. Las paredes no te escuchan.' });
      return;
    }
    if (ahora - jug.ultChat < P.COOLDOWN_CHAT) {
      this.enviar(jug.ws, { t: 'aviso', txt: 'Más despacio: un mensaje cada segundo y medio.' });
      return;
    }
    jug.ultChat = ahora;
    // chat de PROXIMIDAD: solo lo oye quien está a ≤14 casillas del que habla
    // (ni siquiera viaja por la red a los demás — nada de espiar el tráfico)
    const raw = JSON.stringify({ t: 'chat', id: jug.id, txt });
    for (const j of this.jugadores.values()) {
      if (j.ws.readyState !== 1) continue;
      if (j.id !== jug.id && Math.hypot(j.x - jug.x, j.y - jug.y) > P.RADIO_CHAT) continue;
      j.ws.send(raw);
    }
  }

  girar(jug, th) {
    if (jug.rot === th) return;
    jug.rot = th;
    this.difundir({ t: 'gira', id: jug.id, rot: r2(th) }, jug.id);
  }

  enviar(ws, msg) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  difundir(msg, exceptoId) {
    const raw = JSON.stringify(msg);
    for (const j of this.jugadores.values())
      if (j.id !== exceptoId && j.ws.readyState === 1) {
        j.ws.send(raw);
        metricas.bytes += raw.length;
      }
  }
}

// ---------- registro de salas ----------
const salas = new Map();

function asignar(nivelId) {
  let inst = 1;
  for (;;) {
    const clave = `${nivelId}::${inst}`;
    let sala = salas.get(clave);
    if (!sala) {
      sala = new Sala(nivelId, inst);
      salas.set(clave, sala);
      console.log(`[sala] abierta ${clave} (${sala.map.grid.w}×${sala.map.grid.h}, ${sala.entidades.length} entidades)`);
    }
    if (!sala.llena) return sala;
    inst++;
  }
}

// métricas del bucle de simulación (visibles en /estado)
const metricas = { ultMs: 0, maxMs: 0, medias: [], bytes: 0, bytesT: Date.now(), kbs: 0 };

function tickTodas(ahora) {
  const t0 = process.hrtime.bigint();
  for (const s of salas.values()) {
    // una sala rota no puede tumbar el resto del mundo
    try { s.tick(ahora); } catch (e) { console.error(`[sala ${s.clave}] tick:`, e.message); }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  metricas.ultMs = ms;
  if (ms > metricas.maxMs) metricas.maxMs = ms;
  metricas.medias.push(ms);
  if (metricas.medias.length > 300) metricas.medias.shift(); // últimos 30 s
}

function estado() {
  const media = metricas.medias.length
    ? metricas.medias.reduce((a, b) => a + b, 0) / metricas.medias.length : 0;
  return {
    salas: [...salas.values()].map((s) => ({
      clave: s.clave, jugadores: s.jugadores.size,
      entidades: s.entidades.filter((e) => e.viva).length,
    })),
    total: [...salas.values()].reduce((n, s) => n + s.jugadores.size, 0),
    tick: { ultimoMs: +metricas.ultMs.toFixed(2), medioMs: +media.toFixed(2), maxMs: +metricas.maxMs.toFixed(2) },
    memoriaMB: Math.round(process.memoryUsage().rss / 1048576),
    salidaKBs: metricas.kbs,
  };
}

// caudal de salida: se consolida cada 5 s
setInterval(() => {
  const dt = (Date.now() - metricas.bytesT) / 1000;
  metricas.kbs = Math.round(metricas.bytes / dt / 1024);
  metricas.bytes = 0;
  metricas.bytesT = Date.now();
}, 5000);

function todas() { return [...salas.values()]; }

module.exports = { Sala, asignar, tickTodas, estado, todas };
