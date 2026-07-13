# 📖 MANUAL DEL JUEGO — Backrooms: No-Clip

Guía de todo lo que puedes hacer/modificar tú mismo, sin programar.
*(Este archivo se mantiene actualizado con cada versión del juego.)*

---

## 1. Jugar

**Doble clic en `game/index.html`.** Nada que instalar. Funciona sin internet.

**Modo sin conexión = el MISMO juego que el online.** El botón pequeño «jugar sin
conexión (modo solo)» de la portada arranca una partida en solitario con un
**servidor local dentro de tu navegador**: mismas reglas, mismo movimiento libre,
misma cámara, mismas entidades — literalmente el mismo código que usa el servidor
real. Extras del modo local: los comandos de guardián `/tp <nivel>` y `/give <objeto>`
funcionan con cualquier clave (es tu mundo), y la **remodelación no euclidiana**
de los niveles está activa (online sigue apagada). Cada carga de página es una run
nueva (como reconectar online); el Códice sí conserva tus descubrimientos.
Por URL: `?local=1` (y `?nivel=level-N` para saltar a un nivel). El antiguo modo
por turnos queda aparcado en `?autostart=1` como referencia.

El juego se renderiza en **3D real en TERCERA PERSONA** (motor Three.js incluido): la cámara
va pegada a la espalda del errante, los niveles interiores tienen **techo real con
fluorescentes**, bloom cinematográfico y polvo en suspensión. Alternativas por URL:
`?cam=alta` (cámara cenital estilo Octopath de versiones anteriores), `?render=2d` (vista
2D clásica), `?nofx=1` (sin efectos, por si va lento).

| Tecla | Acción |
|---|---|
| W / A / S / D | Moverte: adelante, izquierda, atrás y derecha **respecto a la cámara** (online) |
| RATÓN (mantener y arrastrar) | Girar la cámara alrededor del personaje, estilo Roblox (online; respeta las paredes) |
| ESPACIO | Interactuar: salidas, muebles registrables, **beber agua**… |
| X | Esperar un turno |
| F | Linterna (debe estar EN UNA MANO): cono de luz real (¡atrae a las Deathmoths!) |
| B | Abrir/cerrar la **mochila** |
| M (o N) | Ver el mapa de lo explorado |
| L | Registro completo de mensajes (también con el botón-pergamino de arriba) |
| J | Diario de ruta de la partida |
| C | Códice del Errante (expediente y colección) |
| 1-6 | Usar objeto de la mochila |
| ESC | **Ajustes**: volumen, pantalla completa, opciones, versión del juego y la caja 🔑 de guardián |
| Q (o clic en su caja) | **Usar la mano izquierda** (linterna, tubería, fuego griego…) |
| E (o clic en su caja) | **Usar la mano derecha** (los objetos a 2 manos solo responden a Q) |

*(Mantener pulsada W camina a velocidad constante — sin ráfagas.)*

- **Objetivo**: encontrar una de las rarísimas rutas de escape (⭐). La muerte es permanente.
- **HUD contextual**: no hay barras de vida ni contador de turnos. Tu personaje **piensa en
  bocadillos** («Tengo la garganta seca…», «Estoy malherido…») y su propio sprite se ve
  ensangrentado cuando está grave. Además, cuando un estado empeora aparecen **iconos de
  estado** (estilo Project Zomboid) arriba a la derecha: ♥ salud, ☯ cordura, 💧 sed, 🍞 hambre —
  amarillo → naranja → rojo (pulsante) según la gravedad.
- **Registro**: los mensajes aparecen pequeños arriba a la izquierda y se desvanecen solos;
  el historial completo está tras el **botón-pergamino** (o tecla `L`).
- **Volver atrás**: ya no hay tecla mágica. La única manera de regresar es **la puerta por la
  que llegaste** (queda marcada donde apareces) — y cada nivel se conserva TAL CUAL lo
  dejaste. Excepción: si CAÍSTE (agujero, trampilla, vacío), no hay vuelta: nadie escala eso.
