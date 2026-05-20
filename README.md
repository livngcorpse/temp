# QuickDrop Core

Phase 1 scaffold for the QuickDrop Core temporary file sharing platform.

## Structure

- `frontend/` — Next.js app with Tailwind CSS and a placeholder landing page
- `backend/` — Express server with PostgreSQL connection and health endpoints

## Setup

1. Copy `.env.example` to `.env` in `backend/` and set `DATABASE_URL`.
2. Run `npm install` from the workspace root.
3. Run `npm run dev` from the workspace root to start both frontend and backend.

## Validation

- Frontend build: `cd frontend && npx next build`
- Backend health check: `GET http://localhost:4000/api/health`
- Database test route: `GET http://localhost:4000/api/testdb`
