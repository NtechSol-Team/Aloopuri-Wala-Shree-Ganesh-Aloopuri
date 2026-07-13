#!/usr/bin/env bash
# Redeploy the latest main on this server (run from anywhere on the droplet).
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.."

echo "── Pulling latest code ──"
git pull --ff-only

echo "── Rebuilding & restarting containers ──"
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build

echo "── Cleaning up old images ──"
docker image prune -f >/dev/null

echo "✔ Deployed. Health check:"
curl -fsS "$(grep ^PUBLIC_ORIGIN= deploy/.env | cut -d= -f2)/health" && echo
