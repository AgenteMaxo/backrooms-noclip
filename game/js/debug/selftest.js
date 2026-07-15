// Autopruebas ejecutables por URL. Se mantienen fuera del arranque normal para
// que main.js solo decida cuándo activarlas.
(function () {
  'use strict';

  function capturarErrores() {
    const errores = [];
    window.onerror = (msg, src, line) => {
      errores.push(`${msg} @${(src || '').split('/').pop()}:${line}`);
    };
    return errores;
  }

  function publicar(data, errores) {
    const div = document.createElement('div');
    div.id = 'selftest-result';
    div.textContent = JSON.stringify(data);
    document.body.appendChild(div);
    document.title = errores.length ? 'SELFTEST-ERRORES' : 'SELFTEST-OK';
  }

  function iniciarOnline({ params, world, input }) {
    const errores = capturarErrores();
    const total = parseInt(params.get('selftest'), 10) || 300;
    let ticks = 0;
    const visitados = new Set();
    let rumbo = null;
    let huyeHasta = -1;
    let huidaDir = null;
    let ultimaPos = '';
    let quieto = 0;

    const interval = setInterval(() => {
      try {
        if (!window.Net.activo || !world.level || !world.map) return;
        visitados.add(world.level.id);
        if (ticks >= total) {
          clearInterval(interval);
          input.reset('automation');
          window.Net.parar();
          publicar({
            ticks,
            nivel: world.level?.id,
            visitados: [...visitados],
            posicion: [world.player?.x, world.player?.y],
            mapa: world.map ? [world.map.grid.w, world.map.grid.h] : null,
            salud: world.player?.salud,
            sed: world.player?.sed,
            cordura: world.player?.cordura,
            inv: world.player?.inv,
            entidadesVivas: world.entities.filter((entity) => entity.viva).length,
            errores,
            erroresRender: window.__renderErrors || [],
            local: window.MODO_LOCAL && window.Local?.jugador ? {
              sed: window.Local.jugador.sed,
              salud: window.Local.jugador.salud,
              cordura: window.Local.jugador.cordura,
              posSala: [
                Math.round(window.Local.jugador.x * 10) / 10,
                Math.round(window.Local.jugador.y * 10) / 10,
              ],
              caminado: Math.round(window.Local.jugador._sedAcum || 0),
              rechazos: window.Local.jugador.rechazos,
              stats: window.Local.stats,
            } : null,
          }, errores);
          return;
        }
        ticks++;
        const card = document.getElementById('screen-card');
        if (card.style.display !== 'none') { document.getElementById('btn-enter').click(); return; }
        const choice = document.getElementById('choice-modal');
        if (choice?.style.display !== 'none') {
          const buttons = document.querySelectorAll('#choice-btns button');
          if (buttons.length) {
            const cross = Math.random() < 0.7;
            (cross ? buttons[0] : buttons[buttons.length - 1]).click();
            if (!cross) huyeHasta = ticks + 25;
          }
          return;
        }
        const positionKey = `${Math.round(world.player.x * 4)},${Math.round(world.player.y * 4)}`;
        if (positionKey === ultimaPos) {
          if (++quieto > 20 && huyeHasta < ticks) { huyeHasta = ticks + 15; quieto = 0; }
        } else {
          quieto = 0;
          ultimaPos = positionKey;
        }
        const grid = world.map.grid;
        const playerX = Math.round(world.player.x);
        const playerY = Math.round(world.player.y);
        if ((!rumbo || rumbo.nivel !== world.level.id) && world.map.exits.length) {
          let best = null;
          let bestDistance = Infinity;
          for (const exit of world.map.exits) {
            const distances = window.MapGen.bfsDist(grid, exit.x, exit.y);
            const distance = distances[playerY * grid.w + playerX];
            if (distance >= 0 && distance < bestDistance) {
              bestDistance = distance;
              best = distances;
            }
          }
          if (best) rumbo = { nivel: world.level.id, dist: best };
        }
        let dx = 0;
        let dy = 0;
        if (ticks < huyeHasta) {
          if (!huidaDir || Math.random() < 0.1) {
            const angle = Math.random() * Math.PI * 2;
            huidaDir = [Math.cos(angle), Math.sin(angle)];
          }
          [dx, dy] = huidaDir;
        } else if (rumbo?.nivel === world.level.id && Math.random() < 0.85) {
          const current = rumbo.dist[playerY * grid.w + playerX];
          for (const [moveX, moveY] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const x = playerX + moveX;
            const y = playerY + moveY;
            if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) continue;
            const value = rumbo.dist[y * grid.w + x];
            if (value >= 0 && (current < 0 || value < current)) { dx = moveX; dy = moveY; break; }
          }
        }
        if (!dx && !dy) {
          const angle = Math.random() * Math.PI * 2;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
        }
        const magnitude = Math.hypot(dx, dy) || 1;
        input.set('automation', dx / magnitude, dy / magnitude);
      } catch (error) {
        errores.push(String(error?.message || error));
        ticks++;
      }
    }, 100);
  }

  function iniciarTurnos({ params, world, cargarOverrides }) {
    const errores = capturarErrores();
    const total = parseInt(params.get('selftest'), 10) || 100;
    cargarOverrides();
    window.Game.startRun(params.get('seed') || 'selftest');
    if (params.get('arma')) {
      world.player.inv.push('fuego_griego', 'detector');
      world.player.manos[0] = 'tuberia';
    }
    setTimeout(() => document.getElementById('btn-enter')?.click(), 30);
    let acciones = 0;
    let marchaCache = null;
    const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];

    const interval = setInterval(() => {
      try {
        if (params.get('remodel') && acciones === 120 && !world.over) {
          window.__remodelResultado = [];
          for (let i = 0; i < 5; i++) window.__remodelResultado.push(world.remodelarZona());
        }
        if (acciones >= total || world.over) {
          clearInterval(interval);
          publicar({
            acciones,
            nivel: world.level?.id,
            visitados: world.visited,
            turnoTotal: world.turnTotal,
            pasosNivel: world.pasosNivel,
            objetivoCaminata: world._caminataObjetivo,
            posicion: [world.player?.x, world.player?.y],
            mapa: world.map ? [world.map.grid.w, world.map.grid.h] : null,
            salud: world.player?.salud,
            cordura: world.player?.cordura,
            inv: world.player?.inv,
            entidadesVivas: world.entities.filter((entity) => entity.viva).length,
            over: world.over,
            diario: world.journal.map((entry) => entry.nombre),
            errores,
            erroresRender: window.__renderErrors || [],
            remodel: window.__remodelResultado || null,
            ventanas: world.ventanaN || 0,
          }, errores);
          if (params.get('codex')) world.ui.toggleCodex(true);
          return;
        }
        const card = document.getElementById('screen-card');
        if (card.style.display !== 'none') { document.getElementById('btn-enter').click(); return; }
        const exitModal = document.getElementById('exit-modal');
        if (exitModal.style.display !== 'none') {
          const button = Math.random() < 0.7
            ? document.getElementById('btn-cross') : document.getElementById('btn-stay');
          if (button?.style.display !== 'none') button.click();
          else document.getElementById('btn-stay').click();
          acciones++;
          return;
        }
        const choiceModal = document.getElementById('choice-modal');
        if (choiceModal?.style.display !== 'none') {
          const buttons = document.querySelectorAll('#choice-btns button');
          if (buttons.length) buttons[Math.random() < 0.6 ? 0 : buttons.length - 1].click();
          acciones++;
          return;
        }
        if (world.busy) return;
        if (params.get('shift') && !window.__shiftForzado) {
          const grid = world.map.grid;
          let position = null;
          for (let x = grid.w - 2; x >= grid.w - 20 && !position; x--)
            for (let y = 1; y < grid.h - 1; y++)
              if (window.MapGen.walkable(window.MapGen.at(grid, x, y))) { position = [x, y]; break; }
          if (position) {
            world.player.x = world.player.rx = position[0];
            world.player.y = world.player.ry = position[1];
            window.__shiftForzado = true;
            window.Game.wait();
            acciones++;
            return;
          }
        }
        if (params.get('marcha')) {
          const grid = world.map.grid;
          const version = `${world.ventanaN || 0}:${world.mapaVersion || 0}`;
          if (!marchaCache || marchaCache.version !== version) {
            marchaCache = null;
            buscar: for (let targetX = grid.w - 2; targetX >= 1; targetX--)
              for (let targetY = 1; targetY < grid.h - 1; targetY++) {
                if (!window.MapGen.walkable(window.MapGen.at(grid, targetX, targetY))) continue;
                const distances = window.MapGen.bfsDist(grid, targetX, targetY);
                if (distances[world.player.y * grid.w + world.player.x] >= 0) {
                  marchaCache = { version, dist: distances };
                  break buscar;
                }
              }
          }
          let step = null;
          if (marchaCache) {
            const current = marchaCache.dist[world.player.y * grid.w + world.player.x];
            for (const [dx, dy] of directions) {
              const x = world.player.x + dx;
              const y = world.player.y + dy;
              if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) continue;
              const value = marchaCache.dist[y * grid.w + x];
              if (value >= 0 && value < current) { step = [dx, dy]; break; }
            }
          }
          if (step) window.Game.tryMove(step[0], step[1]);
          else { marchaCache = null; window.Game.tryMove(1, 0); }
          acciones++;
          return;
        }
        if (params.get('arma')) {
          const adjacent = world.entities.find((entity) => entity.viva &&
            Math.abs(entity.x - world.player.x) + Math.abs(entity.y - world.player.y) === 1);
          if (adjacent) {
            window.Game.tryMove(
              Math.sign(adjacent.x - world.player.x),
              Math.sign(adjacent.y - world.player.y)
            );
            acciones++;
            return;
          }
        }
        let direction = directions[Math.floor(Math.random() * directions.length)];
        if (Math.random() < 0.85 && world.map.exits.length) {
          const grid = world.map.grid;
          let best = null;
          let bestDistance = Infinity;
          for (const exit of world.map.exits) {
            const distances = window.MapGen.bfsDist(grid, exit.x, exit.y);
            const value = distances[world.player.y * grid.w + world.player.x];
            if (value >= 0 && value < bestDistance) { bestDistance = value; best = distances; }
          }
          if (best) {
            for (const [dx, dy] of directions) {
              const x = world.player.x + dx;
              const y = world.player.y + dy;
              if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) continue;
              const value = best[y * grid.w + x];
              if (value >= 0 && value < bestDistance) { direction = [dx, dy]; break; }
            }
          }
        }
        window.Game.tryMove(direction[0], direction[1]);
        acciones++;
      } catch (error) {
        errores.push(String(error?.message || error));
        acciones++;
      }
    }, 5);
  }

  function init(context) {
    const { params } = context;
    if (!params.get('selftest')) return;
    if (params.get('local') || params.get('online')) iniciarOnline(context);
    else iniciarTurnos(context);
  }

  window.SelfTest = { init };
})();
