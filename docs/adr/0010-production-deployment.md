# 0010 — Production deployment: one entry point, Postgres, published images

- **Status:** Accepted
- **Date:** 2026-10-24

## Context
The Compose setup worked on the machine it ran on and nowhere else. The app was built with
`NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`, so a browser on another machine called its own
localhost. The API port was published, SQLite was the database, there was no HTTPS, and the
installer built both images from source (minutes, and a lot of memory on small servers).

## Decision
- **One entry point.** Caddy (`deploy/Caddyfile`) serves the app and the API on one origin:
  `/api/*` and `/healthz` go to the backend, everything else to the app. The app image is built
  with an empty API base URL, so it calls the API on the same origin and one image works on any
  host or domain. No CORS in production, and the session cookie stays first-party.
- **HTTPS by setting a domain.** With `KUBEIQ_DOMAIN`, Caddy gets a Let's Encrypt certificate and
  serves 80/443. Without it, plain HTTP on `KUBEIQ_PORT` (3000). The backend runs uvicorn with
  proxy headers, so cookies are marked Secure behind HTTPS.
- **Postgres in Compose** (`postgres:17-alpine`, own volume, health check). The backend waits for
  it and runs migrations at startup. SQLite stays the default outside Docker (local development).
  `KUBEIQ_DATABASE_URL` in `./.env` points at an external Postgres instead.
- **Only the proxy is published.** The backend, app and database are on the Compose network only.
- **Two env files.** `./.env` holds deployment settings for Compose (version, port, domain,
  database password); `backend/.env` holds app settings (master key, encryption key, AI model).
  The installer generates the secrets in both and keeps them across updates.
- **Published images.** `.github/workflows/images.yml` pushes multi-arch images to GHCR: `main`
  from the main branch, `x.y.z` and `latest` from `vX.Y.Z` tags. The installer pulls the images
  for its ref and builds locally only when none are published.
- **Readiness checks the database.** `/readyz` answers 503 until the database responds; the backend
  health check uses it.

## Consequences
- Installs from before this change move to Postgres on update; their SQLite history is not carried
  over (pre-release, no users to migrate).
- The GHCR packages must be public for anonymous pulls.
- A Helm chart (roadmap) can reuse the same images and the same single-origin layout.
