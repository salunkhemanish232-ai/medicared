# Medicare Hospital Website

## Project layout

- `public/` contains all HTML pages, shared CSS, and frontend JavaScript.
- `database/` contains local JSON fallback data and legacy SQLite data.
- `server.js` serves the website and API.
- MySQL is the production database when `DB_HOST`, `DB_USER`, and `DB_PASSWORD` are configured.

## Technology stack

This project intentionally keeps its working Node.js HTTP server and static HTML/CSS/JavaScript frontend. Replacing it wholesale with Next.js would risk the existing authentication, patient privacy, doctor authorization, and Render deployment flows. The current stack uses:

- Node.js backend with REST-style API routes and secure HTTP-only sessions.
- Semantic HTML, shared CSS, and browser JavaScript for the frontend and PWA shell.
- MySQL through `mysql2` in production, with persistent JSON fallback for local development.
- Render-compatible deployment through `render.yaml`.
- Built-in smoke tests for authentication, doctor authorization, and security boundaries.

See [TECHNOLOGY.md](TECHNOLOGY.md) for the target modernization path and the reasons it remains incremental.

## Run locally

```powershell
npm install
npm start
```

Open `http://localhost:8080`.

Admin access is provisioned from the `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables. If they are left blank, the app seeds a safe demo admin account so the live site remains usable without a custom deployment config: `admin@medicare.local` / `MedicareAdmin!2026`. These credentials are never displayed in the public UI and should be changed for a production deployment.

Online payments and external AI are provider-gated. The application reports their configuration status and refuses to claim a completed payment or AI action until an adapter and provider credentials are configured.

## Use on a phone

1. Connect the phone and computer to the same Wi-Fi.
2. Find the computer IPv4 address with `ipconfig`.
3. Start the server with `npm start`.
4. Open `http://YOUR-COMPUTER-IP:8080` on the phone.
5. Allow Node.js through Windows Firewall if the phone cannot connect.

## MySQL configuration

Set these variables before starting the server:

```powershell
$env:DB_HOST="127.0.0.1"
$env:DB_PORT="3306"
$env:DB_USER="root"
$env:DB_PASSWORD="your-mysql-password"
$env:DB_NAME="medicare_db"
$env:ADMIN_EMAIL="admin@example.com"
$env:ADMIN_PASSWORD="use-a-long-random-password"
npm start
```

The server creates the database and tables automatically when the MySQL user has permission to create databases. If MySQL is unavailable, local development falls back to `database/medicare-db.json`. On Render, the included configuration mounts `/var/data` and sets `DATA_DIR=/var/data`, so fallback data survives restarts when the selected Render plan supports persistent disks.

## Publish online

Use a Node.js host such as Render, Railway, or a VPS and a hosted MySQL provider such as Railway MySQL, Aiven, or PlanetScale.

1. Upload this project to a Git repository.
2. Create a Node web service using `npm install` and `npm start`. Render can use the included `render.yaml`, which configures persistent fallback storage.
3. Add the MySQL environment variables in the hosting dashboard.
4. Set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.
5. Set `PORT` only if the host requires it; the server already reads the host-provided port.
6. Open the public HTTPS URL and test registration, login, appointments, and admin actions.

Do not publish the local JSON database as the production source of truth. Use MySQL for persistent online data and keep credentials in hosting environment variables, never in frontend files.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the production checklist, PWA caching boundary, security notes, database setup, and test commands.

The repository ignores `database/medicare-db.json` and local database files. This prevents test patient records and local credentials from being uploaded to GitHub.
