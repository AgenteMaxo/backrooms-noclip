# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Roguelike top-down de las Backrooms para navegador, en JavaScript vanilla + Canvas 2D, sin dependencias ni build tools (no hay `package.json`). Todo el contenido, la UI y los comentarios están en **español**; los títulos de la wiki (`Level 0`, `Faceling`) quedan en inglés.

El contenido del juego (niveles, entidades, objetos) se deriva de la wiki backrooms.fandom.com mediante un pipeline de datos en Node, y luego se cura a mano en fichas en español.

## Comandos

No hay tests ni linter. Los scripts del pipeline usan solo la stdlib de Node (requiere Node 18+ por `fetch` global).

```
node pipeline/download.js      # Fase 0: descarga la wiki → data/raw/<pageid>.json (re-ejecutable, salta lo ya descargado)
node pipeline/parse.js         # Fase 1: wikitext → data/parsed/{levels,entities,objects,others}.json + report.txt
node pipeline/select-pilot.js  # Fase 2a: elige los ~30 niveles del piloto (BFS desde Level 0 + camino de escape) → data/game/pilot-titles.json
node pipeline/make-map.js      # Fase 2b: regenera data/game/mapa-piloto.html (diagrama SVG del grafo) desde levels.es.json
node pipeline/build-data.js    # empaqueta data/game/*.es.json → game/js/data.js  ← RE-EJECUTAR tras editar cualquier ficha
```

Para jugar: abrir `game/index.html` directamente en el navegador (funciona por `file://` porque los datos van embebidos en `game/js/data.js`; no usar `fetch` de JSON en el juego por esa razón).

## Flujo de datos

```
wiki fandom → data/raw/ (crudo, 1100+ archivos, NO editar) → data/parsed/ (grafo parseado)
   → data/game/*.es.json (fichas en español CURADAS A MANO — fuente de verdad del contenido)
   → game/js/data.js (GENERADO por build-data.js — no editar a mano)
```

- `data/game/levels.es.json`, `entities.es.json`, `objects.es.json`: fichas del juego, editables. Los digests (`pilot-digest.json`, `entity-digest.json`) son resúmenes intermedios en inglés que sirvieron para redactarlas.
- Evita búsquedas amplias (grep/glob) dentro de `data/raw/` — son más de mil JSON grandes.

## Arquitectura del juego

Sin módulos ES: cada archivo de `game/js/` es un IIFE que expone un global en `window` (`RNG`, `MapGen`, `GAME_DATA`...). **El orden de los `<script>` en `game/index.html` es la gestión de dependencias** — si añades un archivo, insértalo en el orden correcto:

```
data.js → engine/rng.js → mapgen/mapgen.js → engine/tiles.js → engine/sprites.js
  → engine/effects.js → audio-manifest.js → engine/sfx.js → engine/fov.js
  → systems/entities.js → systems/rules.js → engine/render.js
  → lib/three.min.js → lib/shaders/* → lib/postprocessing/* (postpro UMD r147)
  → engine/atmos3d.js → engine/render3d.js → systems/game.js
  → ui/icons.js → ui/ui.js → ui/minimap.js → main.js
```

`audio-manifest.js` lo genera `pipeline/download-audio.js` (audios ambientales reales de la wiki
→ `game/assets/sounds/niveles/`). `sfx.js` sintetiza el resto con WebAudio (overrides en
`game/assets/sounds/`, tecla M silencia).

**Render 3D (v9, por defecto)**: `lib/three.min.js` (Three.js r147 UMD, VENDORIZADO local — única
dependencia del proyecto, aprobada por el usuario) + `engine/render3d.js` (escena por nivel con
texturas CanvasTexture reutilizando tiles/sprites/render.js→exitToCanvas; cámara Octopath ~37°,
PointLight con sombras + FogExp2; billboards). `?render=2d` usa el Canvas clásico (render.js) como
respaldo íntegro. Selftests y capturas de lógica: SIEMPRE `?render=2d&nofx=1`. Capturas 3D en
headless: `--use-angle=swiftshader` (lento). Cargar three.min.js y render3d.js tras render.js.

