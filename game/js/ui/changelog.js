// Changelog: resumen jugable de cada versión, la más reciente primero.
// Pensado para el jugador, no para desarrollo — nada de nombres de archivo
// ni de jerga técnica. Añade una entrada nueva arriba del todo en cada
// tanda de cambios (junto con VERSION_JUEGO en main.js).
(function () {
  const CHANGELOG = [
    { v: 'v28.7', cambios: [
      'El pelo ahora se dibuja por delante de la ropa (antes podía quedar tapado por cuellos o capuchas).',
    ] },
    { v: 'v28.6', cambios: [
      'Arreglado: la miniatura de "Parte superior" se veía estirada en el personalizador.',
      'Nueva opción "Sin ropa" en la parte superior del personalizador.',
    ] },
    { v: 'v28.5', cambios: [
      'La ropa (parte superior e inferior) ya puede animarse al caminar, igual que el resto del personaje.',
    ] },
    { v: 'v28.4', cambios: [
      'Ajuste técnico interno en cómo se cargan las prendas de "Parte superior"/"Parte inferior" — sin cambios para el jugador.',
    ] },
    { v: 'v28.3', cambios: [
      'La ropa se divide ahora en "Parte superior" y "Parte inferior", cada una con sus propias opciones.',
    ] },
    { v: 'v28.2', cambios: [
      'Más colores fantasía para el cabello y el vello facial (rosa, azul, violeta, verde, rojo), además de los naturales.',
      'El personalizador ya no tiene tope fijo de estilos por categoría — se irán sumando más opciones de pelo, ojos, vello y ropa con el tiempo.',
    ] },
    { v: 'v28.1', cambios: [
      'Personalización ampliada: ahora también podés elegir vello facial (o dejarlo sin barba) y el tono de piel de tu personaje.',
    ] },
    { v: 'v28.0', cambios: [
      'Nuevo botón "Personalizar" en el título: elegí estilo y color de pelo, ojos y ropa antes de despertar en Level 0.',
      'Tu apariencia ahora se ve también para los demás jugadores en la partida online.',
    ] },
    { v: 'v27.2', cambios: [
      'Nueva pestaña Changelog en la pantalla de título: qué ha cambiado en cada versión, resumido.',
    ] },
    { v: 'v27.1', cambios: [
      'El guardián ya puede cambiar su propia clave sin ayuda técnica (comando /admin-clave).',
    ] },
    { v: 'v27.0', cambios: [
      'El guardián puede darse objetos directamente (comando /give).',
      'Arreglado: arrastrar objetos en la mochila con el ratón no funcionaba bien en ordenador.',
      'Árboles secos rediseñados con más detalle.',
      'Mejor rendimiento en pantalla completa en monitores de alta resolución.',
    ] },
    { v: 'v26.9', cambios: [
      'Arreglado: podías aparecer atrapado dentro de una pared en Level 0 al desplazarse el mapa.',
      'La puerta de vuelta a tu nivel anterior ya sobrevive a "Continuar partida guardada".',
    ] },
    { v: 'v26.8', cambios: [
      'El Despojo (Level 996) ahora también te quita las manos y la ropa puesta, no solo la mochila.',
    ] },
    { v: 'v26.7', cambios: [
      'Arreglado: morir ya no dejaba el equipo puesto (botas, máscara...) con su bonus activo para siempre.',
    ] },
    { v: 'v26.6', cambios: [
      'Arreglada una fuga de memoria del servidor en sesiones largas.',
    ] },
    { v: 'v26.5', cambios: [
      'La cordura y la sed bajaban demasiado rápido — corregido al ritmo pensado.',
      'La máscara de gas ahora sí reduce el desgaste mental de verdad.',
      'La cámara libre (Pointer Lock) pasa a ser el modo por defecto.',
    ] },
    { v: 'v26.4', cambios: [
      'Catálogo de objetos ampliado de 13 a 84: armas, gases, teletransporte corto, curaciones y mucho más.',
    ] },
    { v: 'v26.3', cambios: [
      'Pequeña animación al usar un objeto con la mano.',
      'Ajustes visuales en el menú de Opciones.',
    ] },
    { v: 'v26.2', cambios: [
      'Modo de cámara Pointer Lock añadido como alternativa, con sensibilidad e inversión configurables.',
      'Efectos visuales cuando la cordura baja mucho: niebla, parpadeos, temblor de cámara.',
    ] },
    { v: 'v26.1', cambios: [
      'La cámara ahora gira con el CLIC DERECHO y el sentido del giro se corrigió.',
    ] },
    { v: 'v26', cambios: [
      'Los dados son de verdad deterministas por semilla: misma semilla, mismas tiradas.',
      'Arreglos de IA de entidades y de esconderse en taquillas/muebles.',
      'Generación de mapas más estable (menos niveles rotos).',
      'Bioma propio para los hospitales, distinto de las oficinas.',
      'Más salidas y niveles fieles a la wiki.',
      'Salas privadas opcionales para jugar solo con tu grupo.',
      'Soporte para mando/gamepad.',
      'Adaptación a pantallas de móvil con controles táctiles.',
      'Anotaciones propias en el minimapa.',
      'El Smiler tiene ahora sprite y sonido propios.',
    ] },
    { v: 'v25', cambios: [
      'El botín de cajas y contenedores es individual: lo que ves tú no lo ven los demás.',
      'Cámara libre con el ratón en tercera persona.',
      'Pantalla completa de verdad, sin bordes negros.',
    ] },
    { v: 'v24', cambios: [
      'Arreglo definitivo del lag al moverte: tu ordenador calcula tu movimiento y el servidor solo lo comprueba.',
    ] },
    { v: 'v23', cambios: [
      'Varias tandas de ajuste fino de la red: menos tirones al moverte y mejor sincronización con otros jugadores.',
      'Puerta de vuelta automática al cruzar a un nivel nuevo.',
      'Menú de Ajustes con clave de guardián para moderación.',
    ] },
    { v: 'v22', cambios: [
      'Nace BACKROOMS MMO: un mundo compartido en tiempo real con otros jugadores.',
    ] },
    { v: 'v21', cambios: [
      'Primeros pasos del modo multijugador.',
    ] },
  ];

  function render(cont) {
    if (!cont || cont.childElementCount) return; // contenido estático: se pinta una sola vez
    const frag = document.createDocumentFragment();
    CHANGELOG.forEach((entrada, i) => {
      const det = document.createElement('details');
      det.className = 'cdx';
      if (i === 0) det.open = true;
      const sum = document.createElement('summary');
      sum.textContent = entrada.v;
      det.appendChild(sum);
      const ul = document.createElement('ul');
      ul.className = 'changelog-ul';
      for (const c of entrada.cambios) {
        const li = document.createElement('li');
        li.textContent = c;
        ul.appendChild(li);
      }
      det.appendChild(ul);
      frag.appendChild(det);
    });
    cont.appendChild(frag);
  }

  window.Changelog = { render };
})();
