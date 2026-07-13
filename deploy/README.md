# Desplegar BACKROOMS MMO en tu servidor

Tutorial completo para dejar el juego publicado en internet. Necesitas:

- Un servidor **Ubuntu 22.04/24.04** con acceso root (SSH).
- Un **dominio** con un registro DNS tipo **A** apuntando a la IP del servidor
  (si no tienes dominio, mira «Sin dominio» abajo).

## Opción rápida (un comando)

Entra al servidor por SSH y ejecuta:

```bash
curl -fsSL https://raw.githubusercontent.com/AgenteMaxo/backrooms-noclip/v21-mmo/deploy/instalar.sh -o instalar.sh
MMO_DOMINIO=tudominio.com bash instalar.sh
```

Eso instala Node 22, Caddy (HTTPS automático con Let's Encrypt), el firewall,
clona el juego en `/opt/backrooms-mmo`, y deja el servicio arrancando solo.
En ~2 minutos, `https://tudominio.com` es el juego.

## Paso a paso (si prefieres hacerlo a mano)

```bash
# 1. Node 22+ (el servidor usa node:sqlite, incluido desde Node 22.13)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs git

# 2. El juego
git clone -b v21-mmo https://github.com/AgenteMaxo/backrooms-noclip.git /opt/backrooms-mmo
cd /opt/backrooms-mmo/server && npm ci --omit=dev

# 3. Probarlo a pelo (Ctrl+C para parar)
node server.js 8080     # → http://IP-del-servidor:8080

# 4. Servicio permanente (arranca al encender, se reinicia si se cae)
useradd -r -m -s /usr/sbin/nologin mmo
chown -R mmo:mmo /opt/backrooms-mmo
cp deploy/backrooms-mmo.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now backrooms-mmo

# 5. HTTPS con tu dominio (Caddy)
apt-get install -y caddy   # (repositorio oficial: ver instalar.sh)
sed 's/{$MMO_DOMINIO}/tudominio.com/' deploy/Caddyfile > /etc/caddy/Caddyfile
systemctl reload caddy
```

## Sin dominio (solo IP)

Sin dominio no hay certificado HTTPS, pero el juego funciona igual por HTTP:
abre el puerto y juega en `http://IP:8080`.

```bash
ufw allow 8080/tcp
systemctl enable --now backrooms-mmo   # el servicio ya escucha en 8080
```

(Cuando tengas dominio, añade Caddy como en el paso 5 y cierra el 8080.)

## La clave de administración (moderación en el chat)

En el chat del juego: `/admin tu-clave-secreta` te convierte en guardián →
`/anuncio <texto>` (global), `/kick <nombre>`, `/mute <nombre> [min]`, `/ban <nombre>`,
`/tp <nivel>` (teletransporte de debug: `/tp 14` o `/tp level-483`), `/give <objeto>`
(añade un objeto a tu mochila) y `/reiniciar` (reinicia el proceso del servidor:
anuncia a todos, sale limpio y systemd lo revive en ~3 s — el mundo vivo se
resetea, jugadores/baneos persisten). No escribas la clave en directo.

**Cambiar la clave sin reiniciar el servidor**: una vez seas guardián,
`/admin-clave <nueva>` la cambia AL INSTANTE y la guarda en
`server/datos/admin-clave.txt` (fuera del repo, nunca se sube a GitHub) —
sobrevive a que el proceso se reinicie solo. Es la forma recomendada de
cambiarla; no hace falta SSH para esto.

**Arranque inicial / si no tienes ninguna clave aún**: edita
`/etc/systemd/system/backrooms-mmo.service` y cambia
`Environment=MMO_ADMIN=tu-clave-secreta`, luego
`systemctl daemon-reload && systemctl restart backrooms-mmo`. Esta variable
solo se usa si `server/datos/admin-clave.txt` no existe todavía — en cuanto
uses `/admin-clave` una vez, el fichero manda.

## Operación diaria

| Qué                       | Cómo                                                  |
|---------------------------|-------------------------------------------------------|
| Actualizar el juego       | `bash /opt/backrooms-mmo/deploy/desplegar.sh`         |
| Ver jugadores/salas/rendimiento | `https://tudominio.com/estado`                  |
| Logs en vivo              | `journalctl -u backrooms-mmo -f`                      |
| Reiniciar                 | `systemctl restart backrooms-mmo`                     |
| Copia de la base de datos | guarda `/opt/backrooms-mmo/server/datos/mmo.db`       |

**Rendimiento medido**: 501 jugadores simultáneos → tick medio 3,5 ms y 192 MB
de RAM. Un VPS de 2 GB va sobradísimo.
