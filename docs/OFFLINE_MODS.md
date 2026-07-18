# Taller de Mods offline y exportador de Blockbench

Esta integración es **solo para `UN JUGADOR`**. El modo multijugador sigue siendo la experiencia principal y no carga, transmite ni aplica contenido local.

## Alcance del Alpha

- Importación local de `.brmod`, `.bbmodel`, `.glb` y `.gltf` embebido.
- Persistencia en IndexedDB del navegador.
- Previsualización 3D.
- Activación, desactivación y eliminación.
- Props, decoraciones y luminarias como objetos visuales en una partida local.
- Plugin de Blockbench que exporta un `.brmod` declarativo de un solo archivo.

Todavía no se ejecutan scripts de terceros, IA, animaciones jugables, colisiones automáticas ni reemplazos del jugador. Los tipos `item`, `structure`, `character` y `entity` se importan y se documentan, pero en este Alpha no alteran la simulación.

## Seguridad

- Ningún mod puede incluir o ejecutar JavaScript.
- Los identificadores y rutas se validan.
- Se rechazan referencias externas en GLTF.
- Límites: 12 MiB por archivo, 24 MiB por paquete, 64 mods y 16 instancias visuales por mapa.
- El runtime comprueba `window.MODO_LOCAL === true` antes de tocar la escena.

## Formato BRMOD v1

`.brmod` es JSON UTF-8, no un ZIP. Esto mantiene el cliente sin dependencias nuevas y permite abrirlo por `file://`.

```json
{
  "brmodVersion": 1,
  "manifest": {
    "formatVersion": 1,
    "id": "autor.mi_objeto",
    "name": "Mi objeto",
    "version": "1.0.0",
    "content": [{
      "id": "objeto",
      "type": "prop",
      "model": "models/objeto.bbmodel",
      "scale": 0.0625,
      "spawn": { "enabled": false, "levels": ["level-0"], "count": [1, 1] }
    }]
  },
  "files": {
    "models/objeto.bbmodel": {
      "encoding": "json",
      "mime": "application/json",
      "data": {}
    }
  }
}
```

## Blockbench

1. Abre `File > Plugins > Load Plugin from File`.
2. Selecciona `game/assets/tools/backrooms_no_clip_exporter.js`.
3. Crea un modelo genérico de cubos.
4. Usa `Tools > Exportar mod de Backrooms No-Clip`.
5. Importa el `.brmod` desde `MODS · TALLER ALPHA`.

Los grupos o locators cuyos nombres empiezan por `COLLIDER_`, `SPAWN_`, `ANCHOR_`, `DOOR_`, `ENTRANCE_`, `LIGHT_`, `INTERACT_`, `HAND_` o `CAMERA_` se incluyen como marcadores declarativos.
