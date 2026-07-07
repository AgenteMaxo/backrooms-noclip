// Una SALA = una instancia viva de un nivel («level-0::1»). Censo de jugadores,
// entidades simuladas (sim/entidades.js), objetos del suelo, salidas con
// mecánica (romper pared/suelo con canal + dado) y escondites. Los jugadores
// NO se bloquean entre sí; las entidades sí ocupan casilla.
'use strict';

const { DATA, RNG, MapGen, generarMapa, esTransitable } = require('./sim/mundo');
const Entidades = require('./sim/entidades');
const P = require('./protocolo');
const db = require('./db');

let siguienteId = 1;
const ESCONDITES = new Set(['taquilla', 'nevera', 'archivador']);

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
    for (const j of this.jugadores.values()) if (j.x === x && j.y === y) return true;
    return false;
  }

  buscarSpawn() {
    const [sx, sy] = this.map.spawn;
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
      id, ws, nombre, token, x, y, rot: 2,
      salud: 100, luz: false, escondido: null, muerto: false,
      inv: [], manos: [null, null], equipo: { cara: null, cuerpo: null, pies: null },
      sintonia: expediente ? expediente.sintonia : 0,
      instintos: expediente ? (expediente.instintos || []) : [],
      ofertaInst: null, umbralesVistos: {},
      esAdmin: false, muteadoHasta: 0,
      ultMov: 0, ultChat: 0, canal: null, ofertaEn: null,
    };
    for (const u of [20, 40, 60, 80]) if (jug.sintonia >= u) jug.umbralesVistos[u] = true;
    this.prepararCaminata(jug);
    this.enviar(ws, {
      t: 'bienvenida', id, nivel: this.nivelId, inst: this.inst,
      semilla: this.semilla, x, y, rot: jug.rot,
      salud: jug.salud, inv: jug.inv, manos: jug.manos,
      sintonia: jug.sintonia,
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
    jug.caminataObjetivo = (this.map.caminatas || []).length
      ? MapGen.walkingGoal(this.def, `${jug.token}::${this.clave}`, 1, 0)
      : 0;
  }

  // sube la Sintonía (0-100): presenciar horrores te acompasa con el lugar.
  // Al cruzar un umbral (20/40/60/80) las Backrooms ofrecen un INSTINTO.
  tune(jug, n) {
    jug.sintonia = Math.max(0, Math.min(100, (jug.sintonia || 0) + n));
    db.guardarSintonia(jug.token, jug.sintonia);
    this.enviar(jug.ws, { t: 'sintonia', v: jug.sintonia });
    for (const u of [20, 40, 60, 80]) {
      if (jug.sintonia < u || jug.umbralesVistos[u]) continue;
      jug.umbralesVistos[u] = true;
      this.ofrecerInstinto(jug, u);
    }
  }

  ofrecerInstinto(jug, umbral) {
    let pool = Sala.INSTINTOS_MMO.filter((k) => !jug.instintos.includes(k));
    if (umbral < 80) pool = pool.filter((k) => k !== 'noclip'); // el noclip se gana
    if (!pool.length) return;
    const rng = RNG.create(`${jug.token}::instinto::${umbral}`);
    const ofertas = rng.shuffle(pool.slice()).slice(0, 3);
    jug.ofertaInst = ofertas;
    this.enviar(jug.ws, { t: 'instintos', umbral, ofertas });
  }

  elegirInstinto(jug, id) {
    if (!jug.ofertaInst || !jug.ofertaInst.includes(id)) return;
    jug.ofertaInst = null;
    jug.instintos.push(id);
    db.guardarInstintos(jug.token, jug.instintos);
    this.enviarInv(jug);
    this.enviar(jug.ws, { t: 'aviso', txt: 'El instinto se asienta en tu carne. Ya es tuyo.' });
  }

  enviarInv(jug) {
    this.enviar(jug.ws, {
      t: 'inv', inv: jug.inv, manos: jug.manos,
      equipo: jug.equipo, instintos: jug.instintos,
    });
  }

  salir(jug) {
    if (!this.jugadores.delete(jug.id)) return;
    this.difundir({ t: 'sale', id: jug.id });
  }

  // ---------- movimiento ----------
  mover(jug, dx, dy) {
    const ahora = Date.now();
    if (jug.muerto) return;
    if (ahora - jug.ultMov < P.COOLDOWN_MOVER) return;
    if (jug.canal) this.cancelarCanal(jug, 'Te mueves: dejas lo que estabas haciendo.');
    if (jug.escondido) this.esconder(jug, false);
    const nx = jug.x + dx, ny = jug.y + dy;
    if (esTransitable(this.map, nx, ny)) {
      jug.x = nx; jug.y = ny; jug.ultMov = ahora;
      this.difundir({ t: 'mueve', id: jug.id, x: nx, y: ny });
      this.pisar(jug);
      this.pasoCaminata(jug);
    } else {
      this.enviar(jug.ws, { t: 'mueve', id: jug.id, x: jug.x, y: jug.y });
    }
  }

  // progreso de la caminata personal: aviso periódico al cliente (que pinta el
  // fundido gris y los bocadillos) y cruce AUTOMÁTICO al llegar al objetivo
  pasoCaminata(jug) {
    if (!jug.caminataObjetivo || jug.muerto) return;
    jug.pasosSala++;
    if (jug.pasosSala % 20 === 0 || jug.pasosSala === jug.caminataObjetivo)
      this.enviar(jug.ws, { t: 'caminata', pasos: jug.pasosSala, objetivo: jug.caminataObjetivo });
    if (jug.pasosSala >= jug.caminataObjetivo) {
      const defC = this.map.caminatas[0];
      if (!defC) return;
      this.tune(jug, 3);
      if (this.alCruzar) this.alCruzar(jug, this, defC, { sinTarjeta: true });
    }
  }

  // efectos de pisar una casilla: recoger objeto, oferta de salida
  pisar(jug) {
    // lo que acabas de tirar no se auto-recoge hasta que abandones la casilla
    for (const it of this.map.items)
      if (it.recien === jug.id && (it.x !== jug.x || it.y !== jug.y)) delete it.recien;
    const i = this.map.items.findIndex(
      (it) => !it.taken && it.x === jug.x && it.y === jug.y && it.recien !== jug.id
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
    const ex = this.salidaEn(jug.x, jug.y);
    if (ex && jug.ofertaEn !== ex.i) this.ofrecer(jug, ex);
    if (!ex) jug.ofertaEn = null;
  }

  salidaEn(x, y) {
    const i = this.map.exits.findIndex((e) => e.x === x && e.y === y);
    return i >= 0 ? { i, ex: this.map.exits[i] } : null;
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

  // ---------- ESPACIO contextual ----------
  accion(jug) {
    if (jug.muerto || jug.canal) return;
    // 1) escondite: sobre un mueble escondible (o salir de él)
    if (jug.escondido) { this.esconder(jug, false); return; }
    const prop = (this.map.props || []).find(
      (p) => ESCONDITES.has(p.id) && Math.abs(p.x - jug.x) + Math.abs(p.y - jug.y) <= 1
    );
    // 2) salida con mecánica de romper
    const s = this.salidaEn(jug.x, jug.y);
    if (s && (s.ex.def._mec === 'romper' || s.ex.def._mec === 'romper_suelo') && !s.ex.def._abierta) {
      this.iniciarRomper(jug, s);
      return;
    }
    // 3) salida normal: reofrecer
    if (s) { this.ofrecer(jug, s); return; }
    if (prop) { this.esconder(jug, true, prop); return; }
  }

  esconder(jug, si, prop) {
    if (si) {
      jug.escondido = { x: prop.x, y: prop.y };
      this.enviar(jug.ws, { t: 'aviso', txt: 'Te metes dentro. Nada debería verte… si nadie te vio entrar.' });
    } else {
      jug.escondido = null;
    }
    this.difundir({ t: 'esconde', id: jug.id, si: !!si });
  }

  // ---------- romper pared/suelo: canal de 1 s + dado ----------
  iniciarRomper(jug, { i, ex }) {
    const herramienta = jug.manos.includes('tuberia');
    jug.canal = { tipo: 'romper', i, hasta: Date.now() + 1000, herramienta };
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
    const s = this.salidaEn(jug.x, jug.y);
    if (!s || jug.muerto) return;
    const def = s.ex.def;
    if ((def._mec === 'romper' || def._mec === 'romper_suelo') && !def._abierta) return;
    if (!DATA.levels[def.destino]) {
      this.enviar(jug.ws, { t: 'aviso', txt: 'Ese camino no lleva a ninguna parte (nivel fuera del piloto).' });
      return;
    }
    // cruzar por donde nadie debería te sintoniza con el lugar
    if (def.tipo === 'arriesgada' || def.tipo === 'void') this.tune(jug, 5);
    if (this.alCruzar) this.alCruzar(jug, this, def);
  }

  // ---------- manos: tubería (golpe a la casilla encarada) y linterna ----------
  usar(jug, mano) {
    if (jug.muerto || jug.escondido) return;
    const id = jug.manos[mano];
    if (id === 'linterna') { this.luz(jug, !jug.luz); return; }
    if (id !== 'tuberia') return;
    const ahora = Date.now();
    if (ahora - (jug.ultGolpe || 0) < 400) return;
    jug.ultGolpe = ahora;
    const VEC = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const [fx, fy] = VEC[jug.rot ?? 2];
    const tx = jug.x + fx, ty = jug.y + fy;
    this.difundir({ t: 'golpe', id: jug.id, x: tx, y: ty });
    this.hacerRuido(jug.x, jug.y, 8);
    const e = this.entidades.find((e2) => e2.viva && e2.x === tx && e2.y === ty);
    if (!e) return;
    e.vida -= 12;
    e.revelada = true;
    if (e.vida <= 0) {
      e.viva = false;
      this.difundir({ t: 'entMuere', uid: e.uid });
      this.tune(jug, 8); // matar es el mayor de los horrores presenciables
    } else {
      this.difundir({ t: 'entHit', uid: e.uid });
    }
  }

  luz(jug, si) {
    jug.luz = !!si;
    this.difundir({ t: 'luzDe', id: jug.id, si: jug.luz });
  }

  // ---------- mochila autoritativa (los gestos del panel llegan por red) ----------
  mochila(jug, m) {
    if (jug.muerto) return;
    const OBJ = DATA.objects;
    const VEC = [[0, -1], [1, 0], [0, 1], [-1, 0]];
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
            if (e.vida <= 0) { e.viva = false; this.difundir({ t: 'entMuere', uid: e.uid }); this.tune(jug, 8); }
            else this.difundir({ t: 'entHit', uid: e.uid });
          }
          this.difundir({ t: 'golpe', id: jug.id, x: jug.x, y: jug.y });
          this.tune(jug, 5); // el fuego griego deja marca
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
          // vuela hasta 4 casillas en la dirección encarada: distracción sonora
          const [fx, fy] = VEC[jug.rot ?? 2];
          for (let d = 4; d >= 1; d--) {
            if (esTransitable(this.map, jug.x + fx * d, jug.y + fy * d)) { tx = jug.x + fx * d; ty = jug.y + fy * d; break; }
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
  }

  // ---------- noclip (instinto de sintonía 80): atravesar la pared con G ----------
  noclip(jug) {
    if (jug.muerto || !jug.instintos.includes('noclip')) return;
    const VEC = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const [fx, fy] = VEC[jug.rot ?? 2];
    const mx = jug.x + fx, my = jug.y + fy;         // el muro que atraviesas
    const dx = jug.x + fx * 2, dy = jug.y + fy * 2; // donde reapareces
    if (esTransitable(this.map, mx, my) || !esTransitable(this.map, dx, dy)) {
      this.enviar(jug.ws, { t: 'aviso', txt: 'Necesitas una pared delante y un hueco al otro lado.' });
      return;
    }
    const d = this.rng.int(1, 20);
    this.difundir({ t: 'dado', id: jug.id, valor: d, exito: d > 3 });
    if (d <= 3) { this.morir(jug, 'el Vacío entre las paredes'); return; }
    jug.x = dx; jug.y = dy;
    this.tune(jug, 2);
    this.difundir({ t: 'mueve', id: jug.id, x: dx, y: dy });
    this.pisar(jug);
  }

  hacerRuido(x, y, radio) {
    this.ruido = { x, y, radio, hasta: Date.now() + 3200 };
  }

  // ---------- muerte: como el roguelike, despiertas otra vez en Level 0 ----------
  morir(jug, causa) {
    jug.muerto = true;
    jug.escondido = null;
    jug.canal = null;
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
        [...this.jugadores.values()].every((j) => dist[j.y * g.w + j.x] >= 0);
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
      for (const j of this.jugadores.values()) this.tune(j, 2); // deja huella en todos
      return true;
    }
    return false;
  }

  // ---------- tick de simulación (lo llama server.js a 10 Hz) ----------
  tick(ahora) {
    if (!this.jugadores.size) return;
    for (const jug of this.jugadores.values()) {
      if (jug.canal && ahora >= jug.canal.hasta) this.resolverCanal(jug);
      // sangre amarilla: el lugar te repara — 1 de salud cada 6 s
      if (jug.instintos.includes('sangre_amarilla') && !jug.muerto && jug.salud < 100 &&
          ahora - (jug._regenT || 0) > 6000) {
        jug._regenT = ahora;
        jug.salud++;
        this.enviar(jug.ws, { t: 'salud', valor: jug.salud });
      }
    }
    Entidades.tick(this, ahora);
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

  girar(jug, rot) {
    if (jug.rot === rot) return;
    jug.rot = rot;
    this.difundir({ t: 'gira', id: jug.id, rot }, jug.id);
  }

  enviar(ws, msg) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  difundir(msg, exceptoId) {
    const raw = JSON.stringify(msg);
    for (const j of this.jugadores.values())
      if (j.id !== exceptoId && j.ws.readyState === 1) j.ws.send(raw);
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
const metricas = { ultMs: 0, maxMs: 0, medias: [] };

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
  };
}

// pool de instintos que tienen efecto en el mundo compartido (los de sed/
// hambre/registro llegarán cuando esas mecánicas existan online)
Sala.INSTINTOS_MMO = ['oido_moqueta', 'pies_moqueta', 'reflejos_errante',
  'piel_fluorescente', 'sangre_amarilla', 'noclip'];

function todas() { return [...salas.values()]; }

module.exports = { Sala, asignar, tickTodas, estado, todas };
