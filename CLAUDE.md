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
data.js → apariencia.js → engine/rng.js → mapgen/mapgen.js → engine/tiles.js → engine/sprites.js
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

**v28 — personalización de personaje (protocolo v8)**: pantalla "Personalizar" en el título
(botón junto a Códice/Changelog) para elegir ESTILO + COLOR de cabello/ojos/ropa antes de
`startRun`, visible también para otros jugadores online. Fuente única de estilos/colores/
normalización en `game/js/apariencia.js` (mismo patrón dual navegador+Node que
`sim/fisica.js`: `window.Apariencia` en el cliente, `module.exports` en el server — SIN
`document`/`canvas`, así `server/sala.js` y `protocolo.js` lo pueden `require` directo). Las
capas recoloreables son PNG **provistos por el usuario** (no generados ni extraídos por
pipeline): `game/assets/apariencia/<Estilo>.png` (`Hair1`, `Eyes1`, `Clothes1`...) — UN solo
archivo de 192×48 por estilo, 4 frames en fila (frame 0 down, 1 up, 2 side, 3 SIN USAR — el
motor nunca lo lee; un frame puede quedar transparente si no aplica, p. ej. ojos de
espaldas). `cargarCapaEstilo` recorta cada frame 1:1 SIN escalar ni centrar (a diferencia de
`cargarOverride`) — la alineación píxel a píxel con el cuerpo base es responsabilidad del
archivo, CON UNA SALVEDAD: `AJUSTE_CAPA` (`sprites.js`) permite un desplazamiento dx/dy fino
por estilo+dirección aplicado SOLO al dibujar (el PNG del usuario no se toca nunca) — para
cuando un frame queda corrido y no vale la pena pedir un reexport. (v28.0 probó primero una
hoja de 192×48/4 celdas, después 3 archivos sueltos de 48×48 por dirección, y volvió a la
hoja de 4 celdas por preferencia del usuario — el bug real de alineación no era el formato de
archivo, era el CONTENIDO dibujado en distinta posición por frame; de ahí `AJUSTE_CAPA` en
vez de forzar más iteraciones de formato. Medí la referencia de la cabeza del cuerpo base con
un decoder PNG mínimo hecho ad-hoc con `zlib.inflateSync`, ver
`game/assets/apariencia/LEEME.txt` para los números.) Cada píxel ya en uno de 3 grises
exactos (`#4d4d4d`/`#808080`/`#b3b3b3`, ver `game/assets/apariencia/LEEME.txt`). El cuerpo
BASE reutiliza el override normal de `player_down/up/side.png` (debe ser un cuerpo neutro
sin pelo/ropa propios para este sistema — ver nota en `game/assets/sprites/LEEME.txt`).
**Trampa real de file:// (SIN servidor, el modo por defecto)**: `tintarCapa` NO puede usar
`getImageData`/`putImageData` — Chrome marca como "tainted" cualquier canvas donde se dibujó
una imagen cargada por `file://`, y `getImageData` tira `SecurityError` ahí (`drawImage` y la
subida de textura WebGL SÍ funcionan sobre contenido tainted; solo la LECTURA de píxeles de
vuelta a JS está bloqueada). El remapeo de los 3 tonos al color elegido se hace con un filtro
SVG (`feComponentTransfer` discreto de 3 pasos por canal vía `ctx.filter = 'url(#...)'`,
`color-interpolation-filters="sRGB"`) — puro `drawImage` con filtro, cero lectura de píxeles.
Si se te ocurre "optimizar" esto a getImageData de nuevo: NO, se rompe en file://. Motor en
`sprites.js`: `cargarCapaEstilo`/`tintarCapa` (reutiliza `shadeHex` para sombra/brillo — NO
hay una segunda fórmula de sombreado) y `getTintado(baseId, apariencia, frame, flip)`, que
clona el sprite base y compone las capas encima en orden `ojos→vello→inferior→superior→cabello`
(cabello AL FRENTE de todo, incluida la ropa — pedido explícito del usuario), cachea el
compuesto y también genera la variante `_herido` (la sangre se pinta SOBRE el compuesto
final, no solo sobre el cuerpo).
`render.js`/`render3d.js` llaman `getTintado`/`spriteTexTintado` (nueva, junto a
`spriteTexFlip`, clave de textura con la apariencia) en los 4 sitios que dibujan jugador —
local y remoto, 2D y 3D — con fallback a `Sprites.get` si `apariencia` es null
(compatibilidad). El selector de estilo en `ui.js` (`showApariencia`) recorta las miniaturas
de cabello/ojos a un primer plano de la cabeza (`RECORTE_CABELLO`/`RECORTE_OJOS`, ojos bien
cerrado sobre la cara) — el cuerpo entero a 48px no deja distinguir el estilo; ropa se
muestra de cuerpo entero. Persistencia: `player.apariencia` junto a `equipo` en
`startRun`/`continueRun`/`save` (`game.js`), y recordada POR PERFIL vía
`Profiles.apariencia()`/`setApariencia()` (`create()` inicializa cada perfil nuevo con
`Apariencia.DEFECTO` — un perfil nuevo nunca hereda la apariencia de otro). Red: la
apariencia viaja UNA vez en el handshake `hola` y en `censo()`/`entra` (NUNCA en el `pos` de
alta frecuencia) — el servidor la NORMALIZA con `Apariencia.normalizar()` (estilo/color fuera
de la lista permitida cae al valor por defecto) en vez de rechazar la conexión entera por un
campo cosmético. Subir protocolo a v8 tocó el literal `v:` hardcodeado en CUATRO sitios
además de `cliente.js`/`protocolo.js`: `server/bots.js`, `server/test-integracion.js`,
`server/test-admin-clave.js`, `server/test-retorno.js` — si volvés a subir versión, grepear
`v: 7`-style antes de dar por terminado o los arneses se desconectan solos. **v28.1 — vello
facial y tono de piel**: `vello` es una categoría MÁS (misma mecánica que `cabello`: capa
opcional `Vello1/2/3.png`, `estilo:null` = sin barba por defecto, incluida en el orden de
dibujo de `getTintado` — ver v28.7 más abajo por el orden ACTUAL, cambió desde acá; miniatura
con el MISMO recorte de cara que ojos — `RECORTE_OJOS` reutilizado, no uno propio). `piel` es distinta —
no es una capa (sin prefijo en `PREFIJOS`, sin PNG propio) — pero usa la MISMA mecánica de
remapeo de 3 tonos que el resto (a pedido explícito del usuario, reemplazando un primer
intento con `globalCompositeOperation:'color'` + `'destination-in'` que sí funcionaba pero
no compartía código): `remapTonos(fuente, colorHex)` en `sprites.js` es la primitiva común
que `tintarCapa` (capas) y la nueva `tintarCuerpo` (cuerpo base) comparten. Para que el tono
de piel se pueda elegir, `game/assets/sprites/player_down/up/side.png` TIENEN que estar en
gris puro de 3 tonos como cualquier capa (ver la nota nueva en
`game/assets/sprites/LEEME.txt`) — si están en color natural, `tintarCuerpo` los tiñe igual
pero el resultado no se ve bien (no hay forma de "saltarse" el tinte por diseño: el cuerpo
gris sin colorear se ve mal, así que `piel` NO tiene opción `color:null`, siempre tiene un
valor real desde `PALETA.piel[0]`). `CATEGORIAS_COLOR_OPCIONAL` en `apariencia.js` quedó
vacío (antes tenía `piel`) — el mecanismo de "color opcional" se dejó genérico por si hace
falta para otra categoría futura. `tintarCuerpo` cachea por `id+frame+color` (el cuerpo base
SÍ tiene varios frames de caminata, a diferencia de las capas que son una sola pose — por
eso es una función aparte de `tintarCapa`, no la misma). El panel muestra Piel PRIMERO
(antes de Cabello), a pedido del usuario — orden en el HTML y en el loop de
`showApariencia()` en `ui.js`. `refrescarTodo(sel)` en `ui.js` redibuja las 5 filas juntas
(no solo la tocada) porque el color de piel cambia el cuerpo de TODAS las miniaturas, no
solo la de su propia fila. **v28.2 — sin límite fijo de estilos**: `ESTILOS` (lista cerrada
`['Hair1','Hair2','Hair3']`) se reemplazó por `PREFIJOS` (`{cabello:'Hair', ojos:'Eyes',
ropa:'Clothes', vello:'Vello'}`) + `estiloValido(cat, estilo)` — un regex
`^Prefijo[1-9][0-9]{0,2}$` en vez de una lista cerrada, así que agregar un estilo nuevo es
subir el PNG con el número que sigue, CERO cambios de código (client Y server, comparten
`apariencia.js`). El descubrimiento real de cuántos hay lo hace `sprites.js` en tiempo de
carga: `probarCategoria()` prueba `<Prefijo>1, <Prefijo>2...` secuencial y corta tras
`MAX_HUECOS_ESTILO` (3) números seguidos sin archivo — por eso la numeración NO puede tener
huecos grandes (documentado en `game/assets/apariencia/LEEME.txt`); `estilosDisponibles(cat)`
ahora devuelve lo que `estilosPorCategoria` fue encontrando, no un filtro sobre una lista
fija. Nótese la asimetría a propósito: el CLIENTE limita cuántos estilos se OFRECEN
(sondeo real de archivos), el SERVIDOR solo valida la FORMA del nombre (no sabe ni le
importa si el PNG existe de verdad — si no existe, esa capa simplemente no se dibuja en
quien la reciba, mismo espíritu que cualquier frame faltante de este sistema). Los que
suman `vello`/`piel` a un array de categorías hardcodeado en vez de leer
`Apariencia.CATEGORIAS`: `getTintado`'s `cats`, `apKey()` en `render3d.js`, y
`CATS_APARIENCIA` en `ui.js` — grepear esos 3 sitios si se agrega OTRA categoría más.
**v28.3 — ropa dividida en superior/inferior, SIN teñir**: `ropa` se partió en `superior`
(torso) e `inferior` (piernas/pies), cada una con su propio prefijo (`Superior`, `Inferior`)
en `PREFIJOS`. A diferencia de TODAS las demás capas, estas dos NO pasan por
`tintarCapa`/`remapTonos` — `CATEGORIAS_SIN_COLOR` en `apariencia.js` las marca, y
`getTintado` en `sprites.js` las dibuja leyendo directo de `capasEstilo[estilo][dir]` (el
PNG ya viene en color final, no gris de 3 tonos — para tener variantes de color hay que
hacer un estilo nuevo por combinación, p. ej. `Superior1`=campera verde,
`Superior2`=campera roja). `color` para estas dos queda SIEMPRE `null` (forzado en
`normalizar`, ni siquiera pasa por `CATEGORIAS_COLOR_OPCIONAL`) y `ui.js` no les renderiza
fila de swatches — ojo si se agrega una categoría "sin color" nueva: hay que chequear
`CATEGORIAS_SIN_COLOR` ANTES de tocar `$('ap-colores-'+cat)`, no después (ese div ya ni
existe en el HTML para estas dos, tocarlo primero tira `TypeError` — bug real que pasó acá
al escribir esto). Miniaturas con recortes propios sin calibrar todavía (`RECORTE_SUPERIOR`/
`RECORTE_INFERIOR` en `ui.js`, estimados sobre proporciones del cuerpo, no medidos con PNG
real como se hizo con cabello/ojos). Formato de archivo TAMBIÉN distinto (a pedido del
usuario): en vez de una hoja única de 192×48 con las 3 direcciones, `superior`/`inferior`
son 3 archivos SUELTOS por estilo — `<Estilo>_down/up/side.png`, mismo patrón que
`player_down/up/side.png` — `CATEGORIAS_MULTIARCHIVO` en `apariencia.js` las marca;
`probarEstiloMultiarchivo` en `sprites.js` (hermana de `probarEstilo`, la de la hoja única)
prueba las 3 direcciones POR SEPARADO y cuenta el estilo como "encontrado" si al menos
`_down` cargó — `probarCategoria` elige uno u otro cargador según
`MULTIARCHIVO_APARIENCIA.includes(categoria)`. Sin escalar/centrar, igual que el resto;
mismo `AJUSTE_CAPA` (por dirección) disponible. **A diferencia de TODAS las demás capas
(una sola pose estática), cada archivo `_down/up/side` de superior/inferior SÍ anima con
el ciclo de caminata** (pedido explícito del usuario: "que cada posición tenga 4 frames,
como el player") — hoja horizontal de hasta 4 frames de 48×48, exactamente el mismo
formato que `player_down/up/side.png` (`cargarOverride`). `capasEstilo[estilo][dir]` para
estas dos categorías es un ARRAY de canvases (uno por frame), no un canvas suelto como en
el resto — `capaAnimada(estilo, dir, frame)` en `sprites.js` hace `frames[frame %
frames.length]`. El resto de las capas (cabello/ojos/vello) siguen siendo un canvas único
por dirección — si se toca `capasEstilo` en el futuro, ojo con esta asimetría de forma
(array vs canvas) según la categoría. **v28.6**: `RECORTE_SUPERIOR` (miniatura) tenía w≠h
(28×16) — un recorte no cuadrado estira/aplasta al dibujarse en el destino cuadrado de
48×48 (bug real, se veía "estirado"); recalibrado a cuadrado (22×22) con medidas reales de
`Superior1_down.png` (torso x:15-33 y:18-30, centro 24,24 — ya coincidía con el centro del
cuerpo). Regla general para CUALQUIER recorte de miniatura nuevo: que `w === h`. También
`superior` se sumó a `CATEGORIAS_OPCIONALES` (opción "Sin ropa", torso desnudo) — a
propósito SOLO `superior`, no `inferior` (pedido explícito del usuario). **v28.7**: orden
de dibujo de `getTintado`'s `cats` cambiado a `['ojos','vello','inferior','superior',
'cabello']` — cabello AHORA VA AL FRENTE de todo, incluida la ropa (antes iba primero/atrás)
— pedido explícito del usuario. Si se vuelve a tocar el orden, actualizar también el
comentario de `getTintado` en `sprites.js` (dice el orden en texto, se desincroniza fácil).
**v28.8 — panel de Personalizar rediseñado estilo Stardew Valley**: se reemplazaron las
grillas de miniaturas/swatches por filas "◀ texto ▶" (`.ap-arrow`/`.ap-valor` en `ui.js`,
`pintarFlecha` reusable) para estilo (todas las categorías) y color (solo "piel", que sigue
con paleta fija) — el único preview visual ahora es el muñeco grande de arriba
(`ap-preview-canvas`), así que ninguna fila necesita dibujar su propio recorte de cabeza.
**v28.9 — color CONTINUO para cabello/vello/ojos**: en vez de una paleta cerrada de
swatches, 3 sliders R/G/B (`refrescarColorRGB` en `ui.js`, `CATEGORIAS_COLOR_RGB` en
`apariencia.js`, validación de forma con `HEX_RE` en vez de `PALETA[cat].includes(...)`).
El tinte de esas 3 capas pasó de `remapTonos` (filtro SVG discreto de 3 tonos) a
`tintarMultiply` en `sprites.js`: dibuja la capa, compone un relleno sólido del color
elegido con `globalCompositeOperation='multiply'` (cada canal del gris de la capa queda
escalado por el canal del color) y recorta con `destination-in` contra la MISMA capa para
restaurar su alpha original — 'multiply' por sí solo vuelve opaco todo el lienzo, así que
sin el recorte el tinte "rellenaría" la silueta entera. Sigue siendo pura composición de
canvas (cero `getImageData`), así que no rompe la trampa de `file://` (ver nota grande de
v28 más arriba). `remapTonos`/el filtro SVG quedan vivos SOLO para "piel" (`tintarCuerpo`),
que conserva su paleta fija de swatches con flechas.
**v28.10-v28.11 — layout de dos columnas + muñeco centrado + ajustes compactos** (pedido
explícito del usuario): opciones a la izquierda, muñeco a la derecha (`.ap-layout` flex,
`.ap-opciones`/`.ap-preview`). El muñeco usa el truco estándar de "sticky centrado":
`.ap-layout` con `align-items:stretch` hace que `.ap-preview` (el item flex) sea tan alto
como toda la columna de opciones, dándole "recorrido" vertical a su hijo
`.ap-preview-sticky` (`position:sticky; top:50%; transform:translateY(-50%)`) para flotar
centrado en el viewport mientras se scrollea en vez de quedar pegado arriba. Filas de
opciones más chicas (`.ap-arrow`/`.ap-valor`/`.ap-rgb` con fuentes y paddings reducidos) para
que quepa todo sin scroll en la mayoría de los tamaños de ventana.
**v28.12 — botón de dado (aleatoriza TODA la apariencia)**: arriba a la derecha del panel
(`.ap-cab` flex, `#btn-ap-random`), `aleatorizarApariencia` en `ui.js` sortea las 6
categorías (estilo de una lista `Sprites.estilosDisponibles(cat)`, color con
`Math.random()` para cabello/vello/ojos) y fuerza `modo:'personalizado'` (ver v28.14) para
que el resultado se vea. Es aleatoriedad puramente cosmética, ANTES de que exista una
partida — no pasa por `RNG.create(seed)` (esa regla es para que una PARTIDA sea
reproducible por semilla; esto no participa de ninguna). El ícono es una imagen PNG real
provista por el usuario (`game/assets/icons/dado.png`, vía `<img>` plano con
`image-rendering:pixelated`, NO el sistema de iconos pixel-art de `icons.js` — más simple
para un ícono de una sola vez que no necesita el mecanismo genérico data-icon). El muñeco
se corrió un poco a la izquierda (`margin-right` en `.ap-preview`) a pedido del usuario.
**v28.13 — fondo de habitación real detrás del muñeco**: imagen PNG provista por el usuario
(`game/assets/ui/personalizar-fondo.png`, 640×480) como `background-image` de
`#ap-preview-canvas` (el canvas dibuja el sprite con `ctx.clearRect` primero, así que el
fondo CSS se ve por donde el sprite es transparente) — `center/cover` para llenar el
recuadro 1:1 sin deformar la imagen 4:3 (recorta simétrico los bordes izq/der ya que el
pilar de la composición queda centrado). Zoom pedido después: un solo valor en
`background-size` (`160%`) escala el ancho a ese % del recuadro y calcula alto "auto"
preservando la proporción — más simple que jugar con `background-position` para simular
zoom, y no deforma nada. El recuadro volvió a 144px (3× de 48 nativos) tras un intento de
agrandarlo a 192px que el usuario pidió deshacer: el pedido real era zoom al FONDO, no un
recuadro más grande.
**v28.14 — Traje Hazmat: skin PREDETERMINADA + modo de apariencia**: antes de "Piel" hay un
control segmentado (`.ap-modo`, dos botones) para elegir "Traje Hazmat" (fijo,
predeterminado) o "Personalizar" (las 6 categorías de siempre) — `apariencia.modo` nuevo
campo (`Apariencia.MODOS`, `DEFECTO.modo:'hazmat'` en `apariencia.js`): cualquier perfil sin
este campo (todos los guardados antes de v28.14, y cualquier perfil nuevo) cae en "hazmat"
por pedido explícito del usuario — "si no personaliza, se queda con la skin de Hazmat".
Elegir piel/cabello/etc. mientras el modo es "hazmat" NO se borra, solo no se ve hasta
volver a "Personalizar" (`refrescarModo` en `ui.js` oculta `#ap-cats-personalizables`
entero, no cada fila). El traje es un sprite PROCEDURAL nuevo en `sprites.js`
(`DEFS.hazmat_down/up/side`) que reusa EXACTAMENTE el esqueleto/ciclo de caminata del
jugador base (`ciclo()` + `piernasFrontal`/`piernasSide` sin cambios) — la capucha/visor
sale de remapear 1 a 1 las filas de pelo/cara del jugador (`h→m` capucha, `H→M` sombra,
`f→v` visor, `F→z`/`e→z` acento oscuro/remaches) y el torso/piernas reusa las MISMAS filas
del jugador con una paleta nueva (mono amarillo en vez de ropa/piel), así que conserva la
silueta/proporciones sin volver a medir nada. `Sprites.getTintado` corta directo a
`hazmat_<dir>` (sin componer capas ni teñir) cuando `apariencia.modo==='hazmat'` — es la
ÚNICA rama que no pasa por el resto de la función. Como `hazmat_down/up/side` son ids
normales de `DEFS`, `Sprites.list()` los expone solos a `tryOverrides` en `main.js`: el
usuario puede reemplazar el traje procedural con su propio arte más adelante con solo subir
`game/assets/sprites/hazmat_down/up/side.png`, mismo mecanismo que el cuerpo base, cero
cambios de código. Bug real encontrado y corregido en el mismo cambio: `apKey()` en
`render3d.js` (clave de caché de textura) no incluía `modo` — cambiar de modo sin tocar las
6 categorías reusaba la textura vieja de la caché porque la clave quedaba idéntica.
**v28.15 — el usuario subió `hazmat_down.png` real, dos bugs de visibilidad**: (1)
`rutasOverride()` en `sprites.js` solo buscaba en `assets/sprites`/`assets/objetos`/`assets`
— el usuario (por costumbre, todo el resto del arte de apariencia vive ahí) puso el archivo
en `assets/apariencia/`, carpeta que NO se buscaba para overrides de cuerpo completo tipo
`player_down.png`/`hazmat_down.png`; ahora `assets/apariencia` está sumada a esa lista, así
que el archivo se encuentra sin importar en cuál de las dos carpetas quede. (2) los
overrides cargan async (`Image.onload`) y nada repintaba el preview del panel si terminaban
de cargar DESPUÉS del primer pintado — `showApariencia` ahora corre un `setInterval` que
compara `Sprites.version()` (el mismo contador que ya usaba `render3d.js` para esto mismo en
la escena 3D) y repinta si subió, limpiado al cerrar el panel. Medí con un decoder pngjs ad
hoc el bounding box vertical de `hazmat_down.png` contra `player_down.png`: son IDÉNTICOS
(fila 6 a 42 de 48) — el traje real del usuario ya estaba perfectamente alineado; lo que se
veía "corrido" o "flotando" antes de este fix era el PLACEHOLDER PROCEDURAL (nunca se había
cargado el override real por el bug de carpeta).
**v28.16 — dado tapaba el título en "Traje Hazmat"**: con "Traje Hazmat" seleccionado,
`#ap-cats-personalizables` queda oculto y `.ap-opciones` se reduce a solo el selector de
modo (~40px) — el truco de sticky-centrado de `.ap-preview` (pensado para la columna LARGA
de "Personalizar", con mucho recorrido vertical) tenía tan poco margen ahí que el recuadro
del muñeco terminaba flotando por encima de `.ap-layout`, tapando el título y el botón de
dado de `.ap-cab` (confirmado midiendo `getBoundingClientRect` de ambos: se superponían en
viewports bajos). Fix: `min-height:300px` en `.ap-opciones` — un piso de altura que le da
"aire" de sobra al sticky en cualquier modo, sin afectar "Personalizar" (que ya excede eso
por su propio contenido). Además, el dado en sí se oculta con "Traje Hazmat" (`refrescarModo`
en `ui.js`): no hay nada que sortear ahí.
**v28.17 — pedido: el recuadro de Hazmat centrado (no pegado a la derecha)**: con la columna
de opciones vacía en "Traje Hazmat", dejar el recuadro en su lugar de siempre (columna
derecha del layout de dos columnas) se veía descentrado — toda la mitad izquierda del panel
quedaba vacía. Reestructura: `.ap-modo` (los dos botones) salió de `.ap-opciones` y ahora
vive FUERA de `.ap-layout`, full-width, arriba de las dos columnas — así siempre se ve
completo sin importar el modo. `.ap-opciones` y `#ap-cats-personalizables` se fusionaron en
un solo elemento (ya no hace falta el div intermedio): ocultarlo saca la columna ENTERA del
flex, y `.ap-layout.centrado` (clase que alterna `refrescarModo`) le pone
`justify-content:center` para que el único hijo que queda (`.ap-preview`) se centre en el
ancho del panel. Un descubrimiento real en el camino: el fix de v28.16 (`min-height:300px`)
dejó de hacer falta al sacar `.ap-opciones` del flex — pero SIN ese alto, el truco de
sticky-centrado (pensado para que `.ap-preview` se "estire" tan alto como la columna larga
de "Personalizar") volvió a fallar por UNA CAUSA DISTINTA: con `.ap-preview` de vuelta a su
alto natural (~147px), `top:50%` calcula un offset chico (~73px) que la posición "pegada"
(sticky ya activo desde el primer pintado, sin necesidad de scroll real) empuja por encima
de `.ap-layout`, tapando la cabecera otra vez — mismo síntoma que v28.16, causa nueva.
Solución real: como en "hazmat" no hay nada largo para scrollear, no hace falta sticky ahí
en absoluto — `.ap-layout.centrado .ap-preview-sticky { position:static; transform:none; }`
lo deja en flujo normal (ya centrado por `.ap-layout.centrado`), sticky-centrado queda
exclusivo de "Personalizar" (que sí lo necesita, por su columna larga). Verificado con
`getBoundingClientRect` en varios altos de viewport: sin superposición, centrado horizontal
exacto (mismo centerX que el panel).

