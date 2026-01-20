#!/bin/bash
# Script to create backend deployment zip for AWS Elastic Beanstalk

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}📦 Creating backend deployment package...${NC}"

# Navigate to repo root
cd "$(dirname "$0")"

# Check if on staging branch
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
if [ "$CURRENT_BRANCH" != "staging" ]; then
    echo -e "${YELLOW}⚠️  Warning: Not on staging branch (current: $CURRENT_BRANCH)${NC}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Remove old zip if exists
if [ -f "backend-deploy.zip" ]; then
    echo -e "${YELLOW}🗑️  Removing old backend-deploy.zip...${NC}"
    rm -f backend-deploy.zip
fi

# Create zip from backend directory
cd backend

echo -e "${BLUE}📂 Zipping backend files...${NC}"
zip -r ../backend-deploy.zip . \
  -x "*.env*" \
  -x "node_modules/*" \
  -x "*.sql" \
  -x ".DS_Store" \
  -x ".git/*" \
  -x ".gitignore" \
  -x "__MACOSX/*" \
  > /dev/null

cd ..

if [ -f "backend-deploy.zip" ]; then
    SIZE=$(du -h backend-deploy.zip | cut -f1)
    echo -e "${GREEN}✅ Created backend-deploy.zip (${SIZE})${NC}"
    echo ""
    echo -e "${BLUE}📋 Next steps:${NC}"
    echo "1. Go to AWS Elastic Beanstalk Console"
    echo "2. Select your environment: staging-backend"
    echo "3. Click 'Upload and Deploy'"
    echo "4. Choose file: backend-deploy.zip"
    echo "5. Enter version label (e.g., v$(date +%Y%m%d-%H%M%S))"
    echo "6. Click 'Deploy'"
    echo ""
    echo -e "${YELLOW}💡 Tip: The zip file includes:${NC}"
    echo "   ✅ server.js, package.json, controllers/, db/"
    echo "   ✅ .ebextensions/env-vars.config"
    echo "   ✅ ca_certificate_aws-rds.pem"
    echo "   ❌ node_modules (will be installed on EB)"
    echo "   ❌ .env files (using EB environment variables)"
else
    echo -e "❌ Failed to create zip file"
    exit 1
fi
