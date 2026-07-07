#!/usr/bin/env bash
# BACKROOMS MMO — instalación COMPLETA en un VPS Ubuntu 24.04 recién creado.
# Uso (como root, en el VPS):
#   MMO_DOMINIO=midominio.com bash instalar.sh
# Hace: Node 22, Caddy, firewall, usuario de servicio, clon del repo,
# dependencias, systemd y HTTPS automático. Idempotente: se puede repetir.
set -euo pipefail

DOMINIO="${MMO_DOMINIO:?Falta MMO_DOMINIO (ej: MMO_DOMINIO=midominio.com bash instalar.sh)}"
REPO="https://github.com/AgenteMaxo/backrooms-noclip.git"
RAMA="v21-mmo"   # cambiar a main cuando la v21 se fusione
DESTINO=/opt/backrooms-mmo

echo "== [1/6] Node 22 y utilidades =="
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
apt-get install -y git ufw

echo "== [2/6] Caddy (HTTPS automático) =="
if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy
fi

echo "== [3/6] Firewall: solo web y SSH =="
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable

echo "== [4/6] Código del juego =="
id -u mmo &>/dev/null || useradd -r -m -s /usr/sbin/nologin mmo
if [ -d "$DESTINO/.git" ]; then
  git -C "$DESTINO" fetch origin && git -C "$DESTINO" checkout "$RAMA" && git -C "$DESTINO" pull
else
  git clone -b "$RAMA" "$REPO" "$DESTINO"
fi
cd "$DESTINO/server" && npm ci --omit=dev
chown -R mmo:mmo "$DESTINO"

echo "== [5/6] Servicio de systemd =="
cp "$DESTINO/deploy/backrooms-mmo.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now backrooms-mmo

echo "== [6/6] Caddy con el dominio $DOMINIO =="
sed "s/{\$MMO_DOMINIO}/$DOMINIO/" "$DESTINO/deploy/Caddyfile" > /etc/caddy/Caddyfile
systemctl reload caddy

echo
echo "LISTO: https://$DOMINIO  (el certificado tarda ~1 min la primera vez)"
echo "Clave de admin del chat: edita Environment=MMO_ADMIN en"
echo "  /etc/systemd/system/backrooms-mmo.service  y reinicia:"
echo "  systemctl restart backrooms-mmo"
echo "Estado del mundo: https://$DOMINIO/estado · Logs: journalctl -u backrooms-mmo -f"