- **Salidas con mecánica propia (v20)**: las salidas ya no son solo puertas. Las que en la
  wiki dicen «romper una pared» aparecen como una **pared agrietada** (suena hueca al
  pisarla): ESPACIO para intentar romperla — a puñetazos cuesta y duele; con la tubería EN
  MANO es mucho más fácil. Al ceder, se abre un boquete de luz blanca y puedes cruzar. Las
  que dicen «caminar sin rumbo hasta…» no tienen casilla: tras MUCHOS turnos andando por el
  nivel, el paisaje «cede» y te ofrece cruzar. Los mapas son ahora más grandes (el Level 0 es
  ENORME y ya no "petardea": se genera entero de una vez con tu semilla) y las salidas están
  repartidas por rincones opuestos — piérdete de verdad.
- **Manos y mochila**: dos ranuras de mano (abajo a la derecha) + mochila de 6 huecos (`B`).
  La linterna y las armas solo funcionan **empuñadas**: arrastra el objeto a una mano — en el
  propio panel de la mochila o en el HUD — (o botón EMPUÑAR en su ficha). Clic en una mano la
  guarda de vuelta; también puedes arrastrar la mano a la rejilla. Los pasivos (chaqueta,
  trébol, detector…) funcionan con solo llevarlos encima.
- **Usar las manos**: tecla `Q` = mano izquierda, `E` = mano derecha — o clic directo en la
  caja de esa mano (los atajos aparecen en la esquinita de cada caja). Linterna: enciende/
  apaga. Tubería: golpe frontal a la casilla que encaras. Fuego griego (2 manos) y guante:
  se descargan. Un objeto a 2 manos solo responde a `Q`.
- **Tirar objetos**: en la ficha de cualquier objeto de la mochila (clic sobre él) está el
  botón «Tirar al suelo»: lo deja a tus pies y puedes recogerlo después.
- **Equipamiento (ropa)**: la mochila tiene la fila «Vistiendo» con tres ranuras — **cara**
  (máscara de gas: desgaste mental ambiental a la mitad), **cuerpo** (chaqueta térmica: anula
  el frío) y **pies** (botas reforzadas: inmune a charcos sirena, detección −1). La ropa solo
  protege PUESTA: arrástrala a su ranura o botón PONERSE en su ficha; clic en la ranura para
  quitarla. Debajo verás tus **buffs y debuffs** activos — pasa el ratón para leer qué hacen.
- **Iconos de estado**: pasa el ratón por los círculos de arriba a la derecha para ver
  exactamente qué te aflige y cómo remediarlo.
- **Cajas y contenedores**: taquillas, archivadores, neveras, cajas… TODOS se pueden
  registrar con ESPACIO (dado de botín). Ya no hay cajas de atrezzo que confundan.
  **Online (v25) el botín es INDIVIDUAL**: cada jugador tiene su propia copia de cajas y
  objetos del suelo — nadie te «roba» la tubería; lo que ya registraste queda recordado en
  tu navegador. La tirada de dado es tuya (los demás no la ven).
- **Pantalla completa (v25)**: el botón de Ajustes ahora extiende el juego a TODA la
  pantalla, re-renderizando a la resolución del monitor (nada de cuadro con bordes).

## 2b. Combate y escape

- **Telegraph**: toda entidad ANUNCIA su golpe un turno antes (⚠ y parpadeo ámbar).
  Si te mueves ese turno, el golpe falla. El Cazador solo avisa la primera vez.
- **Ruido**: registrar muebles, golpear (y fallar) hace ruido; las entidades que no te
  cazan van a investigar el sonido.
- **Arrojar** (botón en la ficha del objeto): lanzas el objeto lejos y el golpe DISTRAE de
  verdad — las entidades cercanas van hacia el ruido 3 turnos (aunque te estén cazando), y
  hasta el Cazador se detiene 2 turnos a escuchar. El objeto queda en el suelo.