**Capa visual v14**: postpro con EffectComposer + UnrealBloom (threshold alto: solo florecen
materiales `toneMapped:false`) + GammaCorrection como ÚLTIMO pase (obligatorio en r147, si no la
imagen sale lavada) + ACES tone mapping; los addons UMD vienen de
`three@0.147.0/examples/js/` (r147 es la última versión con examples/js clásico).
TODO lo de postpro/atmos es no-op con `?nofx=1`. `ui/icons.js`: iconos pixel-art de la UI
(matrices 12×12) + mapa emoji→icono (`Icons.deEmoji`) + marco 9-slice en la variable CSS
`--marco`; los emojis en rules.js/textos se traducen en la UI, no en los datos.
Fuentes OFL vendorizadas en `game/assets/fonts/`.
`Tiles.TILE=48` está ACOPLADO al render 2D (escala mundo→pantalla): no subirlo.
Sprites: rejilla 16 ó 24 según `rows.length` (salida siempre 48px); animar con
`% Sprites.frameCount(id)`, nunca `% 2`.

**v15 — TERCERA PERSONA (por defecto)**: cámara a la espalda (`TP` en render3d; `?cam=alta`
recupera la Octopath); WALL_H 2.3 en tercera y TECHO REAL fusionado con paneles fluorescentes
emisivos ESTÁTICOS sobre interiores (excepto bioma invernadero — cielo abierto). Controles:
W/S avanza/retrocede según `player.rot` (0-3, `Game.girar/avanzar`), A/D-Q/E giran gratis.
`atmos3d.js` = SOLO polvo (las luminarias procedurales se eliminaron a petición del usuario:
la luz de techo la dan los paneles + DirectionalLight cenital). Suelo 3D = `tiles.sueloSeam`
(macro 192px 2×2 tiles, TODO elemento orgánico con envoltura; UV de mundo ÷2). Sin tecla R:
**mundo persistente** — `world.savedLevels` (snapshots en memoria; enterLevel restaura sin
++entryCount) + salida `tipo:'retorno'` en el spawn (salvo `esSinRetorno`: void/caídas/texto
con agujero|trampilla…); `world._ignoraExit` evita el modal al aparecer sobre una salida.
HUD contextual: sin barras/turnos/minimapa — `Effects.bubble` (bocadillos con cola e
histéresis en worldStep), sprite `player_*_herido` (salud<35, generado en sprites.js build),
manos `player.manos[2]` (linterna/armas solo `world.enMano`; pasivos por `hasItem` que ya
incluye manos) + mochila (B, drag&drop + EMPUÑAR). `ui.showChoice` = elecciones libres
(beber agua: `level.aguaMala` o regla agua_traicionera → daño). Colección del códice:
`Profiles.registrarDescubierto('salidas'|'entidades'|'objetos', clave)` con caché
`_descCache` (no reescribir localStorage por turno); salidas clave `levelId::texto`.
M/N = mapa (mute SOLO en menú ⚙). `Sfx.stopAmbient()` al ENTRAR en enterLevel.

**v16 — pulido de HUD y controles**: SIN Q/E en tercera persona (solo `?cam=alta` rota cámara);
mantener tecla = 1 paso/150 ms (throttle de auto-repeat en main.js). HUD sin nombre de
nivel/peligro ni volumen: TODO en Ajustes, que ahora abre/cierra **ESC** (también cierra
mapa/mochila antes). Registro: pequeño arriba-izq, cada mensaje se desvanece a los ~5 s;
historial completo en `#log-panel` (botón pergamino o **L**, `ui.toggleLog`). **Moodles**
estilo Project Zomboid (`MOODLES` en ui.js: corazon/yin/gota/pan, 3 niveles de gravedad por
color). Manos del HUD con icono pixel `mano` espejado (`Icons.img(id, size, flip)` usa
scaleX(-1)). Bocadillos SIGUEN al jugador: `Effects.bubble(wx, wy, txt, ref)` lee `ref.rx/ry`
al dibujar. `startRun` pone `world.level = null` (si no, tras morir enterLevel creaba una
salida de retorno al nivel de la muerte). `window.OPTS` (localStorage `backrooms-opts`):
`dado:false` hace que showDice resuelva sin overlay (~120 ms). Parpadeo fluorescente raro y
ocasional en render3d (`panelMat` + dlight, ~1 vez/min, no-op con `?nofx=1`).

