# QuickDrop Core

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js" />
  <img src="https://img.shields.io/badge/Express-4.x-green?style=for-the-badge&logo=express" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-blue?style=for-the-badge&logo=postgresql" />
  <img src="https://img.shields.io/badge/Socket.IO-4.x-white?style=for-the-badge&logo=socket.io" />
  <img src="https://img.shields.io/badge/Supabase-Storage-3ECF8E?style=for-the-badge&logo=supabase" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker" />
</p>

<p align="center">
  A fast, minimal, developer-focused temporary file sharing platform with real-time feedback.
  <br />
  Upload files, generate short-lived share links, protect with passwords, and receive live viewer/download notifications.
</p>

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Database Setup (Supabase)](#database-setup-supabase)
- [Storage Bucket Setup (Supabase)](#storage-bucket-setup-supabase)
- [Local Development Setup](#local-development-setup)
- [Docker Setup](#docker-setup)
- [Hosting & Deployment](#hosting--deployment)
  - [Backend on Render](#backend-on-render)
  - [Frontend on Vercel](#frontend-on-vercel)
- [Environment Variables Reference](#environment-variables-reference)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)

---

## Features

- **Drag & Drop Uploads** — instantly upload one or more files (up to 500 MB each)
- **Temporary Share Links** — every file gets a short-lived URL at `/f/:id`
- **Expiration Control** — preset options (1h, 24h, 7d) or a custom duration in minutes
- **Password Protection** — optional bcrypt-hashed password on any upload
- **Live Upload Progress** — real-time progress bars powered by Socket.IO
- **Download Notifications** — uploaders receive instant in-app toasts when someone downloads
- **Live Viewer Count** — see how many people are currently viewing a file page
- **Expiration Countdown** — synchronized server-side countdown pushed to every viewer
- **QR Code Sharing** — every share link renders an instant QR code
- **Auto Cleanup** — a cron job runs every 5 minutes to delete expired files from storage and the database
- **Security Hardened** — Helmet, rate limiting, MIME validation, filename sanitization

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14 (App Router), React 18, Tailwind CSS, Framer Motion |
| **Backend** | Node.js, Express 4, Socket.IO 4 |
| **Database** | PostgreSQL (via `pg` driver) |
| **File Storage** | Supabase Storage (S3-compatible) |
| **Real-time** | Socket.IO (WebSocket + polling fallback) |
| **Auth / Passwords** | bcrypt |
| **File Upload** | Multer (temp disk → Supabase) |
| **Security** | Helmet, express-rate-limit, validator |
| **Containerisation** | Docker (backend), Vercel (frontend) |

---

## Architecture Overview

```
Browser
  │
  ├── REST  ──────────────────▶  Express API  ──▶  PostgreSQL
  │                                   │
  └── WebSocket  ─────────────▶  Socket.IO        Supabase Storage
                                      │                  ▲
                                  Cron Job ──────────────┘
                              (cleanup every 5 min)
```

- The **frontend** is a statically-exported Next.js app deployed on Vercel.
- The **backend** is a Docker-containerised Express server deployed on Render (or any platform that runs Docker).
- Files are stored in **Supabase Storage** and never written to the container's disk permanently.
- **PostgreSQL** holds all file metadata and is provisioned separately (Supabase DB, Render Postgres, or any managed PG service).

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 18 |
| npm | ≥ 9 |
| Docker & Docker Compose | latest |
| PostgreSQL | ≥ 14 (local) **or** a hosted instance |
| Supabase account | free tier is sufficient |

---

## Database Setup (Supabase)

> You can also use **Render Postgres**, **Railway**, **Neon**, or a local Postgres instance. The steps below use Supabase because it bundles both the database and file storage in one place.

### 1 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New project**, choose a name, region, and strong database password.
3. Wait for provisioning (≈ 1 minute).

### 2 — Grab the connection string

1. In your project dashboard go to **Settings → Database**.
2. Copy the **Connection string (URI)** under *Connection Pooling* (port 6543) for production, or the direct connection (port 5432) for migrations.
3. It looks like:
   ```
   postgres://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```

### 3 — Create the schema

Run the setup script once (locally or via the Supabase SQL editor):

```sql
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_name VARCHAR(255) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100),
  upload_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expiration_timestamp TIMESTAMP NOT NULL,
  uploader_ip VARCHAR(45),
  password_hash VARCHAR(255),
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Or run the bundled script from the backend:

```bash
cd backend
DATABASE_URL="your-connection-string" npm run setup
```

---

## Storage Bucket Setup (Supabase)

### 1 — Create a bucket

1. In your Supabase project go to **Storage → Buckets → New bucket**.
2. Name it `quickdrop-uploads` (or anything you like — just match it in your env var).
3. **Uncheck** "Public bucket" — the backend streams files privately via a service-role key.

### 2 — Get credentials

| Value | Where to find it |
|---|---|
| `SUPABASE_URL` | **Settings → API** → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **Settings → API** → `service_role` secret |
| `SUPABASE_BUCKET_NAME` | the bucket name you just created |

> **Security note:** the service-role key has full bypass access. Keep it only in backend environment variables — never expose it to the browser.

---

## Local Development Setup

### 1 — Clone the repository

```bash
git clone https://github.com/your-username/quickdrop-core.git
cd quickdrop-core
```

### 2 — Install dependencies

```bash
npm install --workspaces
# or run individually:
cd backend && npm install
cd ../frontend && npm install
```

### 3 — Configure environment variables

**Backend** — create `backend/.env`:

```env
PORT=4000
DATABASE_URL=postgres://localhost:5432/quickdrop

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_BUCKET_NAME=quickdrop-uploads

# Optional — set to "true" to force SSL on the DB connection
# DB_SSL=true
```

**Frontend** — create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

### 4 — Initialise the database

```bash
cd backend
npm run setup
```

### 5 — Start both servers

```bash
# From the repo root (runs both concurrently)
npm run dev
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:4000/api |
| Health check | http://localhost:4000/api/health |

---

## Docker Setup

The backend ships with a `Dockerfile`. The frontend is not containerised and is expected to be deployed to Vercel (or any static host).

### Build the backend image

```bash
cd backend
docker build -t quickdrop-backend .
```

### Run the backend container

```bash
docker run -d \
  -p 4000:4000 \
  -e DATABASE_URL="your-postgres-connection-string" \
  -e SUPABASE_URL="https://your-project.supabase.co" \
  -e SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
  -e SUPABASE_BUCKET_NAME="quickdrop-uploads" \
  -e NODE_ENV=production \
  --name quickdrop-backend \
  quickdrop-backend
```
---

## Hosting & Deployment

### Backend on Render

1. Push your code to GitHub.
2. Go to [render.com](https://render.com) → **New → Web Service**.
3. Connect your GitHub repository.
4. Configure the service:

| Setting | Value |
|---|---|
| **Environment** | Docker |
| **Dockerfile path** | `backend/Dockerfile` |
| **Instance type** | Free or Starter |
| **Port** | `4000` |

5. Add the following **Environment Variables** in the Render dashboard:

```
DATABASE_URL          = your-supabase-or-render-postgres-url
SUPABASE_URL          = https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY = your-service-role-key
SUPABASE_BUCKET_NAME  = quickdrop-uploads
NODE_ENV              = production
DB_SSL                = true
```

6. Click **Create Web Service** — Render builds the Docker image and deploys automatically.
7. Note your backend URL (e.g. `https://quickdrop-backend.onrender.com`).

> **Free tier note:** Render's free services spin down after 15 minutes of inactivity and take ~30 seconds to wake. Upgrade to Starter ($7/mo) for always-on behaviour.

---

### Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project**.
2. Import your GitHub repository.
3. Set the **Root Directory** to `frontend`.
4. Add the **Environment Variable**:

```
NEXT_PUBLIC_API_URL = https://quickdrop-backend.onrender.com/api
```

5. Click **Deploy**.

Vercel auto-detects Next.js and handles all build settings. Every push to your main branch triggers a redeployment.

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: `4000`) |
| `DATABASE_URL` | **Yes** | PostgreSQL connection string |
| `DB_SSL` | No | Set to `true` to enable SSL for remote PG connections |
| `SUPABASE_URL` | **Yes** | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Supabase service-role secret key |
| `SUPABASE_BUCKET_NAME` | **Yes** | Storage bucket name |
| `NODE_ENV` | No | `development` or `production` |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | **Yes** | Full URL to the backend API (e.g. `http://localhost:4000/api`) |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/upload` | Upload one or more files |
| `GET` | `/api/file/:id` | Get file metadata |
| `GET` | `/api/file/:id/check-expiration` | Get expiration status |
| `GET` | `/api/download/:id` | Stream and download a file |
| `POST` | `/api/download/:id/verify-password` | Verify password for a protected file |

### `POST /api/upload`

**Form fields:**

| Field | Type | Description |
|---|---|---|
| `files` | `File[]` | Up to 10 files (max 500 MB each) |
| `expirationMinutes` | `number` | Minutes until expiry (min: 1) |
| `password` | `string` | Optional password (min 4 chars) |

**Response:**

```json
{
  "success": true,
  "files": [
    {
      "fileId": "uuid",
      "fileName": "report.pdf",
      "fileSize": 204800,
      "shareLink": "/f/uuid",
      "expiresAt": "2025-05-24T10:00:00.000Z",
      "downloadCount": 0,
      "passwordProtected": false
    }
  ]
}
```

### Rate Limits

| Endpoint | Limit |
|---|---|
| All `/api/*` routes | 100 req / 15 min per IP |
| `POST /api/upload` | 10 uploads / hour per IP |
| `GET /api/download/*` | 20 downloads / hour per IP |
| `GET /api/file/*` | 50 requests / hour per IP |
| `POST /api/download/*/verify-password` | 5 attempts / 15 min per IP |

---

## Project Structure

```
quickdrop-core/
├── backend/
│   ├── src/
│   │   ├── cron/
│   │   │   └── cleanup.js          # Expired file cleanup job
│   │   ├── middleware/
│   │   │   └── security.js         # Sanitisation, validation, rate limit helpers
│   │   ├── db.js                   # PostgreSQL pool
│   │   ├── index.js                # Express server entry point
│   │   ├── multer.js               # Multer config + password utils
│   │   ├── routes.js               # All REST routes
│   │   ├── setup.js                # DB schema creation script
│   │   ├── sockets.js              # Socket.IO server + expiration tracker
│   │   └── storage.js              # Supabase storage adapter
│   ├── .env.example
│   ├── Dockerfile
│   └── package.json
│
├── frontend/
│   ├── app/
│   │   ├── f/[id]/page.js          # File detail / download page
│   │   ├── globals.css
│   │   ├── layout.js
│   │   └── page.js                 # Landing / upload page
│   ├── components/
│   │   ├── DownloadNotificationToast.tsx
│   │   └── FileUpload.js
│   ├── lib/
│   │   └── api.js                  # Axios instance
│   ├── sockets/
│   │   └── socketContext.js        # Socket.IO React context + provider
│   ├── .env.example
│   └── package.json
│
├── package.json                    # Workspace root + concurrently dev script
├── ngrok.yml                       # Optional tunnel config for local testing
└── README.md
```

---

## Socket.IO Event Reference

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `registerUploader` | `fileId: string` | Register to receive download + expiration events for a file |
| `joinFile` | `fileId: string` | Join a file's viewer room (increments live count) |
| `leaveFile` | `fileId: string` | Leave a file's viewer room |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `viewerCountUpdate` | `{ fileId, count }` | Live viewer count for a file |
| `downloadNotification` | `{ fileId, fileName, downloadCount, timestamp }` | Sent to the uploader on each download |
| `expirationUpdate` | `{ fileId, timeRemaining, isExpired, formattedTime }` | Countdown update every 5 seconds |
| `uploaderState` | `{ fileId, viewerCount, downloadCount, expirationTimestamp }` | Initial state sent on uploader registration |
| `uploadProgress` | `{ fileId, progress }` | Upload progress percentage |
| `fileUploaded` | `{ fileId, data }` | Fired when an upload completes |

---

<p align="center">Built with ❤️ — contributions welcome via pull request.</p>
