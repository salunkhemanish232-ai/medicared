# Medicare deployment guide

## Render

- Build command: `npm install`
- Start command: `npm start`
- Health check: `/api/health`
- Runtime: Node.js
- Persistent disk: mount `/var/data` and set `DATA_DIR=/var/data` when using JSON fallback.

## Environment variables

Required when using MySQL:

- `DB_HOST`
- `DB_PORT` (default `3306`)
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

Recommended:

- `NODE_ENV=production`
- `DATA_DIR=/var/data`
- `PORT` is supplied by Render.

No credentials or provider keys belong in source control. Email delivery, if added, should be configured through a managed provider using Render secret environment variables. The current reset and verification implementations store short-lived tokens in server memory and intentionally do not return them in API responses; connect an email provider before enabling those flows in production.

## Database setup

1. Create the MySQL database named by `DB_NAME`.
2. Provide the connection variables in Render.
3. Start the service. The server creates its required tables on startup.
4. Keep the persistent disk for JSON fallback data when MySQL is unavailable.

For production healthcare data, use managed MySQL with backups, encryption, access logging, least-privilege credentials, and a tested restore procedure. This project does not claim regulatory or legal compliance without an independent review of hosting, operations, policies, and applicable law.

## PWA and caching

The service worker caches only the public shell (`/`, CSS, JavaScript, manifest, icon, and offline page). It bypasses every `/api/` request, so private appointments, notifications, and medical records are not cached offline.

## Operational checks

- `npm start`
- `node tests/auth-smoke.test.js`
- `node tests/doctor-smoke.test.js`
- `node tests/security-smoke.test.js`

The app uses in-memory sessions. A multi-instance deployment needs a shared session store before scaling beyond one instance.
