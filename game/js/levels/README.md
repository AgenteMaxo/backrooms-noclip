# Código específico de niveles

Esta carpeta contiene únicamente comportamiento que no puede expresarse con
la ficha de un nivel (`data/game/levels.es.json`) ni con los sistemas comunes.

## Estructura

```text
levels/
  level.js                 registro común
  level-0/
    level-0.js             comportamiento exclusivo de Level 0
```

Cada módulo registra sus hooks con `Levels.registrar(id, hooks)`. El registro
expone llamadas explícitas como `Levels.frame(...)` y `Levels.turno(...)`; si
un nivel no tiene módulo propio, esas llamadas no hacen nada.

## Dónde colocar cada cosa

- Datos, salidas, entidades y reglas declarativas: `data/game/levels.es.json`.
- Algoritmos compartidos: `engine/`, `systems/`, `sim/` o `mapgen/`.
- Comportamiento exclusivo: `levels/<id>/<id>.js`.
- Recursos exclusivos: `assets/levels/<id>/`.

Las texturas siguen la convención `textures/pared.png` y
`textures/suelo-<n>.png`. Después de añadirlas hay que ejecutar
`node pipeline/build-assets-manifest.js`; ningún módulo de nivel debe sondear
rutas ni implementar su propio cargador de imágenes.

Antes de crear un hook nuevo, comprueba si la mecánica puede reutilizar una
regla o sistema existente. El registro no sustituye a los sistemas comunes.
