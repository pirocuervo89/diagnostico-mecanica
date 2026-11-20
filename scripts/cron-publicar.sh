#!/usr/bin/env bash
# Cron diario: genera vídeo + publica en redes
set -e
cd /home/selupiro/diagnostico-mecanica
node scripts/video-diario.mjs
node scripts/publicar-redes.mjs
