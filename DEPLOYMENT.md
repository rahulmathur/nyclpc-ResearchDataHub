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
5) Deploy and test that the UI calls the Beanstalk backend (check network tab in browser dev tools).

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
npm start            # http://localhost:3000, proxies to http://localhost:5000
```

## Troubleshooting
- **DB connection errors:** verify env vars in Elastic Beanstalk console. Check RDS security group allows Beanstalk instance. For RDS, ensure `ca_certificate_aws-rds.pem` is present if SSL verification is enabled.
- **Frontend cannot reach backend:** confirm `REACT_APP_API_URL` on Cloudflare Pages points to the correct Beanstalk domain and check CORS (should be allowed by default).
- **Migrations:** ensure staging RDS user can drop/recreate objects and both `.env.development` / `.env.staging` are valid.
