# 📖 MANUAL DEL JUEGO — Backrooms: No-Clip

Guía de todo lo que puedes hacer/modificar tú mismo, sin programar.
*(Este archivo se mantiene actualizado con cada versión del juego.)*

---

## 1. Jugar

**Doble clic en `game/index.html`.** Nada que instalar. Funciona sin internet.

| Tecla | Acción |
|---|---|
| WASD / flechas | Moverte (1 paso = 1 turno; el mundo solo avanza cuando tú actúas) |
| E | Interactuar: cruzar salidas y **registrar muebles** (taquillas, neveras… tirada de dado) |
| Espacio | Esperar un turno |
| F | Encender/apagar linterna (¡su luz atrae a las Deathmoths!) |
| R | Volver al nivel anterior (cuesta cordura) |
| J | Diario de ruta de la partida |
| C | Códice del Errante (tu expediente permanente) |
| M | Silenciar / activar el sonido |
| N | Ampliar el minimapa (también con clic sobre él) |
| 1-6 | Usar objeto del inventario |

*(La tira de teclas también aparece siempre en la parte superior de la pantalla de juego.)*

- **Objetivo**: encontrar una de las rarísimas rutas de escape (⭐). La muerte es permanente.
- Los muebles con **brillo dorado** se pueden registrar con `E`.
- En niveles seguros (peligro 0-1) la cordura se recupera sola poco a poco: úsalos para descansar.
- **Minimapa** (esquina superior derecha): dibuja lo que has explorado y **lo conserva siempre**.
  Solo cambia si el nivel de verdad se reorganiza (Level 0, 27, 130…): lo oirás como un
  derrumbe lejano, y esa zona (solo esa) volverá a quedar sin cartografiar. Clic o `N` amplía.
- **Objetos**: clic en un objeto del inventario → ventana con su información y botón USAR.
  Las teclas 1-6 lo usan directamente sin abrir la ventana.
- **Salidas rituales**: algunas salidas no son puertas — son el objeto exacto que dice la wiki
  (la nave de juguete de Level 483, el reloj digital de Level 80, la máquina expendedora del
  asilo…). Si lees la wiki, sabrás qué buscar. Todas las salidas documentadas de cada nivel
  están en el juego (las que llevan fuera del piloto aparecen grises/selladas).

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
4. Recarga el juego (F5). Si el PNG existe, se usa; si lo borras, vuelve el pixel-art integrado.

**¿Tienes una imagen que NO cumple el formato?** (otro tamaño, sin frames, con fondo…)
→ Déjala en cualquier carpeta del proyecto y dile a Claude *«convierte esta imagen en el sprite
de X»*. Claude la recorta, la escala a 48×48, le monta la hoja de frames y la deja lista.

## 5b. Sonidos

Todo el sonido del juego (pasos, golpes, dados, ambientes…) está **sintetizado por código**:
no necesitas hacer nada para que suene. Tecla `M` para silenciar.

- **Volumen**: slider 🔊 en el HUD y **menú de ajustes ⚙** (junto al slider, o botón en el título)
  con tres canales separados: **General**, **Efectos** y **Ambiente/música**. Todo se recuerda.
- Al pasar de nivel (tarjeta de presentación) el ambiente se detiene y suena un pad suave.
- **Sustituir un efecto**: pon un `.mp3`/`.ogg`/`.wav` en `game/assets/sounds/` con el nombre
  del efecto (`golpe.mp3`, `paso.mp3`…). Lista completa en el `LEEME.txt` de esa carpeta.
- **Ambientes por nivel**: guarda un archivo como `game/assets/sounds/niveles/level-X.mp3`
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

## 8. El mapa de niveles (para ti, no para el juego)

`data/game/mapa-piloto.html` — diagrama con flechas de qué nivel lleva a cuál, coloreado por
peligro y con la ruta de escape marcada. Se regenera con: `node pipeline/make-map.js`

## 9. Actualizar la copia local de la wiki

La wiki completa (1.113 páginas) está en `data/raw/`. Si algún día quieres refrescarla con
páginas nuevas: `node pipeline/download.js` (solo descarga lo que falte).

## 10. Copias de seguridad del proyecto

El proyecto usa git (historial de versiones automático que gestiona Claude). Para una copia
de seguridad simple: copia la carpeta entera `Proyect Backrooms` a un disco externo.
Tu progreso de jugador NO está en la carpeta: expórtalo desde el botón **Exportar** del título.

## 11. Si algo falla

- Pulsa **F12** en el navegador → pestaña «Consola» → haz captura de los mensajes en rojo
  y enséñasela a Claude.
- `index.html?nofx=1` desactiva los efectos visuales (por si algo va lento).
- Borrar una partida guardada corrupta: botón «Borrar» del perfil (crea uno nuevo después).
