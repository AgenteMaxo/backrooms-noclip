// Changelog: resumen jugable de cada versión, la más reciente primero.
// Pensado para el jugador, no para desarrollo — nada de nombres de archivo
// ni de jerga técnica. Añade una entrada nueva arriba del todo en cada
// tanda de cambios (junto con VERSION_JUEGO en main.js).
(function () {
  const CHANGELOG = [
    { v: 'v30.15', cambios: [
      'El modo UN JUGADOR estrena un Taller de Mods local para importar y previsualizar modelos de Blockbench. El contenido nunca se aplica al multijugador.',
      'El exportador de Blockbench crea archivos .brmod declarativos; el Alpha puede mostrar props, decoraciones y luminarias visuales sin ejecutar scripts de terceros.',
    ] },
    { v: 'v30.14', cambios: [
      'El menú principal estrena dos botones grandes: MULTIJUGADOR (azul) y UN JUGADOR (verde). (idea de Roykyu y Jaime Gaming)',
      'Al entrar en partida ahora CAES hacia las Backrooms: líneas de velocidad, retumbo y golpe al aterrizar. (idea de Jaime Gaming)',
      'Splash de presentación al cargar la página — se salta con cualquier tecla o clic. (idea de Jaime Gaming)',
      'Nuevo botón en el menú de pausa: «Noclipearse a la realidad» te saca de la partida y te devuelve al menú.',
    ] },
    { v: 'v30.13', cambios: [
      'Level 1 ahora sufre apagones globales: los fluorescentes fallan, el zumbido se corta y todas sus instancias quedan a oscuras a la vez durante unos segundos. La linterna sigue siendo útil. (josealmon)',
      'La sed baja más despacio y usar un objeto con la sed a cero ya no provoca una muerte instantánea: la deshidratación vuelve a causar daño gradual. (josealmon)',
      'Level 13, Level 14 y Level 45 estrenan ambiente sonoro propio, inspirado en la wiki. (Jake-7776)',
    ] },
    { v: 'v30.12', cambios: [
      'Level 0 ya no es un secarral: hay más botellas de agua de almendras por el suelo, más taquillas que registrar, y un resultado medio del dado (12-13) en sus taquillas ahora encuentra agua. El resto de niveles no cambia. (josealmon)',
    ] },
    { v: 'v30.11', cambios: [
      'El smog de Level 11 ahora pasa factura: respirarlo mucho tiempo sin protección desgasta la salud poco a poco. La máscara de gas, el traje AVMH y la protección química lo bloquean. (josealmon)',
      'La salida de Level 6 hacia Level 7 ya no es una puerta: como dice la wiki, se cruza vagando lo suficiente por la oscuridad. (josealmon)',
    ] },
    { v: 'v30.10', cambios: [
      'Arreglado el tirón al caminar: al mover o soltar el ratón la cámara daba un latigazo (parecía retroceder en el tiempo). Ahora la cámara va clavada a tu personaje, toques el ratón o no.',
      'La portada pierde los botones Exportar/Importar del expediente.',
    ] },
    { v: 'v30.9', cambios: [
      'Las salas concurridas van mucho más fluidas: los demás errantes se mueven suaves aunque haya decenas en pantalla, y ya no dan un salto brusco al reanudar la marcha tras estar quietos.',
      'En una multitud, los nombres y bocadillos de chat priorizan a los más cercanos en vez de apilarse ilegibles.',
    ] },
    { v: 'v30.7', cambios: [
      'El giro de cámara con el ratón (Pointer Lock) responde 1:1, sin el retardo de goma de antes; y el suavizado del resto de movimientos de cámara ya no depende de tus FPS.',
      'Nuevo tick en Ajustes: «mostrar FPS en pantalla».',
      'El modo espectador del guardián rota con ←/→ entre TODOS los errantes de todas las instancias y niveles, y la barra indica en qué nivel está el observado.',
    ] },
    { v: 'v30.6', cambios: [
      'La web carga MUCHO más rápida: la portada ya no descarga ningún asset del juego (sprites y sonidos llegan al entrar en partida) y desaparecen los cientos de peticiones fallidas que ensuciaban la consola y la red.',
      'La pestaña del navegador estrena favicon propio (la puerta pixel-art).',
    ] },
    { v: 'v30.5', cambios: [
      'Retirada la etiqueta «Teclado + Ratón / Mando» que flotaba arriba del HUD: los iconos de los avisos ya cambian solos según tu dispositivo.',
    ] },
    { v: 'v30.4', cambios: [
      'El modo SIN CONEXIÓN es ahora el mismo juego que el online: movimiento libre, cámara, entidades y todas las mecánicas, con un servidor local corriendo dentro de tu navegador. (El antiguo modo por turnos queda aparcado.)',
      'La remodelación no euclidiana de los niveles vuelve en el modo sin conexión: los pasillos pueden dejar de llevar al mismo sitio.',
      'En el modo sin conexión, la fila 🐞 Debug de Ajustes funciona con cualquier clave: es tu propio mundo.',
      'La pantalla de título estrena fondo panorámico animado y una distribución nueva que cabe entera en cualquier pantalla, sin barras de scroll. (andresaavelasquez-ctrl)',
      'Los avisos y atajos muestran los botones de TU mando (iconos Xbox/PlayStation) y el HUD indica el dispositivo activo; en el mapa tu posición es una flecha orientada y tus marcas sobreviven a recargas. (treblalbert)',
      'Arreglado: importar un expediente incompleto o dañado podía dejar el juego con un error en cada carga; ahora se recupera lo válido y se rechaza lo irrecuperable sin tocar tu perfil. (juanlotito)',
    ] },
    { v: 'v30.3', cambios: [
      'Los árboles de los niveles de bosque (Level 45, 186, 626 y 6.1) ahora son 3D de verdad: troncos y ramas nudosas con volumen, en vez de recortes planos que giraban contigo. Cada árbol es único y siempre el mismo en cada semilla.',
    ] },
    { v: 'v30.2', cambios: [
      'Arreglada la iluminación de los niveles claros (poolrooms, nieve, hospitales…): un resplandor desbocado los dejaba en blanco puro y no se veía nada. El brillo vuelve a ser el de diseño: solo relucen los fluorescentes, los boquetes y el rótulo EXIT.',
      'Los niveles muy blancos ahora ajustan solos su luz y exposición: siguen siendo cegadores de tema, pero se ve por dónde caminas.',
    ] },
    { v: 'v30.1', cambios: [
      'Arreglado de raíz: la música del menú podía seguir sonando dentro de la partida (pasaba sobre todo si tu primer clic al cargar la página era directamente DESPERTAR).',
    ] },
    { v: 'v30', cambios: [
      'El guardián estrena Sala de Control: un mapa en vivo de todos los niveles para los directos, con retos y anuncios. Si notas que alguien te observa… probablemente sea él.',
    ] },
    { v: 'v28.10', cambios: [
      'La portada ahora muestra cuántos errantes están conectados en este momento. (josealmon)',
      'Arreglado (multijugador): cerrar el códice o el changelog con ESC o su tecla podía dejar la cámara sin responder al clic. (Gartixr)',
      'Arreglado (multijugador): el sprite del personaje parpadeaba entre dos poses al andar en diagonal, y elegía mal el lado con la cámara girada. (Gartixr y carlosdiezm)',
      'Arreglado (multijugador): los nombres y bocadillos de jugadores situados detrás de la cámara ya no se dibujan delante. (Gartixr)',
      'Los pasos suenan a un ritmo creíble y proporcional a lo que avanzas (antes sonaban a metralleta), con ligera variación de tono entre zancadas. (Gartixr)',
    ] },
    { v: 'v28.9', cambios: [
      'Nuevo comando de guardián /reiniciar: reinicia el servidor desde el chat — avisa a todos y el mundo vuelve solo en unos segundos (las fichas de jugador se conservan).',
    ] },
    { v: 'v28.8', cambios: [
      'El riesgo de caer al Vacío al cruzar una salida arriesgada ya funciona también en multijugador (antes solo en modo solo). (AgenteMaxo)',
      'Nueva salida de emergencia en Level 0 hacia Level 14: puerta roja con rótulo EXIT y luz de emergencia, distinta a cualquier otra puerta del juego. (AgenteMaxo)',
      'Nueva Sala Manila en Level 0: una sala tranquila con luz anaranjada tenue. Quedarse dentro varios minutos te lleva, sin avisar, a Level 1 o Level 2. (AgenteMaxo)',
      'Retirado el sistema de Sintonía/Instintos (el ojo amarillo y las cartas de habilidad al cruzar ciertos umbrales) en modo solo. (AgenteMaxo)',
    ] },
    { v: 'v28.7', cambios: [
      'Las manchas de humedad del suelo ya no se repiten en un patrón visible, ahora se reparten al azar. (carlosdiezm)',
      'Arreglado: el menú de configuración del mando no se cerraba bien con ESC. (carlosdiezm)',
    ] },
    { v: 'v28.6', cambios: [
      'Arreglado (multijugador): algunas entidades podían golpear casi al instante, sin dar tiempo a esquivar el aviso. (josealmon)',
      'Nueva protección de 3 segundos al entrar por primera vez a cada nivel, para no morir nada más cruzar. (josealmon)',
    ] },
    { v: 'v28.5', cambios: [
      'Arreglado: la música del menú a veces seguía sonando después de empezar la partida.',
      'Los campos de contraseña ya no se rellenan solos con datos guardados del navegador.',
    ] },
    { v: 'v28.4', cambios: [
      'Más retoques en el sprite del jugador.',
    ] },
    { v: 'v28.2', cambios: [
      'Nuevo HUD vertical de equipamiento (cara/cuerpo/pies) en la esquina inferior izquierda.',
      'Retoques en el sprite del jugador.',
    ] },
    { v: 'v28.0', cambios: [
      'Arreglado (multijugador): las salidas de destino aleatorio a veces daban "nivel fuera del piloto" en vez de cruzar de verdad.',
      'Arreglado (multijugador): las entidades y el propio jugador podían no verse en el render 2D clásico.',
      'Arreglado: los sonidos MP3 propios ahora respetan el volumen de Efectos.',
      'Música ambiental real para Level 2 y Level 15, y nuevos efectos de sonido (dado, pasos, registrar contenedores).',
      'Música de menú en la pantalla de título, con selector para cambiarla o silenciarla.',
      'Nueva opción de cámara "bloqueada": sigue automáticamente detrás del personaje al caminar hacia adelante.',
      'Nuevo selector de resolución interna y de límite de FPS en Ajustes.',
      'La interfaz ya no se recorta en pantallas bajas: los paneles hacen scroll si hace falta.',
      'El Changelog y el Códice ahora se cierran con ESC o con un botón "X", además de su botón de siempre.',
      'Nuevos sprites propios para 11 objetos del inventario.',
    ] },
    { v: 'v27.11', cambios: [
      'Arreglado (multijugador): un pequeño tirón o parón del navegador podía hacerte "rebotar" hacia atrás al moverte.',
    ] },
    { v: 'v27.10', cambios: [
      'Arreglado (multijugador): los objetos del suelo ya recogidos no vuelven a aparecer al volver a entrar a la misma sala.',
      'Los objetos encontrados en multijugador ahora también se registran en el códice.',
    ] },
    { v: 'v27.9', cambios: [
      'Arreglado (multijugador): recoger dos objetos casi seguidos podía hacer que el segundo desapareciera del mundo sin llegar a tu mochila.',
    ] },
    { v: 'v27.8', cambios: [
      'Arreglado: usar la Llave de Nivel y elegir un destino podía dejarte sin el botón CRUZAR en cualquier salida el resto de la partida.',
    ] },
    { v: 'v27.7', cambios: [
      'Nuevos sprites del personaje, y una capa visual sobre él cuando llevas puesta la máscara de gas.',
      'Los iconos de la mochila y del HUD ahora también admiten arte personalizado.',
    ] },
    { v: 'v27.6', cambios: [
      'Música ambiental real para Level 6 ("Lights Out").',
    ] },
    { v: 'v27.5', cambios: [
      'Arreglado: en móvil los controles táctiles no aparecían nunca.',
      'Nuevo joystick para moverte libremente en el modo multijugador, y botón de Ajustes táctil.',
      'Arreglado: moverte "hacia adelante" en el móvil a veces se desviaba en diagonal sin querer.',
    ] },
    { v: 'v27.4', cambios: [
      'Nuevo panel "Observatorio del Guardián": el streamer puede ver en vivo quién juega, moderar (expulsar/banear) y consultar estadísticas del servidor.',
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

  // aviso de "hay novedades" en el botón de título: compara con la última
  // versión vista guardada en localStorage, no con VERSION_JUEGO (este script
  // carga antes que main.js en el orden de <script> de index.html)
  const CLAVE_VISTO = 'backrooms-changelog-visto';
  const ultima = CHANGELOG[0].v;

  function marcarNovedadSiHace() {
    const boton = document.getElementById('btn-changelog');
    if (boton && localStorage.getItem(CLAVE_VISTO) !== ultima) boton.classList.add('novedad');
  }

  function marcarVisto() {
    localStorage.setItem(CLAVE_VISTO, ultima);
    const boton = document.getElementById('btn-changelog');
    if (boton) boton.classList.remove('novedad');
  }

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

  window.Changelog = { render, marcarVisto };
  marcarNovedadSiHace();
})();
