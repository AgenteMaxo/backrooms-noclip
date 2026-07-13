# BACKROOMS — No-Clip

Roguelike 2D contextual basado en la [wiki de las Backrooms](https://backrooms.fandom.com),
fiel al lore: niveles, entidades, salidas y mecánicas salen de las páginas reales de la wiki.

## Cómo jugar

**Doble clic en `game/index.html`.** No hace falta servidor, ni internet, ni instalar nada.

- **W / S**: avanzar y retroceder · **A / D**: girar (cada paso = 1 turno)
- **Espacio**: interactuar — cruzar salidas y **registrar muebles** (taquillas, archivadores… con tirada de dado)
- **X**: esperar · **Q / E**: usar la mano izquierda/derecha · **F**: linterna
- **B**: mochila · **M / N**: mapa · **L**: registro · **J**: diario · **C**: Códice
- **1-6**: usar un objeto de la mochila · **ESC**: ajustes · **G**: no-clip (si desbloqueas el Instinto)
- Los niveles visitados persisten durante la expedición; las puertas de retorno sustituyen al antiguo atajo **R**.
- **Perfiles**: crea tu usuario en el título; el Códice registra para siempre los niveles
  que transitas (con su descripción), veces visitados, mejores marcas y escapes.
  Exportable/importable como JSON.
- Sin semilla manual se usa la **semilla diaria**, que cambia a medianoche de Madrid; cambia la geometría de las salas y fija las rutas variables de ese día. Una semilla escrita sigue siendo reproducible y compartible.
- **Sprites personalizados**: cualquier PNG en `game/assets/sprites/` sustituye al pixel-art
  integrado (ver `LEEME.txt` en esa carpeta).

Objetivo: encontrar una de las rarísimas rutas de escape de vuelta a la realidad.
La muerte es permanente: despiertas otra vez en Level 0.

Parámetros de URL útiles: `?seed=misemilla&autostart=1`, `?render=2d` y `?nofx=1`.

## Estructura

```
pipeline/       Scripts Node (descarga de la wiki, parseo, fichas, mapa, empaquetado)
data/raw/       Snapshot local de Levels, Entities, Objects, Phenomena y Groups (1.134 páginas activas)
data/parsed/    Grafo estructurado: 752 niveles, 199 entidades, 88 objetos y 139 fenómenos/grupos
data/game/      Catálogo jugable: 731 niveles, 16 entidades y 84 objetos + mapa.html
game/           El juego (HTML/JS/Canvas puro, cero dependencias)
```

El motor clasifica el catálogo en 31 biomas activos con geometría, paleta, materiales y mobiliario diferenciados.
Las categorías ambientales explícitas de Fandom actúan como contratos: `Darkness` limita
visión e iluminación y `Aquatic` activa agua transitable, oxígeno, ahogo y respiraderos.
Los biomas urbanos generan fachadas, accesos e interiores transitables.

## Comandos del pipeline (Node)

```
node pipeline/download.js    # re-descargar la wiki (incremental)
node pipeline/parse.js       # wikitext -> data/parsed/*.json
node pipeline/parse.test.js  # pruebas del parser (sin dependencias)
node pipeline/level0-audit.js            # 100 semillas fijas (regresión reproducible)
node pipeline/level0-audit.js --random   # muestra nueva; imprime cómo reproducirla
node pipeline/build-levels.js # catálogo parseado - Joke + overrides -> 731 fichas jugables
node pipeline/make-map.js    # regenerar data/game/mapa-piloto.html
node pipeline/make-catalog-map.js # regenerar data/game/mapa.html (catálogo completo)
node pipeline/build-data.js  # OBLIGATORIO tras editar data/game/*.json -> game/js/data.js
```

## El mapa para el autor

`data/game/mapa.html` — explorador del grafo completo con buscador, filtros, entradas,
salidas, peligro, bioma y enlaces a Fandom. Muestra la semilla diaria y resuelve sus rutas
variables; el grafo representa conexiones, no la geometría procedural de paredes y pasillos.
Con el servidor en marcha también está disponible en `http://localhost:8080/mapa.html`.

`data/game/mapa-piloto.html` conserva el mapa reducido del piloto y se regenera por separado.

## Actualizar y personalizar niveles

De las 752 páginas clasificadas como niveles, 21 marcadas como Joke se excluyen. Las 731
restantes se convierten automáticamente en salas jugables. Las 41 fichas cuidadas a mano viven en `data/game/levels.curated.es.json` y
sobrescriben la versión procedural. Tras actualizar la wiki o editar esos overrides,
ejecuta `build-levels.js`, `build-data.js` y `make-map.js`.

## Contribuir

Los Pull Requests son bienvenidos — lee [CONTRIBUTING.md](CONTRIBUTING.md) antes.
Solo el autor acepta cambios en este repositorio.

## Licencia

- **Código y juego**: [PolyForm Noncommercial 1.0.0](LICENSE.md) — © 2026 MeltStudio.
  Puedes usarlo, estudiarlo y modificarlo libremente **sin fines comerciales**.
  Cualquier uso comercial queda reservado al autor.
- **Lore y textos derivados de la wiki**: el contenido descriptivo procede de
  [backrooms.fandom.com](https://backrooms.fandom.com) y pertenece a sus autores
  bajo [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/); cada ficha
  del juego conserva la `url` de su página original como atribución.
- **Terceros vendorizados**: [Three.js](https://threejs.org) r147 (licencia MIT)
  y fuentes tipográficas bajo [SIL OFL](https://openfontlicense.org/) en
  `game/assets/fonts/`.
