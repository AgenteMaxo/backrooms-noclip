---
name: verify
description: Verificación e2e del MMO en este repo — servidor real + Chrome headless por CDP crudo (sin puppeteer), capturas del juego y de los paneles del guardián.
---

# Verificar cambios del BACKROOMS MMO de punta a punta

Sin dependencias nuevas: el CDP se habla a pelo con el paquete `ws` que ya
vive en `server/node_modules`.

## Receta que funciona (v30)

1. **Servidor real**: `spawn(node, ['server/server.js', PUERTO])` con
   `MMO_DEV: '1'` (habilita `?nivel=`) y `MMO_ADMIN: 'clave-x'`.
   OJO: `server/datos/admin-clave.txt` PISA a MMO_ADMIN si existe — los tests
   serios leen la clave real del stdout (`clave de admin: \/admin (\S+)`).
2. **Chrome headless**:
   `"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new
   --use-angle=swiftshader --remote-debugging-port=9333 --user-data-dir=<tmp>
   --window-size=1280,800 --mute-audio` — swiftshader hace funcionar el
   render 3D sin GPU (lento pero real).
3. **Pestañas por CDP**: `PUT /json/new?<url>` (es PUT, no GET) →
   `webSocketDebuggerUrl` → ws con `{id, method, params}`. Comandos útiles:
   `Runtime.evaluate` (con `returnByValue:true`), `Page.captureScreenshot`,
   `Input.dispatchKeyEvent` (teclas reales).
4. **Entrar al juego sin UI**: navegar a `http://127.0.0.1:PUERTO/?online=1&nombre=X`
   — crea perfil y conecta solo. Esperar `window.Net && Net.activo`.
   Guardián: `Net.admin('clave-x')` y esperar `Game.world.esAdmin === true`.
5. **Moverse**: `Net.setInput(dx, dy)` desde evaluate (vector continuo).
6. **Panels del guardián**: `/observatorio` y `/observatorio/mapa` leen la
   clave de `sessionStorage['obs-clave']` → setItem + `location.reload()`.
   Endpoints: `/observa?clave=`, `/grafo?clave=`, POST `/accion`
   ({clave, accion: kick|ban|espectar|espectar-fin|anuncio, id?, txt?}).

Ejemplo completo que hizo todo esto (espectador v30):
el arnés vivió en el scratchpad como `verifica-espectador.js`; el patrón de
las clases `Tab`/`nuevaPestana` merece copiarse tal cual.

## Gotchas

- Los arneses ws de `server/test-*.js` mandan `v:` en el `hola`: al subir
  `P.VERSION` hay que tocarlos TODOS (y `bots.js` y `cliente.js`).
- ESPACIO junto a taquilla te ESCONDE (informes ignorados) — en arneses,
  salir antes de navegar.
- Para lógica sin 3D: `?render=2d&nofx=1` (los selftests siempre van así).
- Puertos: los tests fijos usan 8124-8127; usar 82xx para humo evita choques.