- **Despistar**: si una entidad pasa 3 turnos sin detectarte, abandona la caza.
- **Esconderse**: sobre una taquilla/nevera/archivador YA REGISTRADO, pulsa ESPACIO para
  meterte dentro (y ESPACIO para salir). Si no te vieron entrar, pierden tu rastro; si te
  encuentran dentro, el zarpazo duele un 50 % más.
- **Interacciones libres**: si hay agua, PUEDES bebértela (ESPACIO)… la wiki decide si era
  buena idea. Este patrón irá creciendo: el juego te deja hacer, el lore responde.
- El **mapa** (`M`) dibuja solo lo explorado y lo conserva; si el nivel se reorganiza
  (Level 0, 27…) lo oirás como un derrumbe y esa zona vuelve a quedar sin cartografiar.
- **Salidas rituales**: algunas salidas no son puertas — son el objeto exacto que dice la wiki
  (la nave de juguete de Level 483, el reloj digital de Level 80…). Todas las salidas
  documentadas de cada nivel están en el juego (las de fuera del piloto, grises/selladas).

### Combate y defensa

- **Tubería oxidada** 🔧: mientras la lleves, **muévete HACIA una entidad adyacente para
  golpearla** (daño + retroceso). Ojo: golpear al Silver Slime te salpica ácido.
- **Fuego griego** 🔥 (Object 5): úsalo (tecla de su ranura) → quema y ahuyenta todo en radio 3. Un uso.
- **Guante de parálisis** 🧤 (Object 69): úsalo → inmoviliza 6 turnos a lo adyacente. Un uso.
- **Detector de entidades** 📡 (Object 30): pasivo → entidades cercanas en el minimapa.
- **Trébol de la suerte** 🍀 (Object 13): pasivo → +2 a todas tus tiradas de dado.
- Matar entidades cuesta un poco de cordura: en las Backrooms nada sale gratis.

## 2. Semillas (partidas compartibles)

En la pantalla de título puedes escribir una **semilla** (ej. `moqueta-777`). La misma semilla
genera exactamente los mismos mapas. Ideal para que tu chat juegue tu misma partida.

## 3. Perfiles y Códice

- Crea tu perfil en el título (puedes tener varios: uno por serie, uno para el chat…).
- El **Códice** (tecla `C`) guarda para siempre: niveles transitados con su descripción,
  veces visitado, mejor marca de turnos, escapes y tu historial de expediciones.
- **Colección** (dentro del códice): TODAS las entidades, objetos y salidas de cada nivel
  aparecen como coleccionables tapados con «???» (las entidades, como siluetas negras)
  hasta que los descubres jugando: ver una salida la desbloquea, avistar una entidad la
  revela, recoger un objeto lo cataloga. Ideal para completistas del stream.
- **Exportar** descarga tu perfil como archivo JSON (guárdalo como copia de seguridad).
- **Importar** lo restaura en otro navegador u ordenador.
- ⚠️ Los perfiles viven en el navegador: si borras los datos de navegación, se pierden
  (por eso conviene exportar de vez en cuando).

## 4. Para el directo (OBS)

- Captura la ventana del navegador como cualquier fuente de ventana.
- **Arranque rápido por URL** (útil como acceso directo del stream):
  - `index.html?seed=misemilla` — semilla precargada
  - `index.html?seed=misemilla&autostart=1` — entra directo a jugar, sin menús
- El texto del juego es grande y de alto contraste a propósito para que se lea en stream.

## 5. Poner tus propios sprites (dibujos de personajes/monstruos)

1. Crea un PNG con **fondo transparente**.
2. Tamaño: **48×48 píxeles por frame**. Si quieres animación de 2 frames: imagen de **96×48**
   (los dos frames en horizontal). Puedes poner más frames: 144×48 = 3, etc.
3. Guárdalo en `game/assets/sprites/` con el nombre exacto del personaje:
   `hound.png`, `faceling.png`, `player_down.png`… (lista completa en el `LEEME.txt` de esa carpeta).
