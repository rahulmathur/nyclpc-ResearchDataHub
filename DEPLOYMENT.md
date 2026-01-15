# Deployment Guide

## Target Architecture
- **Backend (staging):** Railway service running the Express API, connected to PostgreSQL (Railway managed or external). Uses self-signed SSL on Railway hosts; AWS RDS CA bundle is supported when provided.
- **Frontend (staging):** Cloudflare Pages serving the React build, calling the Railway backend via `REACT_APP_API_URL`.
- **Development:** unchanged; use `.env.development` locally and `npm run dev` / `npm run dev:staging` for local testing.

## Prerequisites
- Node.js 18+, npm
- PostgreSQL client tools (`psql`, `pg_dump`)
- Accounts: Railway, Cloudflare

## Environment Configuration
Create env files (copy from `.env.example`):
- `backend/.env.development` — dev DB
- `backend/.env.staging` — staging DB (Railway PG or AWS RDS)
- Optionally `frontend/.env.staging` — sets `REACT_APP_API_URL` to the Railway backend URL.

Required backend keys:
```
DB_TYPE=postgresql
DB_HOST=<hostname>
DB_PORT=5432
DB_NAME=<database>
DB_USER=<username>
DB_PASSWORD=<password>
PORT=5000
```
If using AWS RDS, place the CA bundle at `backend/ca_certificate_aws-rds.pem` to enable SSL verification. Railway hosts use self-signed SSL automatically.

## Backend on Railway (staging)
1) In Railway, create a new service from the `backend` directory of this repo.
2) Set build/start:
```
Build: npm install
Start: npm start
Root directory: backend
```
3) Set environment variables from your staging DB (Railway PG or external RDS): `DB_TYPE, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, PORT=5000`.
4) If using external RDS with SSL, add the CA file as a Railway variable/mounted file and set `PGSSLROOTCERT` or keep it at the repo path `ca_certificate_aws-rds.pem`.
5) Deploy and verify `/api/health` on the Railway public domain.

## Frontend on Cloudflare Pages (staging)
1) New Pages project from the repo, root `frontend`.
2) Build command: `npm install && npm run build`
3) Build output directory: `build`
4) Environment variable: `REACT_APP_API_URL=https://<your-railway-backend-domain>`
5) Deploy and smoke test that the UI hits the backend (network tab should call the Railway host).

## Data Migration (Dev → Staging)
Uses `.env.development` as source and `.env.staging` as target (works for Railway PG or RDS):
```
cd backend
npm run migrate:staging
```
This exports dev to a custom-format dump and restores into staging (drops/recreates objects).

## Local Development
```
cd backend && npm install
npm run dev          # uses .env.development
npm run dev:staging  # uses .env.staging
npm run smoke        # health + projects/sites

cd ../frontend && npm install
npm start            # http://localhost:3000, proxies to http://localhost:5000
```

## Troubleshooting
- **DB connection errors:** verify env vars; for Railway hosts, SSL is self-signed (handled automatically). For RDS, ensure `ca_certificate_aws-rds.pem` is present and ingress rules allow the Railway IPs.
- **Frontend cannot reach backend:** confirm `REACT_APP_API_URL` on Cloudflare Pages points to the Railway backend and CORS allows the Pages domain.
- **Migrations:** ensure staging user can drop/recreate objects and both `.env.development` / `.env.staging` are valid.
