# Deployment Guide

## Railway Deployment (Staging Environment)

### Prerequisites
- Railway account (free tier available)
- GitHub repository connected to Railway

### Setup Steps

#### 1. Create Railway Project
1. Go to [railway.app](https://railway.app) and sign up/login
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose this repository

#### 2. Add PostgreSQL Database
1. In your Railway project, click "+ New"
2. Select "Database" → "PostgreSQL"
3. Railway will provision a new PostgreSQL instance
4. Note: Database credentials are auto-configured

#### 3. Configure Backend Service
1. Click "+ New" → "GitHub Repo"
2. Select this repository
3. Configure service settings:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

4. Set environment variables:
   ```
   DB_TYPE=postgresql
   DB_HOST=${{Postgres.PGHOST}}
   DB_PORT=${{Postgres.PGPORT}}
   DB_NAME=${{Postgres.PGDATABASE}}
   DB_USER=${{Postgres.PGUSER}}
   DB_PASSWORD=${{Postgres.PGPASSWORD}}
   PORT=5000
   ```
   (Railway auto-fills `${{Postgres.*}}` references)

#### 4. Seed the Database
After first deployment, run seed script:
1. In Railway, open your backend service
2. Go to "Settings" → "Deploy"
3. Add a one-time run command or use the CLI:
   ```bash
   railway run npm run seed
   ```

Or manually trigger from your local machine:
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and link project
railway login
railway link

# Run seed
railway run npm run seed
```

#### 5. Configure Frontend Service
1. Click "+ New" → "GitHub Repo" (same repo)
2. Configure service settings:
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npx serve -s build -l $PORT`

3. Set environment variables:
   ```
   REACT_APP_API_URL=${{backend.RAILWAY_PUBLIC_DOMAIN}}
   ```

4. Update frontend proxy (if needed):
   - Edit `frontend/package.json`
   - Update proxy to point to Railway backend URL

#### 6. Deploy
- Railway auto-deploys on push to `main` branch (or configure specific branch)
- Each push triggers rebuild and deployment
- Database persists between deployments

### Branch Strategy (Development vs Staging)

#### Option A: Branch-based environments
- `main` branch → Development (local database)
- `staging` branch → Railway (Railway database)

Configure Railway to deploy from `staging` branch:
1. Railway project settings → "Deploy" → "Branch"
2. Select `staging`

#### Option B: Separate Railway projects
- Create two Railway projects:
  - "DataFlow Dev" (deploys from `main`)
  - "DataFlow Staging" (deploys from `staging`)

### Database Sync Workflow

To sync development data to staging:
```bash
# From your local machine
cd backend
npm run seed  # Updates staging database with fresh seed data
```

Or manually sync:
```bash
# Export from development database
pg_dump -h localhost -U dev-user -d dev-db > backup.sql

# Import to Railway (get Railway DB URL from dashboard)
psql $RAILWAY_DATABASE_URL < backup.sql
```

### Monitoring
- **Logs**: Railway dashboard → Service → "View Logs"
- **Database**: Railway dashboard → Postgres → "View Database"
- **Health check**: Railway generates public URL - visit `/api/health`

### Costs (as of 2026)
- **Free tier**: $5/month in credits
- Typical usage for this app: ~$3-5/month (small backend + small DB)
- Scale up as needed (paid plans available)

---

## Alternative: Keep Existing Database

If you want Railway to connect to your **current PostgreSQL** (not create new one):

1. Skip step 2 (don't add Railway PostgreSQL)
2. In backend service, manually set environment variables:
   ```
   DB_TYPE=postgresql
   DB_HOST=your-current-host
   DB_PORT=5432
   DB_NAME=your-current-db
   DB_USER=your-current-user
   DB_PASSWORD=your-current-password
   ```
3. Ensure your database allows connections from Railway IPs
4. No need to run seed script (uses existing data)

---

## Troubleshooting

### Backend won't connect to database
- Check environment variables in Railway dashboard
- Verify Railway PostgreSQL service is running
- Check logs for connection errors

### Frontend can't reach backend
- Verify REACT_APP_API_URL is set correctly
- Check CORS settings in `backend/server.js`
- Ensure backend has a public domain (Railway auto-assigns)

### Seed script fails
- Verify database credentials
- Check if tables already exist (seed clears data - comment out TRUNCATE if needed)
- Run `railway logs` to see error details
