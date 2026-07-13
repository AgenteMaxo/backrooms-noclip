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
node pipeline/build-assets-manifest.js  # inventaría game/assets/ → game/js/assets-manifest.js ← RE-EJECUTAR tras añadir/quitar sprites/sonidos/iconos (el juego solo carga lo inventariado; sin sondeos ni 404)
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

**v18 — Combate y escape**: TELEGRAPH en `atacar(world,e,rng)` — anuncia ⚠ un turno
(parpadeo ámbar en render3d), moverse lo esquiva; Cazador solo avisa su 1er golpe; guard
`_turnoAtaque` (un intento/turno). RUIDO: `world.hacerRuido(x,y,radio)` (registrar r10,
golpes r8, arrojar r12; caduca a los 8 turnos) → entidades no-caza lo investigan
(`stepHacia`). Rastro: 3 turnos sin detectar → abandona (contador `sinVerte`).
`Game.arrojarItem` (botón «Arrojar» en la ficha) = distracción. ESCONDERSE: ESPACIO sobre
taquilla/nevera/archivador REGISTRADO (`world.escondido`, `ESCONDITES` en game.js);
indetectable salvo delatado (te vieron entrar o tirada 15%/4% cerca); sacado del escondite
= daño ×1.5; jugador invisible en ambos renders; tryMove/usarMano bloqueados dentro.
(v18 introdujo también LA SINTONÍA, un RPG narrativo con 8 Instintos por umbrales de
`player.sintonia` — **retirado por completo a petición del usuario** tras la era comunitaria:
sin rastro en game.js/entities.js/ui.js/main.js/index.html/minimap.js/style.css. La columna
`sintonia` de `server/db.js` queda como vestigio muerto, sin lectura ni escritura.)

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
detección −1). `#bp-efectos` = chips de buffs/debuffs con tooltip. Tooltips instantáneos CSS: `.tip-left`/`.tip-up` + `data-tip` (moodles con
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
(`Otros.pushSnap/muestrear`, retardo 200 ms) para jugadores remotos Y entidades (main.js
salta el lerp si hay `_snaps`); reconciliación por RASTRO (`historia` en cliente.js): la
posición del servidor corresponde a ~rtt+tick ATRÁS en tu trayectoria — si coincide con
CUALQUIER punto del rastro (≤0.35) no se corrige nada; si se desvía de todos, el error se
mide desde el punto MÁS CERCANO y se aplica como desplazamiento. LECCIÓN v23.1: NO usar el
reloj (rtt/2+X) como referencia — el jitter de red hace imposible clavar el instante y
cada foto aplica un micro-tirón a 10 Hz (verificado con simulación: ~1.8 tiles/12 s de
tirones por reloj vs 0 por rastro; ping local ≈0 NO reproduce el bug — probar con
latencia). RTT medido con ping/pong eco `ts` (telemetría en Net.rtt). El input se frena al
abrir chat y al cambiar de sala (ambos lados). **v23.2** (seguía vibrando en giros y
frenadas): el servidor integraba el input SOLO en el tick de 100 ms (±0.46 tiles de desvío
en cada maniobra → correcciones) — ahora `input()` en sala.js integra el TRAMO PARCIAL con
el input viejo al llegar el mensaje (`_integradoHasta`, `_movidosExtra`, dedupe en la
difusión); la corrección del cliente queda PENDIENTE en `corr` y frame() la aplica
exponencial ~6/s (jamás un salto a 10 Hz); umbral 0.4 en movimiento / 0.15 parado
(convergencia). Estáticos html/js/css con `Cache-Control: no-cache` (un cliente cacheado
con código viejo jugaba con bugs ya arreglados — protocolo v4 expulsó a los de v23);
`?netdebug=1` loguea derivas y rtt en consola. Simulador de los algoritmos con
giros/frenadas/tick: corrMaxFrame 0.137 (v23.1) → 0.017 (v23.2). **v23.3**: producción va
tras CLOUDFLARE (tunnel) y su edge cachea `.js/.css` POR DEFECTO ignorando Ctrl+F5 del
usuario → tras subir protocolo a v4 los clientes recibían JS viejo del edge y el título se
quedaba mudo en «CRUZANDO LA REALIDAD…». Fix triple: (1) TODAS las URLs de script/css en
index.html llevan `?v=NNN` — SUBIRLO en cada versión junto con `VERSION_JUEGO` (el HTML no
se cachea → HTML nuevo = URLs nuevas = edge bypass); (2) `#title-net` muestra
`Net.ultimoError` o timeout de 10 s en el título (nunca más un botón colgado sin motivo);
(3) cierre con reason 'version' → `autoActualizar()` (fetch cache:'reload' de todos los
scripts + location.reload, guarda anti-bucle en sessionStorage, se limpia en bienvenida).
**v23.4** (saltos hacia delante al girar andando): la integración sub-tick de v23.2 medía
el tramo desde `_ultTick` en vez de desde la última integración DEL JUGADOR — girar
andando manda ~60 inputs/s (el vector cambia con θ cada frame) y cada mensaje re-integraba
el mismo tramo → velocidad ×2-3 en el servidor → la reconciliación saltaba hacia delante.
Fix: `desde = max(_ultTick, jug._integradoHasta)` (invariante: Σdt ≤ tiempo real =
anti-speedhack) + throttle de setInput en cliente (~11/s para deriva fina; arrancar/parar
inmediato con cambio >0.6). Test de regresión «sin speedhack por spam de input» en
test-integracion.js (verificado que FALLA sin el fix). **v23.6** («atravesamos paredes»,
hipótesis DEL USUARIO confirmada): la remodelación no euclidiana online desincronizaba los
MAPAS — quien entra a una sala tras una remodelación regenera el mapa desde la semilla SIN
los chunks cambiados (estadoDinamico no los reenvía) → cliente y servidor con grids
distintos → física imposible, snaps a través de muros. `REMODEL_ONLINE = false` en sala.js
(decisión del usuario; el modo solo la conserva) — para REACTIVARLA hay que guardar los
chunks remodelados en la sala y reenviarlos en estadoDinamico(). Además: la predicción de
red integra dt REAL (`dtNet` cap 0.6 s en main.js; el clamp visual de 0.1 s hacía que
cualquier microparón del navegador perdiera camino → snap) y la corrección pendiente
acelera con el tamaño del error. Banda sonora de The Hub:
`game/assets/sounds/niveles/the-hub.mp3` (assets/sounds/niveles/<id>.* se carga solo, con
prioridad sobre la receta `sonido` de la ficha). **v24 — AUTORIDAD DEL CLIENTE CON VALIDACIÓN (protocolo v6) — la solución DEFINITIVA al
lag**: toda la saga v23.x (reconciliación por rastro, sub-tick, intención de giro v23.7 con
arco fino) demostró que simular al jugador en el servidor pelea contra la latencia — cerca
de ESQUINAS el resultado es caótico (60 ms deciden de qué lado de un pilar sales; simulado:
2.3 tiles de desviación máx, irreducible). En un cooperativo la autoridad correcta es el
CLIENTE: integra su física local (input vectorial o intención av/giro con
`Fisica.GIRO_JUGADOR`) y reporta `{t:'p', x, y, rot, sec}` ~15/s; `sala.posicion()` VALIDA:
cubeta de velocidad (anti-speedhack, Σdist ≤ vel·Σt·1.12, techo acumulado 3.2
para cubrir el `dtNet` de 0.6 s, pero máximo 1.3 por informe); tras un microparón
el cliente trocea y reporta el rastro real para conservar curvas junto a paredes; `caminoLegal()`
(anti-noclip: muestreo cada 0.2 tiles con radio 0.22 — atrapa cualquier muro de 1 tile) y
`sec` (nº de teleport del servidor: esconder/cruzar/rechazo lo suben y los informes en
vuelo caducan; el cliente lo ecoa). Informe ilegal → 'mueve' con la última posición válida
+ sec nuevo. SIN reconciliación en el cliente (lo que ves es donde estás); el eco 'pos'
propio se ignora. El servidor ya NO integra jugadores (sí entidades); tick a 20 Hz.
Escondido = el servidor ignora informes (salir con ESPACIO). bots.js genera el mapa desde
la semilla y camina con la física real (30 bots → 0 rechazos: sin falsos positivos).
Tests del validador en test-integracion.js: speedhack ~23 t/s queda dentro del presupuesto,
microparón de 0.6 s acepta el rastro y teleport 2.5 → rechazo+sec; escondite funcional.
OJO arneses: ESPACIO junto a una taquilla
te ESCONDE (los informes se ignoran) — salir antes de navegar; y para re-ofertar una
salida hay que alejarse >1 tile de TODAS (histéresis).

**v25 — mundo de botín INDIVIDUAL + cámara libre (protocolo v7)**: cajas/dados/objetos del
suelo se resuelven EN EL CLIENTE (Net.accion→registrarLocal: dado con rollDice, pool
POOL_CAJAS, persistencia localStorage `mmo-cajas::<semilla>`; recogerSuelo por proximidad
local; tirar/arrojar → 'itemSuelto' PERSONAL) — al servidor solo viaja `{t:'loot', id}` y
sala.loot() valida cadencia 1.2s + hueco + id∈DATA.objects. Fuera del server: registrarCont,
itemsTomados, itemCogido, dado difundido (el de romper va solo al actor). Detección de
entidades ×1.7 (OLFATO en entidades.js, cap 16, contacto sin escalar) y rastro 4.2s.
CÁMARA LIBRE estilo Roblox (online 3ªP): WASD mueve RELATIVO A LA CÁMARA (main.js:
adelante=(-sin yaw,-cos yaw), derecha=(cos yaw,-sin yaw); p.rot=atan2 del movimiento),
ratón mantener+arrastrar orbita (Render3D.orbita/yaw, yawLibre; colisión de cámara ya
existía); el sprite propio muestra la cara según rot−(−camYaw). Pasos SONORO local
(pasoAcum 0.75 en cliente.js; otros a <8 tiles en otros.js). Pantalla completa REAL:
ajustarLienzo() re-renderiza a resolución del monitor (Render3D.resize actualiza W/H que
usan proj/overlay). Feedback de admin EN el panel (#admin-msg). Al tocar el HUD/red,
recordar: el server ya solo conoce posición validada, inventario, salud, salidas, grietas,
escondites, chat y entidades. Puerta de RETORNO online (paridad con el modo solo): `cambiarDeSala` busca en el
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

**v29 — riesgoVoid unificado, Sala Manila y salida de emergencia canon**: el dado de
riesgoVoid (salidas `arriesgada` con `riesgoVoid>0`, ej. `level-0→level-27`) ahora también
se tira en `server/sala.js::cruzar()` (antes solo en el modo solo) — mismo `this.rng` de
sala, mismo bonus de trébol, mensaje `dado` solo al afectado, `morir()` en fallo; test
dedicado `server/test-riesgo-void.js` (level-909, riesgoVoid:0.1, hasta 60 intentos hasta
observar ambos desenlaces). Nueva **Sala Manila** en Level 0 (fiel a la wiki real): salida
sin casilla con `mecanica:'manila'` y `destino:'*opciones:level-1,level-2'` — nuevo sentinel
de destino (junto a `*aleatoria`/`*visitada`) resuelto en `crossExit`(game.js)/`cruzar`
(sala.js) con `rng.pick` sobre la lista separada por comas. `genPasillos` (mapgen.js) ahora
devuelve `{grid, rects}` (antes descartaba los rectángulos de sala); `generate()` separa la
salida `manila` de las demás (no se coloca como punto, como ya hacía `caminata`) y con 20%
de probabilidad elige un rect lejos del spawn como `map.manila` — expuesto junto a
`map.manilaSalida` (la definición ya con `_mec:'manila'`). Permanencia por TIEMPO REAL (no
turnos/pasos, `MapGen.manilaGoal(salidaDef, seedKey, intento)` sobre `permanenciaS`
[180,300]): offline en `worldStep` con `performance.now()` (avisos al 50%/80%, reproyección
del rect en `desplazarVentana` si Level 0 desplaza su ventana infinita); online en
`Sala.manilaAvanza(jug)` llamado desde `posicion()` — usa un campo PROPIO `jug.manila`
(NUNCA `jug.canal`: ese campo bloquea `accion()` y habría dejado al jugador sin poder
registrar ni esconderse durante minutos). Luz naranja tenue: `actualizarLucesTecho`
(render3d.js) tiñe a `0xff8c40` los fluorescentes del pool cuyo panel cae dentro de
`map.manila`. Test `server/test-manila.js`: generación (frecuencia ~20%, determinismo),
`Sala.manilaAvanza` con `Date.now` sustituido por un reloj controlado (sin esperar minutos
reales) y cancelación al salir del rect. Además: nueva salida de emergencia canon
`level-0→level-14` con `ritual:'emergencia'` (patrón `SPEC`/`PINTORES` de render3d.js +
`drawRitual` de render.js) — puerta roja con rótulo "EXIT" parpadeante y una `PointLight`
roja fija junto a la puerta, para que se distinga de cualquier otra puerta del juego. Y se
**retiró por completo LA SINTONÍA** (el RPG de Instintos de v18) del modo solo a petición
del usuario — ver la nota en la entrada v18 de más arriba.

**v30 — Sala de Control y modo espectador (protocolo v8)**: para los directos del streamer.
`/observatorio/mapa` (`server/observatorio-mapa.html`, botón 🗺 en /observatorio) = mapa VIVO
del grafo de niveles: mismo layout BFS por capas y estética que `mapa-piloto.html` (el
algoritmo está COPIADO en la página; los datos los da `/grafo`, cache en server.js con el
sentinel `*opciones:` resuelto), badges con jugadores por nivel vía `/observa` cada 2 s,
clic en nivel → panel con jugadores y botones 👁 Espectar/kick/ban, ticker de eventos por
DIFF entre polls (entra/cruza/muere/⭐escapa por delta de `historico.escapes`) y 📢 anuncio
(`/accion {accion:'anuncio'}`). MODO ESPECTADOR: `jug.espectador={objetivo}` en sala.js —
invisible (censo() lo excluye, 'sale' al entrar, 'entra' al salir), intocable (guards en
herir/morir/accion/loot/usar/mochila/chat/cruzar/luz + filtros `!j.espectador` en los 5
puntos de sim/entidades.js), `posicion()` lo ignora (el cliente NO reporta). El cruce del
objetivo arrastra a sus espectadores: bucle al final de `cambiarDeSala` → `moverEspectador`
(server.js) que NO pasa por `asignar()` — va a la MISMA instancia (con asignar, sala llena
= instancia distinta y pierdes la acción). `espectar()` en server.js lo comparten el ws
`{t:'espectar', objetivo|null}` (solo esAdmin) y `/accion espectar` (busca al guardián
conectado más reciente; espectar-fin lo saca). Cliente: `w.espectador` — `Net.frame` pega
`player.x/y` a la posición interpolada del objetivo en Otros (FOV radio ≥14 y AMBOS renders
siguen la acción gratis), cámara CENITAL en render3d (rueda = altura vía `Render3D.espAlt`
5-26, techo+paneles con `material.visible=false` cada frame = casa de muñecas, niebla
~fuera, sprite propio oculto también en render.js 2D), barra `#espectador-bar`
(body.espectando oculta el HUD por CSS), ←/→ cambian objetivo, ESC sale. Al desconectar el
objetivo, `dejarDeEspectar` con aviso. Test: `server/test-espectador.js` (22 asserts, ws
real). OJO: subir protocolo obliga a `v:` en cliente.js, bots.js y TODOS los test-*.js.

**v30.3 — árboles 3D en los bosques**: en render3d.js la rama orgánica de `construirEstatica`
ya no usa billboards para `wallStyle === 'arbol'` (L45/186/626/6.1): cada casilla de pared
genera un árbol seco 3D — prismas cuadrados que se afilan (`rama`) con crecimiento recursivo
(`crecer`, 1-3 hijas por rama, prof 3 o 2 si la casilla está rodeada de arboleda), corteza
`p-corteza` con la paleta del nivel, decal de sombra a los pies y todo determinista por
casilla vía `seededUnit`. Fusionado por bandas (flush cada 8 filas) como los muros; SIN
`castShadow` (el PointLight pintaba manchones negros sobre miles de ramas finas). Las rocas
de `exterior` siguen siendo billboards.

(Todos existen y están committeados. v3: render cenital con paredes finas autotile en `tiles.js`/`render.js`,
pixel-art data-driven en `sprites.js` con override PNG desde `game/assets/sprites/`, efectos de combate
en `effects.js`, props/contenedores registrables en `mapgen.js`/`game.js`.)

Decisiones de diseño clave:

- **Determinismo**: toda aleatoriedad de partida pasa por `RNG.create(seed)` (mulberry32); las partidas son reproducibles por semilla. No usar `Math.random()` en lógica de juego.
- **Mapas procedurales por bioma**: `MapGen.generate(levelDef, rng)` elige el arquetipo según `levelDef.bioma` (claves de `GENS` en `mapgen.js`: pasillos, garaje, tuneles, hospital, oficinas, exterior, bosque, ciudad, torres). Tiles: 0 suelo, 1 pared, 2 vacío, 3 agua, 4 suelo decorado. Todo mapa pasa por `keepLargest` (un solo componente conexo) y coloca salidas lejos del spawn vía BFS.
- **Esquema de ficha de nivel** (`levels.es.json`): `id`, `wikiTitle`, `nombre`, `clase`, `peligro` (0-5), `bioma` (debe existir en `GENS`), `tam [w,h]`, `paleta`, `vision`, `oscuridad`, `descripcion`, `cita`, `reglas[]`, `entidades [{id,n:[min,max],prob}]`, `objetos [{id,n}]`, `salidas [{texto,destino,tipo,riesgoVoid?}]`, `esEscape`, `url`, y desde v5: `estilo {pared,suelo}` (claves de los switch de `tiles.js`), `particulas` (polvo|nieve|lluvia|glitch|ojos|esporas|vapor|estrellas|null) y `sonido` (receta de `RECETAS` en sfx.js, o null si el nivel tiene audio en assets/sounds/niveles/). Tipos de salida: `normal`, `rara`, `arriesgada`, `llave`, `void`. Los `destino` referencian ids de nivel; `id` de entidades/objetos referencian sus fichas.
- **Fidelidad a la wiki**: las conexiones entre niveles, entidades por nivel y citas provienen de las páginas reales de la wiki; cada ficha conserva su `url`. Al inventar contenido nuevo, mantener coherencia con la ficha parseada correspondiente.