**v17 — expansión sin parón, mochila con ratón**: render3d reescrito en DOS grupos —
`actorGroup` (jugador/entidades/items, persiste) y `staticGroup` (suelo/muros/techo/salidas/
props). `construirEstatica(world, out)` es un GENERADOR: cambio de nivel = se consume
síncrono (tapado por la tarjeta); expansión/remodelación = incremental con presupuesto
~5 ms/frame mientras la escena vieja sigue en pantalla desplazada por `-shift`
(`staticGroup.position`), y swap al terminar (`aplicarEstatica`). `quad()` emite normales
explícitas (sin computeVertexNormals). `rebuildItems` rehace solo los sprites de items
(también al cambiar `world.itemsVersion` — tirar objetos). Audio: fix REAL de la
acumulación en sfx.js→ambient(): cada candidato fallido disparaba `intenta()` dos veces
(error + catch de play) y bifurcaba cadenas → candado `siguiente` por intento y
`synthHecho` por generación. Ratón: clic izq/der = `Game.usarMano(0/1)` (linterna toggle,
tubería `atacarFrente()` a la casilla encarada, activos se gastan desde la mano; objetos
`manos:2` SOLO clic izq). `Game.tirarItem(slot)` deja el objeto a tus pies con flag
`recien` (no se auto-recoge hasta abandonar la casilla). Mochila rediseñada: manos DENTRO
del panel (`bp-mano-0/1`, `pintarMano` compartido), drag en ambos sentidos, botón «Tirar
al suelo» en la ficha; USAR desde la ficha cierra la mochila (si no, `world.busy` seguía
activo y no hacía nada — bug v16). `fuego_griego` manos:2, `guante_paralisis` manos:1 (en
objects.es.json → re-ejecutar build-data). mapgen: relojes de L80 con `sitioPara` (pared
norte, placa 3D a altura de vista) y las cajas decorativas son contenedores registrables.
`ladoTex()` en render3d: TODAS las caras de cajas/muebles/marcos con textura (nada plano).
`?abrir=mochila` (con autostart) abre el panel para capturas.

**v18 — LA SINTONÍA (RPG del lore, no tradicional)**: `player.sintonia` 0-100 (`world.tune(n)`)
sube con horrores (matar +8, fuego +5/kill, choque a oscuras +4, agua mala +6, remodelación
+2, salida void/arriesgada +5, goteos por cordura<25 y peligro≥4) y baja apenas (amuleto −5,
peligro≤1 −1/50t). Umbrales 20/40/60/80 → `ofrecerInstinto` (RNG `runSeed::instinto::umbral`)
→ `ui.showInstintos` (elige 1 de 3 cartas; el selftest clica la primera). 8 Instintos
(`INSTINTOS` en game.js): oido_moqueta (minimapa), pies_moqueta (detección −2),
reflejos_errante (25% esquiva), visceras_vacio (drenaje ÷2), lengua_paredes (sin pifias al
registrar), piel_fluorescente (+1 visión, inmune a atraida_luz), sangre_amarilla (regen 1/12t,
agua ÷2), noclip (min 80; tecla G, −10 cordura, d20≤3 = Vacío). PRECIO: en `detecta()` las
no-cazadoras te ignoran con prob (sintonia−20)/180, y la salida `escape` tira d20 vs
sintonia/5 — fallo = «la realidad te rechaza» (a 100 no se puede escapar). Moodle ojo
amarillo fijo con sintonía≥10. **Combate/escape**: TELEGRAPH en `atacar(world,e,rng)` —
anuncia ⚠ un turno (parpadeo ámbar en render3d), moverse lo esquiva; Cazador solo avisa su
1er golpe; guard `_turnoAtaque` (un intento/turno). RUIDO: `world.hacerRuido(x,y,radio)`
(registrar r10, golpes r8, arrojar r12; caduca a los 8 turnos) → entidades no-caza lo
investigan (`stepHacia`). Rastro: 3 turnos sin detectar → abandona (contador `sinVerte`).
`Game.arrojarItem` (botón «Arrojar» en la ficha) = distracción. ESCONDERSE: ESPACIO sobre
taquilla/nevera/archivador REGISTRADO (`world.escondido`, `ESCONDITES` en game.js);
indetectable salvo delatado (te vieron entrar o tirada 15%/4% cerca); sacado del escondite
= daño ×1.5; jugador invisible en ambos renders; tryMove/usarMano bloqueados dentro.
`?abrir=instinto` fuerza el modal. sintonia/instintos/umbrales viajan en el guardado.

