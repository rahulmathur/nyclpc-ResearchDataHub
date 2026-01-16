#!/bin/bash

###############################################################################
# AWS RDS Staging Database Creation Script
###############################################################################
# This script creates a staging PostgreSQL RDS instance in AWS
#
# Prerequisites:
# - AWS CLI installed and configured
# - Appropriate AWS permissions to create RDS instances
#
# Usage:
#   bash scripts/create-staging-rds.sh
###############################################################################

set -e

echo "🚀 AWS RDS Staging Database Creation Script"
echo "==========================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI not found. Please install it first:${NC}"
    echo "   https://aws.amazon.com/cli/"
    exit 1
fi

echo -e "${BLUE}📋 Gathering information...${NC}"
echo ""

# Get configuration from user
read -p "AWS Region (e.g., us-east-1): " AWS_REGION
read -p "RDS Instance Identifier (e.g., dev-nyclpc-researchdatahub-staging): " DB_INSTANCE_ID
read -p "Database Name (e.g., LPC-ResearchHub-Staging): " DB_NAME
read -p "Master Username (e.g., nyclpc): " DB_USER
read -sp "Master Password (min 8 characters): " DB_PASSWORD
echo ""
read -p "DB Instance Class (default: db.t3.micro): " DB_CLASS
DB_CLASS=${DB_CLASS:-db.t3.micro}

read -p "Storage size in GB (default: 20): " STORAGE_SIZE
STORAGE_SIZE=${STORAGE_SIZE:-20}

echo ""
echo -e "${BLUE}📊 Configuration Summary:${NC}"
echo "  Region: $AWS_REGION"
echo "  Instance ID: $DB_INSTANCE_ID"
echo "  Database: $DB_NAME"
echo "  Instance Class: $DB_CLASS"
echo "  Storage: $STORAGE_SIZE GB"
echo ""

read -p "Proceed with creation? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo -e "${BLUE}🔧 Creating RDS instance...${NC}"
echo "This may take 5-15 minutes..."
echo ""

# Create the RDS instance
aws rds create-db-instance \
    --db-instance-identifier "$DB_INSTANCE_ID" \
    --db-instance-class "$DB_CLASS" \
    --engine postgres \
    --engine-version "18.1" \
    --master-username "$DB_USER" \
    --master-user-password "$DB_PASSWORD" \
    --allocated-storage "$STORAGE_SIZE" \
    --storage-type gp3 \
    --db-name "$DB_NAME" \
    --port 5432 \
    --publicly-accessible \
    --enable-cloudwatch-logs-exports postgresql \
    --backup-retention-period 7 \
    --region "$AWS_REGION" \
    2>&1

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to create RDS instance${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ RDS instance creation initiated!${NC}"
echo ""
echo "Instance Details:"
echo "  ID: $DB_INSTANCE_ID"
echo "  Region: $AWS_REGION"
echo ""
echo "⏳ Waiting for instance to be available (this takes ~10 minutes)..."
echo ""

# Wait for instance to be available
aws rds wait db-instance-available \
    --db-instance-identifier "$DB_INSTANCE_ID" \
    --region "$AWS_REGION"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ RDS instance is now available!${NC}"
    echo ""
    
    # Get the endpoint
    ENDPOINT=$(aws rds describe-db-instances \
        --db-instance-identifier "$DB_INSTANCE_ID" \
        --region "$AWS_REGION" \
        --query 'DBInstances[0].Endpoint.Address' \
        --output text)
    
    echo -e "${BLUE}📍 Connection Details:${NC}"
    echo "  Host: $ENDPOINT"
    echo "  Port: 5432"
    echo "  Database: $DB_NAME"
    echo "  Username: $DB_USER"
    echo "  Password: (the one you entered)"
    echo ""
    echo -e "${YELLOW}⚠️  Update .env.staging with these values:${NC}"
    echo ""
    echo "DB_HOST=$ENDPOINT"
    echo "DB_PORT=5432"
    echo "DB_NAME=$DB_NAME"
    echo "DB_USER=$DB_USER"
    echo "DB_PASSWORD=<your-password>"
    echo ""
else
    echo -e "${RED}❌ Timeout waiting for instance to be available${NC}"
    echo "Check AWS Console for status"
    exit 1
fi

echo -e "${GREEN}✅ Done!${NC}"
echo ""
echo "Next steps:"
echo "1. Update .env.staging with the connection details above"
echo "2. Run: npm run migrate"
echo ""
