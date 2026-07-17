// Perfiles locales y progreso del códice.
(function () {
  'use strict';

  const esObjeto = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
  const entero = (value) => Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;

  function normalizar(datos) {
    const records = esObjeto(datos.records) ? datos.records : {};
    const descubiertos = esObjeto(datos.descubiertos) ? datos.descubiertos : {};
    const codice = {};
    if (esObjeto(datos.codice)) {
      for (const [id, entry] of Object.entries(datos.codice)) {
        if (!esObjeto(entry)) continue;
        codice[id] = {
          ...entry,
          veces: entero(entry.veces),
          mejorTurnos: Number.isFinite(entry.mejorTurnos) && entry.mejorTurnos >= 0
            ? Math.floor(entry.mejorTurnos) : null,
          escapado: entry.escapado === true,
        };
      }
    }
    return {
      ...datos,
      creado: typeof datos.creado === 'string' ? datos.creado : new Date().toISOString(),
      codice,
      records: {
        runs: entero(records.runs),
        maxNiveles: entero(records.maxNiveles),
        maxTurnos: entero(records.maxTurnos),
        escapes: entero(records.escapes),
      },
      historial: Array.isArray(datos.historial)
        ? datos.historial.filter(esObjeto).slice(0, 20).map((entry) => ({ ...entry })) : [],
      descubiertos: {
        salidas: esObjeto(descubiertos.salidas) ? { ...descubiertos.salidas } : {},
        entidades: esObjeto(descubiertos.entidades) ? { ...descubiertos.entidades } : {},
        objetos: esObjeto(descubiertos.objetos) ? { ...descubiertos.objetos } : {},
      },
    };
  }

  const Profiles = {
    _load() {
      try { return JSON.parse(localStorage.getItem('backrooms-profiles')) || { activo: null, perfiles: {} }; }
      catch (e) { return { activo: null, perfiles: {} }; }
    },
    _save(data) {
      try { localStorage.setItem('backrooms-profiles', JSON.stringify(data)); } catch (e) {}
    },
    list() { return Object.keys(this._load().perfiles); },
    activeName() { return this._load().activo; },
    get() {
      const data = this._load();
      return data.activo ? data.perfiles[data.activo] : null;
    },
    create(nombre) {
      nombre = (nombre || '').trim().slice(0, 24);
      if (!nombre) return false;
      const data = this._load();
      if (!data.perfiles[nombre]) {
        data.perfiles[nombre] = {
          creado: new Date().toISOString(),
          codice: {},
          records: { runs: 0, maxNiveles: 0, maxTurnos: 0, escapes: 0 },
          historial: [],
        };
      }
      data.activo = nombre;
      this._save(data);
      this._descCache = null;
      return true;
    },
    select(nombre) {
      const data = this._load();
      if (!data.perfiles[nombre]) return false;
      data.activo = nombre;
      this._save(data);
      this._descCache = null;
      return true;
    },
    remove(nombre) {
      const data = this._load();
      delete data.perfiles[nombre];
      if (data.activo === nombre) data.activo = Object.keys(data.perfiles)[0] || null;
      this._save(data);
      localStorage.removeItem(`backrooms-save::${nombre}`);
    },
    _update(update) {
      const data = this._load();
      if (!data.activo || !data.perfiles[data.activo]) return;
      update(data.perfiles[data.activo]);
      this._save(data);
    },
    registrarEntrada(levelId) {
      this._update((profile) => {
        profile.codice[levelId] ||= { veces: 0, mejorTurnos: null, escapado: false };
        profile.codice[levelId].veces++;
      });
    },
    _descCache: null,
    descubierto(tipo, clave) {
      if (!this._descCache) {
        const profile = this.get();
        this._descCache = profile?.descubiertos
          ? {
              salidas: { ...profile.descubiertos.salidas },
              entidades: { ...profile.descubiertos.entidades },
              objetos: { ...profile.descubiertos.objetos },
            }
          : { salidas: {}, entidades: {}, objetos: {} };
      }
      return !!this._descCache[tipo][clave];
    },
    registrarDescubierto(tipo, clave) {
      if (this.descubierto(tipo, clave)) return;
      this._descCache[tipo][clave] = true;
      this._update((profile) => {
        profile.descubiertos ||= { salidas: {}, entidades: {}, objetos: {} };
        profile.descubiertos[tipo][clave] = true;
      });
    },
    registrarSalida(levelId, turnos) {
      this._update((profile) => {
        const entry = profile.codice[levelId];
        if (entry && (entry.mejorTurnos === null || turnos < entry.mejorTurnos)) entry.mejorTurnos = turnos;
      });
    },
    registrarFin(victoria, journal, turnTotal, seed, levelFinal) {
      this._update((profile) => {
        profile.records.runs++;
        profile.records.maxNiveles = Math.max(profile.records.maxNiveles, journal.length);
        profile.records.maxTurnos = Math.max(profile.records.maxTurnos, turnTotal);
        if (victoria) {
          profile.records.escapes++;
          if (profile.codice[levelFinal]) profile.codice[levelFinal].escapado = true;
        }
        profile.historial.unshift({
          fecha: new Date().toISOString().slice(0, 16).replace('T', ' '),
          semilla: seed,
          niveles: journal.length,
          turnos: turnTotal,
          resultado: victoria ? '⭐ Escape' : `☠ ${journal[journal.length - 1]?.nombre || '—'}`,
        });
        profile.historial = profile.historial.slice(0, 20);
      });
    },
    exportar() {
      const data = this._load();
      if (!data.activo) return null;
      return JSON.stringify({ nombre: data.activo, datos: data.perfiles[data.activo] }, null, 1);
    },
    importar(json) {
      try {
        const imported = JSON.parse(json);
        if (typeof imported.nombre !== 'string' || !esObjeto(imported.datos)) return false;
        const nombre = imported.nombre.trim().slice(0, 24);
        if (!nombre) return false;
        const data = this._load();
        data.perfiles[nombre] = normalizar(imported.datos);
        data.activo = nombre;
        this._save(data);
        this._descCache = null;
        return true;
      } catch (e) {
        return false;
      }
    },
  };

  window.Profiles = Profiles;
})();