4. Ejecuta `node pipeline/build-assets-manifest.js` (apunta el archivo nuevo en el
   inventario de assets — desde v30.6 el juego solo carga lo inventariado, sin sondear
   rutas a ciegas ni llenar la consola de 404).
5. Recarga el juego (F5). Si el PNG existe, se usa; si lo borras, vuelve el pixel-art
   integrado (recuerda re-ejecutar el paso 4 también al borrar).

**¿Tienes una imagen que NO cumple el formato?** (otro tamaño, sin frames, con fondo…)
→ Déjala en cualquier carpeta del proyecto y dile a Claude *«convierte esta imagen en el sprite
de X»*. Claude la recorta, la escala a 48×48, le monta la hoja de frames y la deja lista.

## 5a. Fuentes de la interfaz

La UI usa dos fuentes pixel incluidas en `game/assets/fonts/` (**Press Start 2P** para
títulos y **VT323** para el texto; ambas con licencia libre OFL, incluida en esa carpeta).
Si algún día quieres otra fuente, basta con reemplazar el archivo `.ttf` por otro con el
mismo nombre y recargar. Los iconos del HUD son pixel-art generado por el propio juego.

## 5b. Sonidos

Todo el sonido del juego (pasos, golpes, dados, ambientes…) está **sintetizado por código**:
no necesitas hacer nada para que suene. Para silenciar: botón del menú de ajustes (`ESC`).

- **Volumen**: en partida vive en el **menú de ajustes** (`ESC`); en el título hay slider 🔊 y
  botón Sonido. Tres canales separados: **General**, **Efectos** y **Ambiente/música**, y el
  interruptor de la **animación del dado**. Todo se recuerda.
- Al pasar de nivel (tarjeta de presentación) el ambiente se detiene y suena un pad suave.
- **Sustituir un efecto**: pon un `.mp3`/`.ogg`/`.wav` en `game/assets/sounds/` con el nombre
  del efecto (`golpe.mp3`, `paso.mp3`…) y ejecuta `node pipeline/build-assets-manifest.js`.
  Lista completa en el `LEEME.txt` de esa carpeta.
- **Ambientes por nivel**: guarda un archivo como `game/assets/sounds/niveles/level-X.mp3`
  (+ `node pipeline/build-assets-manifest.js`)
  y el juego lo usa automáticamente, **sin ejecutar nada**. Ejemplo: para tener el zumbido
  original de las Backrooms en Level 0, guarda tu audio favorito como `niveles/level-0.mp3`.
  Los de **Level 306, 385 y 777 son los audios reales de sus páginas de la wiki** (ya incluidos).
  Cada nivel sin archivo usa su ambiente sintetizado propio (relojes en Level 80, caja de
  música en la feria del 995, susurros en el asilo del 16, goteo en las tuberías del 2…).
- Si el navegador arranca en silencio: toca cualquier tecla o clic (política de autoplay).

## 6. Editar el contenido del juego (niveles, entidades, objetos)

Las "fichas" del juego son archivos de texto editables en `data/game/`:

- `levels.es.json` — los 30 niveles: descripción, peligro, colores, reglas, entidades, salidas…
- `entities.es.json` — las entidades: daño, velocidad, comportamiento, cómo evitarlas…
- `objects.es.json` — los objetos: qué curan, descripción…

Puedes editarlos con cualquier editor de texto (o pedírselo a Claude). **Después de editar,
ejecuta SIEMPRE** (en una terminal, dentro de la carpeta del proyecto):

```
node pipeline/build-data.js
```

Sin ese paso el juego no ve los cambios. Luego F5 en el navegador.

**Ideas de ajustes fáciles a mano:**
- Subir/bajar el `peligro` de un nivel o el `dano` de una entidad.
- Cambiar la `paleta` (colores) de un nivel: son códigos de color tipo `#7a6b3d`.
- Cambiar `vision` u `oscuridad` (0 = iluminado, 1 = negro total) de un nivel.
- Reescribir descripciones o citas a tu gusto.

