# Deployment Guide

## Target Architecture
- **Backend (staging):** EC2 at `https://acris.nyclpc.com/nyclpcrdh/v1/`, running the Express API (PostgreSQL/PostGIS).
- **Frontend (staging):** Cloudflare Pages serving the React build; `functions/api/[[path]].js` proxies `/api/*` to the EC2 backend.
- **Development:** unchanged; use `.env.development` locally and `npm run dev` / `npm run dev:staging` for local testing.

## Prerequisites
- **Development:** Node.js 18.x
- **Staging:** Node.js 20.x
- PostgreSQL client tools (`psql`, `pg_dump`)
- AWS RDS (or compatible PostgreSQL) for the backend database
- Cloudflare account

**Note:** Development branch uses Node 18, staging branch uses Node 20. Use `nvm use` or check `.nvmrc` file in backend directory.

## Environment Configuration
Create env files (copy from `.env.example`):
- `backend/.env.development` — dev RDS
- `backend/.env.staging` — staging RDS

Required backend keys:
```
DB_TYPE=postgresql
DB_HOST=<your-rds-endpoint>
DB_PORT=5432
DB_NAME=<database>
DB_USER=<username>
DB_PASSWORD=<password>
PORT=5000
```

Frontend: the `functions/api` proxy uses `BACKEND_URL` (default `https://acris.nyclpc.com/nyclpcrdh/v1`). No `REACT_APP_API_URL` needed when using the proxy.

Note: Place the AWS RDS CA bundle at `backend/ca_certificate_aws-rds.pem` if the backend needs SSL verification for RDS. The backend will auto-detect and use it when present.

## Backend (staging, EC2)

The staging API is deployed manually on EC2 at `https://acris.nyclpc.com/nyclpcrdh/v1/`. Environment variables (DB_*, PORT, etc.) and RDS/SSL are configured on the server.

**Verify:** `curl https://acris.nyclpc.com/nyclpcrdh/v1/api/health` — expect `{"status":"ok","database":"connected","dbType":"postgresql"}`.

### Redeploy Backend to EC2

Use git on EC2 to get and update the code. Replace `USER@EC2_HOST` with your SSH user and host, and `REPO_URL` with your repo (e.g. `https://github.com/YOUR_ORG_OR_USER/nyclpc-ResearchDataHub.git`).

---

#### First-time setup on EC2 (clone once)

SSH in and clone the `staging` branch:

```bash
cd /path/to/parent   # e.g. /home/ec2-user
git clone -b staging REPO_URL nyclpc-ResearchDataHub
cd nyclpc-ResearchDataHub/backend
```

- Create `backend/.env` from `backend/.env.example` (or copy from another server) with `DB_*`, `PORT`, etc.
- If using RDS SSL: ensure `ca_certificate_aws-rds.pem` is in `backend/`.
- Then: `npm ci --production` and start the app (PM2, systemd, or `node server.js`).

---

#### Subsequent redeploys (git pull on EC2)

1. **SSH in:** `ssh USER@EC2_HOST`

2. **Go to repo and pull latest `staging`**
   ```bash
   cd /path/to/nyclpc-ResearchDataHub
   git fetch origin
   git checkout staging
   git pull origin staging
   ```
   If you get `fatal: 'origin' does not appear to be a git repository`, add it:
   ```bash
   git remote add origin REPO_URL
   git fetch origin
   git checkout -b staging origin/staging
   git pull origin staging
   ```

3. **Install deps and restart**
   ```bash
   cd backend
   npm ci --production
   ```
   If you use Node via `nvm`: `nvm use` or `nvm use 20` before `npm ci`.  
   Restart the app:
   - **PM2:** `pm2 restart nyclpc-rdh` or `pm2 restart all`
   - **systemd:** `sudo systemctl restart nyclpc-rdh`
   - **screen/tmux or direct:** stop the process (Ctrl+C), then `node server.js` or `npm start`

   (.env and `ca_certificate_aws-rds.pem` stay as-is between deploys; only change them when updating config.)

---

