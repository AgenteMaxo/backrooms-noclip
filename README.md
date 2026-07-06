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
- Escribe una **semilla** en el título para partidas reproducibles (compártela con el chat).
- **Sprites personalizados**: cualquier PNG en `game/assets/sprites/` sustituye al pixel-art
  integrado (ver `LEEME.txt` en esa carpeta).

Objetivo: encontrar una de las rarísimas rutas de escape de vuelta a la realidad.
La muerte es permanente: despiertas otra vez en Level 0.

Parámetros de URL útiles: `?seed=misemilla&autostart=1`, `?render=2d` y `?nofx=1`.

## Estructura

```
pipeline/       Scripts Node (descarga de la wiki, parseo, fichas, mapa, empaquetado)
data/raw/       Snapshot local de Levels, Entities, Objects, Phenomena y Groups (1.113 páginas)
data/parsed/    Grafo estructurado: 734 niveles, 197 entidades, 89 objetos y 137 fenómenos/grupos
data/game/      Fichas jugables en español: 30 niveles, 16 entidades y 13 objetos + mapa-piloto.html
game/           El juego (HTML/JS/Canvas puro, cero dependencias)
```

## Comandos del pipeline (Node)

```
node pipeline/download.js    # re-descargar la wiki (incremental)
node pipeline/parse.js       # wikitext -> data/parsed/*.json
node pipeline/parse.test.js  # pruebas del parser (sin dependencias)
node pipeline/level0-audit.js            # 100 semillas fijas (regresión reproducible)
node pipeline/level0-audit.js --random   # muestra nueva; imprime cómo reproducirla
node pipeline/select-pilot.js # elegir niveles del piloto (BFS desde Level 0)
node pipeline/make-map.js    # regenerar data/game/mapa-piloto.html
node pipeline/build-data.js  # OBLIGATORIO tras editar data/game/*.json -> game/js/data.js
```

## El mapa para el autor

`data/game/mapa-piloto.html` — diagrama con los 30 niveles del piloto y flechas
de qué nivel conduce a cuál, coloreado por peligro, con la ruta de escape marcada (⭐).

## Escalar más allá del piloto

Las 734 páginas de niveles ya están en `data/parsed/levels.json`. Para añadir niveles:
crear su ficha en `data/game/levels.es.json` (bioma, paleta, reglas, entidades, salidas)
y ejecutar `build-data.js`. El motor los acepta sin tocar código.

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