## 7. Añadir un nivel nuevo de la wiki

Lo más cómodo: decirle a Claude *«añade el Level X de la wiki»* — la wiki entera ya está
descargada en `data/raw/` (no gasta internet ni tokens releerla) y el grafo completo de 734
niveles parseado en `data/parsed/levels.json`. Claude crea la ficha en español y conecta salidas.

Si quieres hacerlo tú: copia una ficha similar en `levels.es.json`, cámbiale `id`, textos,
`bioma` (uno de: pasillos, garaje, tuneles, hospital, oficinas, exterior, bosque, ciudad, torres),
paleta y salidas (los `destino` deben ser ids que existan), y ejecuta `build-data.js`.

## 7b. Menú de debug (probar niveles rápido) — ahora con contraseña

El menú de debug **ya no está a la vista** (v23): en **Ajustes** (`ESC`) hay una fila
**🔑 Guardián** con una caja de contraseña. Al escribir la clave de admin del servidor
(la misma de `/admin`; sale en la terminal al arrancar, o la que fijes con `MMO_ADMIN`):

- aparece la fila **🐞 Debug** con el desplegable de los 30 niveles y el botón **Teleport**
  (online usa `/tp` por dentro; el viaje de guardián no deja puerta de retorno), y
- se activan las **barras de estado** (salud, comida, bebida y cordura) abajo a la
  izquierda, con números exactos — los jugadores normales siguen sin ver barras.

Jugando en local sin servidor (`?autostart=1`), cualquier texto en la caja desbloquea el
modo guardián (no hay clave que validar sin servidor).

En Ajustes también están el botón de **Pantalla completa** y el **número de versión** del
juego (abajo a la derecha), útil para saber qué build estás enseñando en directo.

## 8. El mapa de niveles (para ti, no para el juego)

`data/game/mapa-piloto.html` — mapa INTERACTIVO del grafo del piloto (ábrelo con doble clic):

- **Pasar el ratón** por un nivel ilumina con glow todas sus conexiones (el resto se atenúa).
- **Clic en un nivel** abre el panel lateral con su expediente: **cómo se entra** (desde qué
  niveles y con qué frase) y **cómo se sale** (cada salida con su tipo — normal, rara,
  arriesgada con su % de vacío, llave, escape, sellada — y avisos de "sin retorno" en las
  caídas), fiel a las mecánicas del juego. Los nombres del panel son clicables para saltar.
- **Buscador** arriba a la derecha (por nombre o bioma) que resalta en verde.

Se regenera con: `node pipeline/make-map.js`

## 9. Actualizar la copia local de la wiki

La wiki completa (1.113 páginas) está en `data/raw/`. Si algún día quieres refrescarla con
páginas nuevas: `node pipeline/download.js` (solo descarga lo que falte).

## 10. Copias de seguridad del proyecto

El proyecto usa git (historial de versiones automático que gestiona Claude). Para una copia
de seguridad simple: copia la carpeta entera `Proyect Backrooms` a un disco externo.
Tu progreso de jugador NO está en la carpeta: expórtalo desde el botón **Exportar** del título.

## 11. El proyecto en GitHub (para tu comunidad)

El juego es público en **https://github.com/AgenteMaxo/backrooms-noclip** con licencia
**PolyForm Noncommercial**: cualquiera puede jugarlo, estudiarlo y modificarlo, pero
**solo tú puedes comercializarlo**. Nadie puede tocar tu repositorio: la comunidad hace
una copia (*fork*), la modifica y te envía un **Pull Request** (una propuesta de cambio)
que solo tú puedes aceptar o rechazar.

- **Publicar tus cambios**: dile a Claude «haz commit y push» (o solo «push» si ya hay
  commit). Hasta que no se hace *push*, los cambios solo existen en tu ordenador.
