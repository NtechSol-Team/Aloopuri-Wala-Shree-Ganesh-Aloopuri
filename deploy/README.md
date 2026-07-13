# Deploying SCFC to a DigitalOcean droplet

One droplet runs the whole stack via Docker Compose:

```
Internet ──▶ Caddy (:80/:443) ──▶ /            → web  (Next.js :3000)
                                 /api/*        → api  (Express :4000)
                                 /socket.io/*  → api  (websockets)
                                 /health       → api
Postgres 15 + volumes: pgdata, api_uploads (bill PDFs), caddy_data (TLS certs)
```

Single public origin = no CORS setup, and `NEXT_PUBLIC_API_URL` is simply that origin.

## 1. Create the droplet

- Image: **Ubuntu 24.04 LTS**
- Size: **2 GB RAM minimum** (4 GB comfortable) — the Next.js build is the peak
- Networking: leave ports 80/443 open (default DO firewall allows everything;
  if you attach a Cloud Firewall, allow 22/80/443)

## 2. Bootstrap (one time)

SSH in as root and run:

```bash
curl -fsSO https://raw.githubusercontent.com/<owner>/<repo>/main/deploy/setup-droplet.sh \
  && bash setup-droplet.sh
```

(Private repo? Just copy the script over: `scp deploy/setup-droplet.sh root@<ip>:` — it
will ask for the clone URL, where you can embed a GitHub PAT:
`https://<PAT>@github.com/<owner>/<repo>.git`.)

The script installs Docker, clones the repo to `/opt/scfc`, generates strong secrets
into `deploy/.env`, asks whether you have a domain (→ automatic HTTPS) or want
IP-only HTTP to start, builds, starts everything, and optionally seeds the database
(admin login `admin@suratfood.com` / `Admin@123` — change it immediately).

## 3. Updates

After pushing to `main` on GitHub:

```bash
ssh root@<droplet-ip> 'bash /opt/scfc/deploy/deploy.sh'
```

## 4. Moving from IP to a domain later

1. Point an A record (e.g. `erp.yourdomain.com`) at the droplet IP.
2. In `/opt/scfc/deploy/.env` set `PUBLIC_ORIGIN=https://erp.yourdomain.com` and
   `SITE_ADDRESS=erp.yourdomain.com`.
3. `bash /opt/scfc/deploy/deploy.sh` — Caddy fetches the Let's Encrypt certificate
   automatically; the web image rebuilds with the new origin baked in.

> HTTPS matters beyond cosmetics: Chrome's **Web Bluetooth** printing path (tablets
> without the Print Bridge app) only works on secure origins. The Print Bridge APK
> itself is fine with plain http.

## 5. Android tablets

Install the SCFC Print Bridge APK (see `apps/android-print-bridge/`), open it, and
enter the `PUBLIC_ORIGIN` address as the server URL.

## Useful commands (on the droplet)

```bash
cd /opt/scfc/deploy
docker compose -f docker-compose.prod.yml ps               # status
docker compose -f docker-compose.prod.yml logs -f api      # API logs
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U surat surat_food_chain > /root/backup.sql     # DB backup
```