**v19 — manos Q/E, expansión suave del todo, códice y mapa**: SIN clics en el canvas —
usar manos = **Q/E** o clic EN la caja de la mano del HUD (`usarMano`); en el panel de la
mochila el clic GUARDA (pintarMano(el, m, tam, enPanel), atajo `.k-mano` en la esquina).
En `?cam=alta` Q/E siguen rotando la cámara. Render3d: las mallas fusionadas se trocean en
FRANJAS de 16 filas (`bandas` en construirEstatica, materiales compartidos) y el swap
asíncrono las revela 3/frame con la escena vieja aún puesta (idéntica en el solape → sin
artefactos) — la subida a GPU repartida elimina el último micro-corte; `terminarRevelado()`
si llega otro ciclo. Códice COMPACTO: secciones `<details class="cdx">` con contadores en
el summary (`cdx-n-*`), niveles y salidas como `<details class="cdx-nivel">` — escala a
cientos de fichas. `pipeline/make-map.js` REESCRITO: mapa interactivo (hover = glow en
conexiones + atenuado del resto, clic = panel lateral con ENTRADAS y SALIDAS fieles a las
mecánicas — tipos, % de vacío de `riesgoVoid`, sin-retorno con la MISMA regex que
esSinRetorno de game.js, nota de la puerta de retorno persistente —, buscador, saltos
clicables); regenerar tras tocar levels.es.json.

**v20 — mecánicas de salida, equipo vestible y Level 0 gigante**: `mecanicaDe(s)` en
mapgen deriva del texto de la wiki (o campo `mecanica` en la ficha): `romper` = pared
agrietada (exige pared norte; `def._mec`/`def._abierta`; ESPACIO → `intentarRomper` con
dado — tubería en mano umbral 7, puños 12 y −2 salud; al abrir `mapaVersion++` y el hueco
blanco brilla con bloom — PINTORES.grieta/boquete en render3d y bloque en drawExit 2D);
`caminata` = SIN casilla (`map.caminatas`). Mapas ESCALADOS por nº de salidas (≥3 ×1.25,
≥5 ×1.45, cap 190; los `infinito` NO escalan) y salidas REPARTIDAS: pool ancho (dist ≥ 45%
del máx) + greedy max-min contra spawn y salidas ya puestas. **Equipo vestible**: `player.equipo {cara,cuerpo,pies}`,
`world.equipado(id)`, `Game.ponerEquipo/quitarEquipo`, fila «Vistiendo» en la mochila
(drag + PONERSE en ficha); chaqueta equipo:cuerpo (frío exige PUESTA), `mascara_gas`
(drenajes de cordura ambientales ÷2 en rules), `botas_reforzadas` (inmune charcos sirena,
detección −1). `#bp-efectos` = chips de buffs/debuffs con tooltip (Game.INSTINTOS
exportado). Tooltips instantáneos CSS: `.tip-left`/`.tip-up` + `data-tip` (moodles con
consejo). Arrojar DISTRAE de verdad: `e.distraida=3` (van al ruido aunque cacen) y el
Cazador `paralizada=2`. Golpe de tubería: retroceso solo 25% (si no, el telegraph enemigo
nunca conectaba). X = bocadillo de espera. Códice: icono-interrogante → wiki real en cartas
descubiertas. FIX: el checkbox del dado era invisible (los estilos de slider de .sound-row
pisaban todo input → ahora `input[type=range]`). El selftest responde choice-modal
(60% primera opción) — sin él se atascaba en la caminata del L0. **v20.2**: fila 🐞 Debug
en Ajustes (solo en partida): desplegable con los 30 niveles ordenados por número +
`Game.debugTeleport(id)` (enterLevel con `sinRetorno:true` — sin puerta de vuelta).