- **Ver los Pull Requests pendientes**: pestaña «Pull requests» del repositorio, o dile a
  Claude «revisa los PRs pendientes» — puede leerlos, probarlos y darte su opinión antes
  de que decidas.
- **Aceptar un PR**: botón verde **Merge pull request** en la web (solo tú lo ves).
  Consejo: nunca aceptes un PR sin que Claude lo haya revisado antes.
- **Inspeccionar un PR tú mismo** (no hace falta ningún programa, todo en el navegador):
  - Pestaña **Conversation** del PR: la explicación del autor y los comentarios. Si el PR
    trae sonidos o vídeos de muestra, se reproducen ahí mismo con el play.
  - Pestaña **Files changed**: todos los archivos que toca, con los cambios en colores —
    **rojo = línea que se quita, verde = línea que entra**. Los archivos de audio/imagen
    salen como «Binary file» (GitHub no puede mostrarlos como texto).
  - Pasa el ratón por una línea y aparece un **+** azul: deja un comentario al autor ahí
    mismo para pedir cambios antes de aceptar.
  - Para rechazar: botón **Close pull request**, mejor con un comentario amable del porqué.
- **El doble check automático (CI, desde 2026-07-06)**: cada PR (y cada push) ejecuta solo
  una batería de comprobaciones en GitHub — sintaxis de todo el código, tests del parser,
  auditoría del Level 0 y que nadie haya editado a mano los archivos generados. El
  resultado sale EN el propio PR: **✓ verde = pasó lo objetivo** (aún hay que revisar
  diseño e intenciones con Claude), **✗ rojo = ni te molestes** (el autor puede ver qué
  falló pulsando «Details» y arreglarlo). Vive en `.github/workflows/ci.yml`.
- **Issues**: la pestaña «Issues» es el buzón de bugs y sugerencias de la comunidad —
  puedes enseñarla en directo y pedirle a Claude que arregle los que te convenzan.
- **Noticias automáticas en Discord** (ya configurado, 2026-07-06): cada push a `main`,
  PR, issue y release aparece solo en el canal de Discord. Cómo se montó, por si hay que
  repetirlo: en Discord → rueda del canal → Integraciones → Webhooks → Nuevo webhook →
  Copiar URL; y esa URL (añadiéndole `/github` al final) se registra en GitHub →
  Settings → Webhooks (o se le pega a Claude y lo hace con `gh`). ⚠ La URL del webhook
  es SECRETA (quien la tenga puede escribir en tu canal): no la enseñes en directo ni la
  subas al repositorio. Si se filtra: bórrala en Discord, crea otra y reconfigura.

## 12. BACKROOMS MMO: tu servidor (v21)

El juego ahora es un mundo compartido: necesita un servidor encendido.

**Jugar en local (probar en tu PC):** abre una terminal en la carpeta del proyecto y:
```
node server/server.js
```
Juega en `http://localhost:8080` (dos ventanas = dos jugadores; la de incógnito cuenta
como otra persona). `Ctrl+C` lo para. La clave de admin sale en la terminal al arrancar.
Gente de tu misma WiFi puede entrar con `http://TU-IP-LOCAL:8080` (IP con `ipconfig`).

**Para que juegue cualquiera por internet**, hace falta un servidor de verdad — el
tutorial completo está en `deploy/README.md`. Tu única parte manual es contratar dos cosas:

**A. Contratar (una vez, ~5 €/mes):**
1. **VPS**: un servidor pequeño con Ubuntu 24.04 (p. ej. Hetzner CX22, DigitalOcean,
   OVH…). Al crearlo te dan una **dirección IP** y acceso root por SSH.
2. **Dominio** (p. ej. en Namecheap/Porkbun): crea un registro **A** apuntando a esa IP
   (en la gestión DNS del dominio: tipo A, nombre @, valor = la IP del VPS).

