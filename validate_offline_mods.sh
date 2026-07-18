#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

for file in \
  game/js/mods/mod-system.js \
  game/js/mods/mod-runtime.js \
  game/js/mods/mod-workshop.js \
  game/assets/tools/backrooms_no_clip_exporter.js \
  tools/blockbench/backrooms_no_clip_exporter.js; do
  test -s "$file"
  node --check "$file"
done

node --test game/js/mods/mod-system.test.js game/js/mods/mod-runtime.test.js

grep -q "window.VERSION_JUEGO = 'v30.15'" game/js/main.js
grep -q 'css/mod-workshop.css?v=297' game/index.html
grep -q 'js/mods/mod-system.js?v=297' game/index.html
grep -q 'js/mods/mod-runtime.js?v=297' game/index.html
grep -q 'js/mods/mod-workshop.js?v=297' game/index.html
grep -q "window.MODO_LOCAL === true" game/js/mods/mod-runtime.js
grep -q "setOfflineMode(false)" game/js/mods/mod-workshop.js
grep -q "setOfflineMode(true)" game/js/mods/mod-workshop.js
grep -q "{ v: 'v30.15'" game/js/ui/changelog.js

python3 - <<'PY'
import json
from pathlib import Path
json.loads(Path('game/assets/mods/manifest.schema.json').read_text(encoding='utf-8'))
print('JSON schema OK')
PY

echo 'Validación Offline Mod Workshop PR completada.'
