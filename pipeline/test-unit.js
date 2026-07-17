// Ejecuta todos los tests unitarios sin crear procesos hijo. Esto evita el
// spawn EPERM de algunos entornos Windows y mantiene una sola orden estable.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function testsEn(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...testsEn(fullPath));
    else if (entry.name.endsWith('.test.js')) files.push(fullPath);
  }
  return files;
}

for (const file of testsEn(path.join(__dirname, '..', 'game', 'js')).sort()) require(file);
