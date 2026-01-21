# Manual Backend Deployment Guide

## Overview
This guide covers manual deployment to AWS Elastic Beanstalk via the AWS Console (no EB CLI required).

## Deployment Steps

### 1. Prepare the Deployment Package

Create a zip file of your backend code:

```bash
cd /Users/rahulmathur_1/Sites/nyclpc-ResearchDataHub

# Make sure you're on staging branch
git checkout staging

# Create deployment package (exclude node_modules, .env files, etc.)
cd backend
zip -r ../backend-deploy.zip . \
  -x "*.env*" \
  -x "node_modules/*" \
  -x "*.sql" \
  -x ".DS_Store" \
  -x ".git/*"
```

**Important files to include:**
- ✅ `server.js`
- ✅ `package.json`
- ✅ `package-lock.json`
- ✅ `controllers/` directory
- ✅ `db/` directory
- ✅ `.ebextensions/` directory (for environment variables)
- ✅ `ca_certificate_aws-rds.pem` (if using SSL)

**Exclude:**
- ❌ `node_modules/` (will be installed on EB)
- ❌ `.env*` files (use EB environment variables instead)
- ❌ `*.sql` backup files
- ❌ `.git/` directory

### 2. Deploy via AWS Console

1. **Log in to AWS Console**
   - Go to https://console.aws.amazon.com
   - Navigate to **Elastic Beanstalk** service

2. **Select Your Application**
   - Find and select: `nyclpc-research-hub-backend`
   - Select environment: `staging-backend` (or your environment name)

3. **Upload New Version**
   - Click **Upload and Deploy** button
   - Click **Choose File** and select your `backend-deploy.zip`
   - Enter a **Version label** (e.g., `v1.0.2-staging` or use timestamp)
   - Click **Deploy**

4. **Monitor Deployment**
   - Watch the deployment progress in the console
   - Check the logs if there are any errors
   - Wait for "Successfully deployed" status

### 3. Verify Deployment

After deployment completes:

1. **Check Health**
   ```bash
   curl https://NYCLPC-RDH-Staging-env-1.eba-2rxzfa4v.us-east-1.elasticbeanstalk.com/api/health
   ```

2. **Expected Response:**
   ```json
   {
     "status": "ok",
     "database": "connected",
     "dbType": "postgresql"
   }
   ```

3. **Test in Browser**
   - Visit: https://NYCLPC-RDH-Staging-env-1.eba-2rxzfa4v.us-east-1.elasticbeanstalk.com/api/health
   - Should see JSON response

### 4. Environment Variables

Environment variables are set in `backend/.ebextensions/env-vars.config`:
- These are automatically applied during deployment
- You can also verify/update them in AWS Console:
  - Go to your EB environment
  - Click **Configuration** → **Software** → **Edit**
  - Scroll to **Environment properties**
  - Verify all variables are set correctly

### Current Environment Variables (from .ebextensions/env-vars.config):
```
NODE_ENV=production
DB_TYPE=postgresql
DB_HOST=dev-nyclpc-researchdatahub.ccsgwako8hnn.us-east-1.rds.amazonaws.com
DB_PORT=5432
DB_NAME=LPC-ResearchHub-Staging
DB_USER=nyclpc
DB_PASSWORD=lpcResearchDataHub1!
PORT=5000
```

## Quick Deploy Script

You can create a simple script to automate zip creation:

```bash
#!/bin/bash
# save as deploy-backend.sh

cd /Users/rahulmathur_1/Sites/nyclpc-ResearchDataHub/backend

# Remove old zip
rm -f ../backend-deploy.zip

# Create new zip
zip -r ../backend-deploy.zip . \
  -x "*.env*" \
  -x "node_modules/*" \
  -x "*.sql" \
  -x ".DS_Store" \
  -x ".git/*"

echo "✅ Created backend-deploy.zip"
echo "📦 Upload this file via AWS Elastic Beanstalk Console"
```

## Troubleshooting

### Deployment Fails
- Check EB logs: Console → Logs → Request Logs
- Verify Node.js version matches (should be 20.x for staging)
- Ensure `package.json` has correct dependencies
- Check that `.ebextensions/` directory is included

### Database Connection Issues
- Verify RDS security group allows EB instance
- Check environment variables are set correctly
- Ensure `ca_certificate_aws-rds.pem` is included if using SSL

### Application Errors
- Check application logs in EB console
- Verify all required files are in the zip
- Ensure `node_modules` is NOT included (EB installs it)

## Notes

- **Node.js Version**: Staging uses Node.js 20.x (configured in EB platform)
- **Port**: Application runs on port 5000
- **SSL Certificate**: Place `ca_certificate_aws-rds.pem` in backend root if using SSL verification
- **Deployment Time**: Usually takes 2-5 minutes
- **Zero Downtime**: EB can do rolling deployments if configured