(Todos existen y están committeados. v3: render cenital con paredes finas autotile en `tiles.js`/`render.js`,
pixel-art data-driven en `sprites.js` con override PNG desde `game/assets/sprites/`, efectos de combate
en `effects.js`, props/contenedores registrables en `mapgen.js`/`game.js`.)

Decisiones de diseño clave:

- **Determinismo**: toda aleatoriedad de partida pasa por `RNG.create(seed)` (mulberry32); las partidas son reproducibles por semilla. No usar `Math.random()` en lógica de juego.
- **Mapas procedurales por bioma**: `MapGen.generate(levelDef, rng)` elige el arquetipo según `levelDef.bioma` (claves de `GENS` en `mapgen.js`: pasillos, garaje, tuneles, hospital, oficinas, exterior, bosque, ciudad, torres). Tiles: 0 suelo, 1 pared, 2 vacío, 3 agua, 4 suelo decorado. Todo mapa pasa por `keepLargest` (un solo componente conexo) y coloca salidas lejos del spawn vía BFS.
- **Esquema de ficha de nivel** (`levels.es.json`): `id`, `wikiTitle`, `nombre`, `clase`, `peligro` (0-5), `bioma` (debe existir en `GENS`), `tam [w,h]`, `paleta`, `vision`, `oscuridad`, `descripcion`, `cita`, `reglas[]`, `entidades [{id,n:[min,max],prob}]`, `objetos [{id,n}]`, `salidas [{texto,destino,tipo,riesgoVoid?}]`, `esEscape`, `url`, y desde v5: `estilo {pared,suelo}` (claves de los switch de `tiles.js`), `particulas` (polvo|nieve|lluvia|glitch|ojos|esporas|vapor|estrellas|null) y `sonido` (receta de `RECETAS` en sfx.js, o null si el nivel tiene audio en assets/sounds/niveles/). Tipos de salida: `normal`, `rara`, `arriesgada`, `llave`, `void`. Los `destino` referencian ids de nivel; `id` de entidades/objetos referencian sus fichas.
- **Fidelidad a la wiki**: las conexiones entre niveles, entidades por nivel y citas provienen de las páginas reales de la wiki; cada ficha conserva su `url`. Al inventar contenido nuevo, mantener coherencia con la ficha parseada correspondiente.
