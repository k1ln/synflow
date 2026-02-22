#!/bin/bash

# Scaleway Deployment Script
# Deploys Synflow to Scaleway Object Storage

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BUCKET_NAME="${SCW_BUCKET_NAME:-synflow-prod}"
REGION="${SCW_REGION:-fr-par}"
ENDPOINT="https://s3.${REGION}.scw.cloud"

echo -e "${GREEN}🚀 Synflow Scaleway Deployment${NC}"
echo "=================================="
echo "Bucket: $BUCKET_NAME"
echo "Region: $REGION"
echo "Endpoint: $ENDPOINT"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ Error: AWS CLI is not installed${NC}"
    echo "Install it with: brew install awscli (macOS) or see https://aws.amazon.com/cli/"
    exit 1
fi

# Check if credentials are set
if [ -z "$SCW_ACCESS_KEY" ] || [ -z "$SCW_SECRET_KEY" ]; then
    echo -e "${RED}❌ Error: Scaleway credentials not set${NC}"
    echo "Set the following environment variables:"
    echo "  export SCW_ACCESS_KEY='your-access-key'"
    echo "  export SCW_SECRET_KEY='your-secret-key'"
    exit 1
fi

# Configure AWS CLI for Scaleway
export AWS_ACCESS_KEY_ID="$SCW_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$SCW_SECRET_KEY"
export AWS_REGION="$REGION"

# Build the application
echo -e "${YELLOW}📦 Building application...${NC}"
npm run build

if [ ! -d "dist" ]; then
    echo -e "${RED}❌ Error: Build directory 'dist' not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build complete${NC}"
echo ""

# Test connection to bucket
echo -e "${YELLOW}🔗 Testing connection to bucket...${NC}"
if aws s3 ls "s3://${BUCKET_NAME}/" --endpoint-url="$ENDPOINT" &> /dev/null; then
    echo -e "${GREEN}✅ Connection successful${NC}"
else
    echo -e "${RED}❌ Error: Cannot connect to bucket${NC}"
    echo "Make sure the bucket exists and credentials are correct"
    exit 1
fi

echo ""

# Sync files to bucket
echo -e "${YELLOW}📤 Uploading files to Scaleway...${NC}"

# Upload all files except HTML with long cache
echo "Uploading assets with cache..."
aws s3 sync dist/ "s3://${BUCKET_NAME}/" \
  --endpoint-url="$ENDPOINT" \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html" \
  --exclude "*.html" \
  --exclude "*.map"

# Upload HTML files with no-cache for SPA routing
echo "Uploading HTML files..."
aws s3 sync dist/ "s3://${BUCKET_NAME}/" \
  --endpoint-url="$ENDPOINT" \
  --exclude "*" \
  --include "*.html" \
  --cache-control "public, max-age=0, must-revalidate"

# Upload source maps separately (optional)
if ls dist/*.map 1> /dev/null 2>&1; then
    echo "Uploading source maps..."
    aws s3 sync dist/ "s3://${BUCKET_NAME}/" \
      --endpoint-url="$ENDPOINT" \
      --exclude "*" \
      --include "*.map" \
      --cache-control "public, max-age=31536000"
fi

echo ""
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo ""
echo "🌐 Your site is available at:"
echo "   HTTP:  http://${BUCKET_NAME}.s3-website.${REGION}.scw.cloud"
echo "   HTTPS: https://${BUCKET_NAME}.s3.${REGION}.scw.cloud"
echo ""
echo "📊 To view bucket contents:"
echo "   aws s3 ls s3://${BUCKET_NAME}/ --endpoint-url=$ENDPOINT"
echo ""
