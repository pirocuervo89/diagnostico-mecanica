#!/usr/bin/env bash
# Instalación en una VM de Oracle Cloud Always Free (Ubuntu 24.04 ARM/AMD).
# Uso (dentro de la VM, como usuario ubuntu con sudo):
#   git clone <repo> && cd diagnostico-mecanica && bash deploy/oracle/setup.sh
# Requiere un archivo .env en la raíz con las claves (ver .env.example).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_DIR"

echo "===> 1/4 Docker"
if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl git
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo "Docker instalado. Cierra sesión y vuelve a entrar para aplicar el grupo docker."
fi
docker --version
docker compose version

echo "===> 2/4 .env"
if [ ! -f .env ]; then
  echo "Falta .env en la raíz. Crea uno a partir de .env.example con tus claves y vuelve a ejecutar."
  exit 1
fi
chmod 600 .env

echo "===> 3/4 Arrancar app + Caddy (HTTPS automático)"
docker compose -f deploy/oracle/docker-compose.yml up -d --build

echo "===> 4/4 Comprobación"
sleep 5
curl -fsS http://127.0.0.1:3000/api/health && echo
curl -fsS http://127.0.0.1:3000/api/payments/status && echo
docker compose -f deploy/oracle/docker-compose.yml ps
echo "Listo. Revisa el Caddyfile y cambia TU-DOMINIO por tu dominio/IP, luego:"
echo "  docker compose -f deploy/oracle/docker-compose.yml up -d"
