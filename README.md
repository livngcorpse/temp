# QuickDrop Core

QuickDrop Core is a minimal temporary file-sharing platform intended for developers. Upload files, generate short-lived share links, protect files with an optional password, and receive live viewer/download notifications.

**Status:** Active development (local/dev-ready)

**Quick summary:**
- Frontend: Next.js (App Router), Tailwind CSS, Socket.IO client
- Backend: Express, PostgreSQL, Socket.IO server, Multer for file uploads
- Live features: viewer counts, download notifications, live expiration countdowns

**Repository layout**
- `frontend/` — Next.js UI and client socket integration
- `backend/` — Express API, DB access (`pg`), Socket.IO server, cleanup cron
- `uploads/` — filesystem storage for uploaded files (served statically)

**Tech stack**
- Node.js + npm
- Next.js 14, React 18
- Express + Socket.IO
- PostgreSQL (pg)
- Tailwind CSS, Framer Motion, Axios

**Features**
- Drag & drop / file picker upload UI
- Select expiration (preset options or custom minutes)
- Optional password protection with bcrypt hashing
- Live viewer count and download notifications for uploaders
- Automatic file expiration + removal from DB and `uploads/`

**Prerequisites**
- Node.js 18+ and npm
- PostgreSQL running locally or a hosted DB with a connection URL

**Environment**
Create a `.env` file in `backend/` (you can copy `.env.example` if provided) with at least:

- `DATABASE_URL` — Postgres connection string (e.g. `postgres://user:pass@localhost:5432/quickdrop`)
- `PORT` (optional) — backend port (defaults to `4000`)

Frontend expects the backend to be available at `http://localhost:4000` by default.

**Setup & Run (local dev)**
1. Install dependencies (run from workspace root or per package):

```bash
cd backend
npm install
cd ../frontend
npm install
```

2. Create the DB and tables (backend):

```bash
cd backend
npm run setup
```

This runs `src/setup.js` which creates the database schema (requires a Postgres server accessible by `DATABASE_URL` or local `postgres` credentials when creating DB).

3. Start backend and frontend in development:

Backend:
```bash
cd backend
npm run dev
```

Frontend:
```bash
cd frontend
npm run dev
```

Open the frontend at `http://localhost:3000` and the API at `http://localhost:4000` (default).

**Database**
- Table: `files` — stores metadata such as `id`, `original_name`, `file_name` (on-disk), `file_size`, `mime_type`, `expiration_timestamp`, `download_count`, `password_hash`.
- Use `npm run setup` in `backend/` to create the `files` table if it doesn't exist.

**API (important endpoints)**
- `POST /api/upload` — multipart upload, fields: `files[]`, `expirationMinutes` (minutes), optional `password`.
- `GET /api/file/:id` — metadata for a file (exists/expired/checks filesystem presence).
- `GET /api/file/:id/check-expiration` — quick expiration status and time remaining.
- `GET /api/download/:id` — streams file as attachment (increments download count).
- `POST /api/download/:id/verify-password` — verify password for protected files.
- `GET /api/health` — simple health check.

When a file expires the server deletes the DB row and attempts to remove the on-disk file from `uploads/`.

**Realtime (Socket.IO)**
- Connect to the same host that serves the backend (e.g. `http://localhost:4000`).
- Client emits:
	- `registerUploader` (fileId) — uploader registers to receive direct events
	- `joinFile` / `leaveFile` (fileId) — viewers join/leave a room for live counts
- Server emits:
	- `viewerCountUpdate` — live viewer counts
	- `downloadNotification` — notifies uploader of a new download
	- `expirationUpdate` — live expiration countdown and terminal state
	- `uploaderState` — initial uploader state (viewer/download/expiration)

**Uploads directory**
- Files are stored under `backend/uploads/` with generated unique names. The server serves this folder statically at `/uploads` but download routes check DB and permission before streaming.

**Notes & development details**
- The backend runs a periodic cleanup cron (`src/cron/cleanup.js`) and a socket-based expiration tracker for better precision. Expired files are removed from disk and DB automatically.
- Upload persistence in the frontend uses `localStorage` (`qd_uploadedFiles`) to show upload success; the app validates persisted entries against the API and removes stale entries when the file is missing or expired.

**Troubleshooting**
- If a file appears in `uploads/` but `GET /api/file/:id` reports not found, confirm the DB row exists and `DATABASE_URL` points to the same DB used by `npm run setup`.
- If expiry isn't showing live, restart the backend so the Socket.IO expiration checker is running.

**Contributing**
- This project is a work-in-progress. Open issues or PRs for bugs, polish, and features. Keep changes focused and follow the existing code style.

---
If you want, I can also add a short `CONTRIBUTING.md`, a `Dockerfile` for local development, or an example `.env.example` file. Let me know which you prefer.
