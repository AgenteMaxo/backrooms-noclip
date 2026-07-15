// Tarjetas de nivel, dado y decisiones que pausan la partida.
(function () {
  function create({ world, $, showScreen }) {
    function mostrarTarjetaNivel(definition, onEnter) {
      showScreen('card');
      if (window.Sfx) { Sfx.play('ui'); Sfx.idle(true); }
      const colors = ['#3fae6a', '#8bb944', '#d9a531', '#e0742c', '#d94a35', '#a12744'];
      $('card-danger').style.background = colors[definition.peligro] || '#888';
      $('card-name').textContent = definition.nombre;
      $('card-class').textContent = `${definition.clase} · Peligro ${definition.peligro}/5 · ${definition.bioma}`;
      $('card-desc').textContent = definition.descripcion;
      $('card-quote').textContent = `«${definition.cita}»`;
      const rulesElement = $('card-rules');
      rulesElement.innerHTML = '';
      const chip = (icon, text) => {
        const element = document.createElement('span');
        const id = window.Icons ? (Icons.has(icon) ? icon : Icons.deEmoji(icon)) : null;
        if (id) element.appendChild(Icons.img(id, 13));
        else if (icon) element.appendChild(document.createTextNode(icon));
        element.appendChild(document.createTextNode(` ${text}`));
        return element;
      };
      for (const ruleId of definition.reglas || []) {
        const rule = Rules.get(ruleId);
        if (!rule) continue;
        const element = chip(rule.icono, rule.nombre);
        element.title = rule.desc;
        rulesElement.appendChild(element);
      }
      if (definition.esEscape) {
        const element = chip('estrella', 'POSIBLE RUTA DE ESCAPE');
        element.style.borderColor = '#4ade80';
        element.style.color = '#8ae8a0';
        rulesElement.appendChild(element);
      }
      $('card-wiki').href = definition.url;
      $('btn-enter').onclick = () => {
        if (window.Sfx) Sfx.idle(false);
        showScreen('game');
        onEnter();
      };
    }

    function mostrarDado(text, callback, decidedResult) {
      if (document.pointerLockElement) document.exitPointerLock();
      const roll = () => Number.isInteger(decidedResult)
        ? decidedResult
        : 1 + Math.floor(Math.random() * 20);
      if (window.OPTS && !window.OPTS.dado) {
        setTimeout(() => callback(roll()), 120);
        return;
      }
      const overlay = $('dice-overlay');
      const face = $('dice-face');
      $('dice-text').textContent = text;
      overlay.style.display = 'flex';
      face.classList.add('rolling');
      let ticks = 0;
      const animation = setInterval(() => {
        face.textContent = 1 + Math.floor(Math.random() * 20);
        if (++ticks <= 14) return;
        clearInterval(animation);
        const result = roll();
        face.textContent = result;
        face.classList.remove('rolling');
        setTimeout(() => {
          overlay.style.display = 'none';
          callback(result);
        }, 900);
      }, 70);
    }

    function ocultarSalida() {
      $('exit-modal').style.display = 'none';
      world.busy = false;
    }

    function mostrarSalida(definition) {
      if (document.pointerLockElement) document.exitPointerLock();
      world.busy = true;
      if (definition.tipo !== 'retorno' && world.level) {
        Game.Profiles.registrarDescubierto(
          'salidas', `${world.level.id}::${definition.texto}`
        );
      }
      $('exit-modal').style.display = 'flex';
      $('exit-text').textContent = definition.texto;
      const warning = $('exit-warn');
      const destinationName = definition.destino && world.data.levels[definition.destino]
        ? world.data.levels[definition.destino].wikiTitle
        : null;
      if (definition.tipo === 'retorno') {
        warning.textContent = `↩ Volver por donde viniste → ${destinationName ?? '???'}`;
      } else if (definition.tipo === 'escape') {
        warning.textContent = '⭐ Parece un camino de vuelta a la realidad.';
      } else if (definition.tipo === 'sellada') {
        warning.textContent = '⌀ El camino se pierde en niveles sin cartografiar.';
      } else if (definition.tipo === 'llave') {
        warning.textContent = '🗝 Requiere una Llave de Nivel.';
      } else if (definition.tipo === 'arriesgada' && definition.riesgoVoid > 0) {
        warning.textContent = `⚠ Camino inestable (riesgo de caer al Vacío) → ${destinationName ?? '???'}`;
      } else {
        warning.textContent = destinationName ? `→ ${destinationName}` : '→ ¿?';
      }
      $('btn-cross').style.display = '';
      $('btn-cross').onclick = () => { ocultarSalida(); Game.crossExit(definition); };
      $('btn-stay').onclick = ocultarSalida;
    }

    function mostrarSelectorNivel(ids, callback) {
      if (document.pointerLockElement) document.exitPointerLock();
      world.busy = true;
      const modal = $('exit-modal');
      modal.style.display = 'flex';
      $('exit-text').innerHTML = 'La Llave gira. ¿Qué puerta abres?<br><br>';
      const warning = $('exit-warn');
      warning.innerHTML = '';
      for (const id of ids) {
        const button = document.createElement('button');
        button.className = 'btn-small';
        button.style.margin = '3px';
        button.textContent = world.data.levels[id].wikiTitle;
        button.onclick = () => {
          modal.style.display = 'none';
          world.busy = false;
          callback(id);
        };
        warning.appendChild(button);
      }
      $('btn-cross').onclick = null;
      $('btn-cross').style.display = 'none';
      $('btn-stay').onclick = () => {
        modal.style.display = 'none';
        $('btn-cross').style.display = '';
        world.busy = false;
      };
    }

    function mostrarEleccion(title, text, options) {
      if (document.pointerLockElement) document.exitPointerLock();
      world.busy = true;
      $('choice-title').textContent = title;
      $('choice-text').textContent = text;
      const buttons = $('choice-btns');
      buttons.innerHTML = '';
      options.forEach((option, index) => {
        const button = document.createElement('button');
        button.className = index === 0 ? 'btn-big' : 'btn-small';
        if (index === 0) {
          button.style.fontSize = '12px';
          button.style.padding = '11px 20px';
        }
        button.textContent = option.label;
        button.onclick = () => {
          $('choice-modal').style.display = 'none';
          if ($('exit-modal').style.display === 'none' && $('dice-overlay').style.display === 'none') {
            world.busy = false;
          }
          if (window.Sfx) Sfx.play('ui');
          option.cb?.();
        };
        buttons.appendChild(button);
      });
      $('choice-modal').style.display = 'flex';
    }

    return {
      mostrarTarjetaNivel, mostrarDado, mostrarSalida, mostrarSelectorNivel, mostrarEleccion,
    };
  }

  window.UiModals = { create };
})();