**B. Instalar (una vez, 5 minutos):** entra al VPS por SSH (o pídeselo a Claude con
la IP) y ejecuta:
```
curl -fsSL https://raw.githubusercontent.com/AgenteMaxo/backrooms-noclip/v21-mmo/deploy/instalar.sh -o instalar.sh
MMO_DOMINIO=tudominio.com bash instalar.sh
```
Al terminar, `https://tudominio.com` es el juego, con candado HTTPS automático.
El servidor arranca solo al encender y se reinicia si se cae.

**C. Ser el guardián:**
- `/admin tu-clave` en el chat — o mejor: escribe la clave en la caja **🔑 Guardián** de
  Ajustes (`ESC`), que no sale en pantalla (la clave se fija en el archivo del servicio,
  el instalador te dice dónde; NO la digas en directo). Desbloquea además el menú 🐞 Debug
  y las barras de estado.
- `/anuncio texto` — banner para TODOS los jugadores de todas las salas.
- `/kick nombre` · `/mute nombre 10` (minutos) · `/ban nombre` (permanente).
- `/tp 14` (o `/tp level-483`) — teletransporte de guardián a cualquier nivel:
  tu menú de debug para enseñar niveles en directo.
- `/reiniciar` — reinicia el servidor desde dentro del juego: anuncia a todos,
  el proceso se apaga limpio y vuelve solo en ~3 segundos (los jugadores
  reconectan al Level 0; sus fichas y baneos se conservan).

**D. Mantenimiento:**
- Actualizar a la última versión: `bash /opt/backrooms-mmo/deploy/desplegar.sh`
- Ver el mundo en vivo: `https://tudominio.com/estado` (jugadores, salas, rendimiento).
- Ver los registros: `journalctl -u backrooms-mmo -f`
- Probado con **500 jugadores simultáneos** en un equipo modesto (130-190 MB de RAM):
  un VPS básico va sobrado.

## 12b. Sala de Control y modo espectador (v30) — para tus directos

La sala de monitoreo del streamer: `https://tudominio.com/observatorio/mapa`
(o el botón **🗺 SALA DE CONTROL** dentro de `/observatorio`). Pide la misma
clave de guardián.

**Qué hace:**
- **Mapa vivo** del grafo de niveles (como el mapa del piloto, pero en tiempo
  real): cada nivel muestra un badge ámbar con cuántos jugadores hay dentro y
  sus nombres. Pasar el ratón ilumina las conexiones.
- **Clic en un nivel** → panel con sus jugadores (salud/sed/cordura, tiempo
  dentro, flags) y botones **👁 Espectar** / kick / ban.
- **Ticker de eventos** (franja inferior): quién entra, quién cruza de nivel,
  quién muere y ⭐ quién ESCAPA — perfecto para el reto de «el primero que
  encuentre la salida gana».
- **📢 Anunciar**: escribe el reto (o el ganador) y lo ven TODOS los jugadores.

**Modo espectador (👁):** para que funcione tienes que estar DENTRO del juego
con la clave 🔑 validada en Ajustes. Al pulsar 👁 sobre un jugador:
- Tu personaje se teletransporta junto a él, **invisible**: ni los jugadores
  ni las entidades te ven, y no puedes tocar nada (eres un fantasma).
- La cámara pasa a **cenital** (vista desde arriba, sin techo); la **rueda del
  ratón** sube/baja la altura.
- La cámara **sigue sola a tu objetivo**, incluso cuando cruza de nivel o
  muere y reaparece en Level 0.
- **←/→** cambian de objetivo entre los jugadores de la sala; **ESC** (o el
  botón «✕ salir» de la barra) te devuelve al mundo, visible otra vez.

## 13. Si algo falla

- Pulsa **F12** en el navegador → pestaña «Consola» → haz captura de los mensajes en rojo
  y enséñasela a Claude.
- `index.html?nofx=1` desactiva los efectos visuales (por si algo va lento).
- Borrar una partida guardada corrupta: botón «Borrar» del perfil (crea uno nuevo después).
