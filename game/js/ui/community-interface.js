// Organización visual de Ajustes sin alterar los IDs ni listeners existentes.
// Mover un nodo conserva sus eventos, por lo que funciona igual en online y solo.
(function () {
  'use strict';

  function rowOf(id) {
    return document.getElementById(id)?.closest('.sound-row') || null;
  }

  function details(title, open, nodes) {
    const box = document.createElement('details');
    box.className = 'settings-group';
    box.open = open;
    const summary = document.createElement('summary');
    summary.textContent = title;
    const body = document.createElement('div');
    body.className = 'settings-group-body';
    for (const node of nodes) if (node && !body.contains(node)) body.appendChild(node);
    box.append(summary, body);
    return box;
  }

  function unique(nodes) {
    return [...new Set(nodes.filter(Boolean))];
  }

  function organizarAjustes() {
    const menu = document.getElementById('sound-menu');
    const modal = menu?.querySelector('.modal-box');
    if (!modal || modal.classList.contains('settings-polished')) return;

    modal.classList.add('settings-polished');
    const heading = modal.querySelector(':scope > h3');
    const subtitle = document.createElement('p');
    subtitle.className = 'settings-subtitle';
    subtitle.textContent = 'Audio, imagen y cámara en un único expediente de sistema.';
    heading?.insertAdjacentElement('afterend', subtitle);

    const layout = document.createElement('div');
    layout.className = 'settings-layout';

    const audio = unique([
      rowOf('snd-general'), rowOf('snd-fx'), rowOf('snd-amb'), rowOf('opt-dado'),
    ]);
    const graphics = unique([
      rowOf('opt-fps-ver'), rowOf('opt-resolucion'), rowOf('opt-fps'), rowOf('btn-fullscreen'),
    ]);
    const camera = unique([
      rowOf('opt-camara-modo'), document.getElementById('row-camara-seguimiento'),
      rowOf('opt-camara-invertir'), rowOf('opt-camara-sens'),
    ]);
    const advanced = unique([
      document.getElementById('admin-row'), document.getElementById('admin-msg'),
      document.getElementById('debug-container'), document.getElementById('ctrl-list'),
    ]);

    layout.append(
      details('SONIDO', true, audio),
      details('GRÁFICOS Y RENDIMIENTO', true, graphics),
      details('CÁMARA Y CONTROLES', false, camera),
      details('AVANZADO', false, advanced),
    );

    const footer = modal.querySelector(':scope > .modal-btns');
    const version = document.getElementById('ajustes-version');
    if (footer) modal.insertBefore(layout, footer);
    else modal.appendChild(layout);
    if (version && footer) modal.insertBefore(version, footer);
  }

  function mejorarMoodles() {
    const wrap = document.getElementById('moodles');
    if (!wrap) return;
    wrap.setAttribute('aria-label', 'Estado del errante');
    wrap.setAttribute('aria-live', 'polite');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      organizarAjustes();
      mejorarMoodles();
    }, { once: true });
  } else {
    organizarAjustes();
    mejorarMoodles();
  }
})();
