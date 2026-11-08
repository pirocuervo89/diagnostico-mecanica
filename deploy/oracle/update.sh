#!/usr/bin/env bash
# Actualiza la web en la VM de Oracle: git pull + rebuild + reinicio.
set -euo pipefail
cd "$(cd "$(dirname "$0")/../.." && pwd)"
git pull --ff-only
docker compose -f deploy/oracle/docker-compose.yml up -d --build --remove-orphans
sleep 5
curl -fsS http://127.0.0.1:3000/api/health && echo
curl -fsS http://127.0.0.1:3000/api/payments/status && echo