#### Verify

4. **From your Mac (or any machine):**
   ```bash
   curl -s "https://acris.nyclpc.com/nyclpcrdh/v1/api/health"
   ```
   Expect: `{"status":"ok","database":"connected","dbType":"postgresql"}`.

5. **Sites route (confirms `/api/sites/list` is deployed):**
   ```bash
   curl -s "https://acris.nyclpc.com/nyclpcrdh/v1/api/sites/list?limit=5&offset=0"
   ```
   Expect: `{"success":true,"data":[...],"count":...}`.

6. **In the browser:** Open the staging frontend and confirm the Sites page loads without 404s.

## Frontend on Cloudflare Pages (staging)
1) New Pages project from the repo, root `frontend`.
2) Build command: `npm install && npm run build`
3) Build output directory: `build`
4) If using the `functions/api/[[path]].js` proxy (default): set `BACKEND_URL` to the API base URL, or leave unset to use the default.
   - **Staging (EC2):** `https://acris.nyclpc.com/nyclpcrdh/v1` (no trailing slash). Proxies `/api/health` to `https://acris.nyclpc.com/nyclpcrdh/v1/api/health`.
5) Deploy and test that the UI calls the backend (check network tab in browser dev tools).


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
npm start            # http://localhost:3000, proxies to http://localhost:5001
```

## Troubleshooting

### DB connection errors
- Verify env vars on the EC2/backend server. Check RDS security group allows the backend instance. For RDS, ensure `ca_certificate_aws-rds.pem` is present if SSL verification is enabled.

### Frontend cannot reach backend
- If using the `functions/api/[[path]].js` proxy, set `BACKEND_URL` in Cloudflare Pages to the API base (e.g. `https://acris.nyclpc.com/nyclpcrdh/v1`) and check CORS. See `CLOUDFLARE_CHECKLIST.md`.

### Migrations
- Ensure staging RDS user can drop/recreate objects and both `.env.development` / `.env.staging` are valid.

### Cloudflare Pages: "The deployment failed due to an internal error"

This is a generic Cloudflare error. Try in order:

1. **Check the build log**  
   Dashboard → your Pages project → **Deployments** → failed deploy → **View build log**. See whether it fails during **Cloning**, **Installing dependencies**, **Building**, or **Deploying**.

2. **Confirm build settings** (Root = `frontend`):
   - **Build command:** `npm run build` or `npm ci && npm run build`
   - **Build output directory:** `build`
   - **Root directory (Project root):** `frontend`

3. **Pin Node.js**  
   - `frontend/.nvmrc` with `18` is in the repo; Cloudflare should use it when root is `frontend`.  
   - Or in Pages → **Settings** → **Environment variables**, add `NODE_VERSION` = `18` (Production and Preview).

4. **Retry and clear cache**  
   - **Retry deployment** from the Deployments tab.  
   - If it still fails: **Settings** → **Builds & deployments** → **Build configuration** → **Clear build cache**, then redeploy.

5. **Use a simpler build command**  
   If `npm install && npm run build` fails, try `npm run build` only (Cloudflare may run `npm install` by default for some presets).

6. **Git / integration**  
   - Ensure the GitHub (or GitLab) connection is OK: **Settings** → **Builds & deployments** → **Build configuration** → **Connected repository**.  
   - Reconnect or re-authorize if needed.

7. **Build locally and deploy output (workaround)**  
   If the Pages build always fails (e.g. memory or env limits):
   - Locally: `cd frontend && npm ci && npm run build`
   - Deploy the `frontend/build` folder via **Direct Upload** (Pages → **Create project** → **Direct Upload**) or `wrangler pages deploy frontend/build --project-name=your-pages-project`.  
   - Note: with Direct Upload, the `functions/` API proxy will **not** be deployed; you’d need to call the backend URL from the frontend (e.g. via `REACT_APP_API_URL`) or deploy Functions separately.

8. **Contact Cloudflare**  
   If it still fails, use the **deployment ID** (in the deploy URL or log) and contact Cloudflare Support.
