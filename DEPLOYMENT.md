# Deployment Guide

## Target Architecture
- **Backend (staging):** AWS Elastic Beanstalk running the Express API, connected to AWS RDS PostgreSQL (with PostGIS support).
- **Frontend (staging):** Cloudflare Pages serving the React build, calling the Elastic Beanstalk backend via `REACT_APP_API_URL`.
- **Development:** unchanged; use `.env.development` locally and `npm run dev` / `npm run dev:staging` for local testing.

## Prerequisites
- **Development:** Node.js 18.x
- **Staging:** Node.js 20.x
- PostgreSQL client tools (`psql`, `pg_dump`)
- AWS account with Elastic Beanstalk and RDS access
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

Frontend environment:
- `frontend/.env.staging` — sets `REACT_APP_API_URL=http://<your-beanstalk-domain>` (use `http://` if Beanstalk doesn't have HTTPS configured)
  - Or `REACT_APP_API_URL=https://<your-beanstalk-domain>` if HTTPS is properly configured

Note: Place the AWS RDS CA bundle at `backend/ca_certificate_aws-rds.pem` if you want SSL certificate verification. The backend will auto-detect and use it when present.

## Backend on AWS Elastic Beanstalk (staging)

### 1. Create Elastic Beanstalk Application
```bash
# Install AWS CLI and EB CLI
pip install awsebcli

# Navigate to repo root
cd /path/to/nyclpc-ResearchDataHub

# Initialize Elastic Beanstalk
# Note: Staging uses Node.js 20
eb init -p "Node.js 20" nyclpc-research-hub-backend --region us-east-1
```

### 2. Create Environment
```bash
eb create staging-backend \
  --instance-type t3.micro \
  --single \
  --envvars "DB_TYPE=postgresql,DB_HOST=<rds-endpoint>,DB_PORT=5432,DB_NAME=LPC-ResearchHub-Staging,DB_USER=nyclpc,DB_PASSWORD=<password>,PORT=5000"
```

Replace `<rds-endpoint>` and `<password>` with your actual RDS values.

### 3. Verify Connection
```bash
# Get the environment URL
eb open

# Or manually test health endpoint
curl https://<your-beanstalk-url>.elasticbeanstalk.com/api/health
```

Expected response:
```json
{
  "status": "ok",
  "database": "connected",
  "dbType": "postgresql"
}
```

### 4. Configure RDS Security Group
AWS Console → RDS → your database → **Security**:
- Edit inbound rules
- Add: Type `PostgreSQL`, Port `5432`, Source = Elastic Beanstalk security group
- Or allow `0.0.0.0/0` for simplicity during testing

### 5. Redeploy on Code Changes
```bash
git push origin staging  # Push changes
eb deploy                 # Auto-deploys the staging environment
```

### Note on SSL
The backend automatically detects RDS hosts and uses the CA certificate if present at `backend/ca_certificate_aws-rds.pem`. For local development or to disable verification temporarily, comment out the SSL section in `server.js` line 31-37.

## Frontend on Cloudflare Pages (staging)
1) New Pages project from the repo, root `frontend`.
2) Build command: `npm install && npm run build`
3) Build output directory: `build`
4) Set environment variable: `REACT_APP_API_URL=http://<your-beanstalk-url>.elasticbeanstalk.com`
   - Use `http://` if Beanstalk doesn't have HTTPS configured (workaround for SSL issues)
   - Use `https://` if Beanstalk has proper HTTPS/SSL setup
   - **Do not add a port** (e.g. no `:5000`). Beanstalk’s public endpoint is on port 80; the app’s `PORT=5000` is only used internally.
5) If using the `functions/api/[[path]].js` proxy, set `BACKEND_URL` to the same URL (no port), or leave unset to use the default.
6) Deploy and test that the UI calls the Beanstalk backend (check network tab in browser dev tools).

**Note on HTTPS/HTTP:** If your Beanstalk environment doesn't have HTTPS properly configured (common with default Elastic Beanstalk setups), use `http://` in `REACT_APP_API_URL` as a workaround. The Cloudflare function will also default to `http://` if no protocol is specified.

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
- Verify env vars in Elastic Beanstalk console. Check RDS security group allows Beanstalk instance. For RDS, ensure `ca_certificate_aws-rds.pem` is present if SSL verification is enabled.

### Frontend cannot reach backend
- Confirm `REACT_APP_API_URL` on Cloudflare Pages points to the correct Beanstalk domain and check CORS (should be allowed by default). If using the `functions/api/[[path]].js` proxy, set `BACKEND_URL` in Cloudflare Pages environment variables instead.

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
   - Note: with Direct Upload, the `functions/` API proxy will **not** be deployed; you’d need to call the Beanstalk URL from the frontend (e.g. via `REACT_APP_API_URL`) or deploy Functions separately.

8. **Contact Cloudflare**  
   If it still fails, use the **deployment ID** (in the deploy URL or log) and contact Cloudflare Support.
