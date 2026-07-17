# Entrada del cliente

La entrada se divide por responsabilidad:

- `state.js`: estado de movimiento compartido. Cada fuente (`touch`, `gamepad`,
  `automation`) actualiza solo su vector; `main.js` consume el total.
- `touch.js`: eventos DOM del D-pad, joystick y botones táctiles.
- `gamepad-settings.js`: menú, persistencia y reasignación de botones.

Las reglas de movimiento no se duplican aquí. El D-pad llama a
`pasoOffline` mediante el callback que recibe al inicializarse y el movimiento
continuo se resuelve en el bucle común del juego.