**Era comunitaria (2026-07-06, PRs #1-#4 aceptados)**: repo público con webhook de Discord
(anuncia push/PR/issue/release). Grexii #1: mp3 reales en `assets/sounds/` (overrides de
`NOMBRES` en sfx.js) + ambiente `niveles/level-0.mp3` (tiene PRIORIDAD sobre la síntesis).
fonixgm #2: parser wiki mejorado + `node pipeline/parse.test.js` (9 tests). OlafMoreno #3:
auto-repeat del giro en 3ªP a 600 ms (constantes en main.js). fonixgm #4 («Level 0
integral») — REVIERTE dos decisiones de v20 CON el visto bueno explícito del usuario:
Level 0 vuelve a ser `infinito:true` (ventana 150×150; las franjas nuevas aportan
salidas/items/props; campo `prob` por salida = probabilidad de aparecer en cada ventana) y
la caminata ya no usa turnos ni modal — `MapGen.walkingGoal` (campo `pasosCaminata`
[800,1200] en la ficha, RNG por runSeed) cuenta PASOS reales (`world.pasosNivel`) y cruza
AUTOMÁTICO sin tarjeta (`sinTarjeta` en enterLevel), con transición gradual (bocadillos al
30/65/82/94%, materiales 3D viran a gris vía `transitionMats`, zumbido sintetizado
degradado — OJO: ese zumbido dinámico es código muerto mientras exista level-0.mp3).
Además: mecánica `romper_suelo` (ESPACIO, tubería 7 / pisotón 11 con daño), fluorescentes
CENTRADOS por detección de vanos + parpadeo por grupos (8) + pool de 4 PointLights que
siguen al jugador (todos los interiores), enchufes pixel de L0, pistas de tutorial
(`tutorialHint` en game.js), `prefers-reduced-motion` respetado, y
`node pipeline/level0-audit.js [N] [--random|--seed=x]` (auditoría de 100 semillas:
determinismo, salidas accesibles, rangos de caminata). Al revisar futuros PRs: leer el
diff COMPLETO, verificar que no pisen decisiones del usuario ni PRs previos, reproducir
los archivos generados (data.js byte a byte) y correr tests/auditoría tras el merge.

**v21-v22 — BACKROOMS MMO**: el juego es un sandbox multijugador en tiempo real. Servidor en
`server/` (única carpeta con `package.json`: dep `ws` + SQLite en `datos/mmo.db`):
`server.js` (estáticos + WebSocket `/ws` + comandos `/admin /anuncio /kick /mute /ban /tp` +
`cambiarDeSala`), `sala.js` (una sala = instancia de nivel, cap 60; tick 10 Hz vía
`tickTodas`), `sim/mundo.js` (puente Node↔motor: requiere data/rng/mapgen/fov del juego —
por la red NUNCA viaja un mapa, solo la semilla `mmo::<nivel>::<inst>`), `sim/entidades.js`
(IA continua), `protocolo.js` (validación + P.VERSION — súbela al cambiar mensajes; el
cliente manda `v` en `hola` y bots.js también), `bots.js` (carga), `db.js`, `filtro.js`.
Cliente en `game/js/net/`: `cliente.js` (conexión, predicción con `sim/fisica.js` —
archivo COMPARTIDO navegador/Node, física idéntica en ambos lados) y `otros.js` (censo de
jugadores remotos + capa social). Arrancar local: `node server/server.js` →
http://localhost:8080. `MMO_DEV=1` habilita `?nivel=`; `MMO_ADMIN` fija la clave de admin.
Movimiento LIBRE (input vectorial, θ continuo en `player.rot` online); el modo solo por
turnos sigue con `?autostart=1` (sin `?online`).

