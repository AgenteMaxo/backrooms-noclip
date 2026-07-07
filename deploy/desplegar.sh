#!/usr/bin/env bash
# BACKROOMS MMO — actualizar el servidor a la última versión del repo.
# Uso (en el VPS): bash /opt/backrooms-mmo/deploy/desplegar.sh
set -euo pipefail
cd /opt/backrooms-mmo
git pull
cd server && npm ci --omit=dev
chown -R mmo:mmo /opt/backrooms-mmo
systemctl restart backrooms-mmo
echo "Desplegado: $(git -C /opt/backrooms-mmo log --oneline -1)"