**v23 — red suave, retorno online y Ajustes de guardián**: interpolación por INSTANTÁNEAS
(`Otros.pushSnap/muestrear`, retardo 150 ms) para jugadores remotos Y entidades (main.js
salta el lerp si hay `_snaps`); reconciliación contra HISTORIAL local (`historia` en
cliente.js, RTT medido con ping/pong con eco `ts`) — comparar contra el presente causaba
tirones de goma al correr; el input se frena al abrir chat y al cambiar de sala (ambos
lados). Puerta de RETORNO online (paridad con el modo solo): `cambiarDeSala` busca en el
destino una salida con `destino === origen` y te hace spawn PEGADO a ella, o crea
`jug.retorno` — puerta PERSONAL (índice `'R'` en `salidaCerca`/`ofrecer`; el cliente la
añade a `map.exits` solo en su lado vía `m.retorno`); sin retorno si `esSinRetorno`
(regex AMPLIADA con no.?clip|desmay|despiert — copiada en game.js, server.js y
make-map.js), caminata, muerte o /tp. ESPACIO online también REGISTRA contenedores
(`registrarCont` en sala.js: dado autoritativo, botín compartido, difunde `registrado`;
esconderse ahora exige mueble registrado, como en solo). Linterna AUTORITATIVA: exige
`linterna` en manos (server), `luzDe` llega también al dueño, se apaga al desequiparla o
morir; el cono 3D sigue el facing real (θ online / ROT_VEC en solo — antes p.dir clavaba
el haz al sur). Ajustes: `window.VERSION_JUEGO` visible, botón pantalla completa, fila
🔑 Guardián (mensaje `{t:'admin',clave}` → `{t:'admin',si}`) que desbloquea la fila 🐞
Debug (online = `/tp`) y `#debug-stats` (barras salud/comida/bebida/cordura, ui.js). Local
sin servidor: cualquier clave desbloquea. Arnés de integración e2e usado en v23 (levanta
servidor real + cliente ws): reproducirlo si se toca sala/protocolo.

(Todos existen y están committeados. v3: render cenital con paredes finas autotile en `tiles.js`/`render.js`,
pixel-art data-driven en `sprites.js` con override PNG desde `game/assets/sprites/`, efectos de combate
en `effects.js`, props/contenedores registrables en `mapgen.js`/`game.js`.)

Decisiones de diseño clave:

- **Determinismo**: toda aleatoriedad de partida pasa por `RNG.create(seed)` (mulberry32); las partidas son reproducibles por semilla. No usar `Math.random()` en lógica de juego.
- **Mapas procedurales por bioma**: `MapGen.generate(levelDef, rng)` elige el arquetipo según `levelDef.bioma` (claves de `GENS` en `mapgen.js`: pasillos, garaje, tuneles, hospital, oficinas, exterior, bosque, ciudad, torres). Tiles: 0 suelo, 1 pared, 2 vacío, 3 agua, 4 suelo decorado. Todo mapa pasa por `keepLargest` (un solo componente conexo) y coloca salidas lejos del spawn vía BFS.
- **Esquema de ficha de nivel** (`levels.es.json`): `id`, `wikiTitle`, `nombre`, `clase`, `peligro` (0-5), `bioma` (debe existir en `GENS`), `tam [w,h]`, `paleta`, `vision`, `oscuridad`, `descripcion`, `cita`, `reglas[]`, `entidades [{id,n:[min,max],prob}]`, `objetos [{id,n}]`, `salidas [{texto,destino,tipo,riesgoVoid?}]`, `esEscape`, `url`, y desde v5: `estilo {pared,suelo}` (claves de los switch de `tiles.js`), `particulas` (polvo|nieve|lluvia|glitch|ojos|esporas|vapor|estrellas|null) y `sonido` (receta de `RECETAS` en sfx.js, o null si el nivel tiene audio en assets/sounds/niveles/). Tipos de salida: `normal`, `rara`, `arriesgada`, `llave`, `void`. Los `destino` referencian ids de nivel; `id` de entidades/objetos referencian sus fichas.
- **Fidelidad a la wiki**: las conexiones entre niveles, entidades por nivel y citas provienen de las páginas reales de la wiki; cada ficha conserva su `url`. Al inventar contenido nuevo, mantener coherencia con la ficha parseada correspondiente.
