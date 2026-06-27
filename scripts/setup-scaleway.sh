#!/bin/bash

# Terraform Setup Script for Scaleway
# Initializes and applies Terraform configuration

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🏗️  Scaleway Infrastructure Setup${NC}"
echo "===================================="
echo ""

# Check if terraform is installed
if ! command -v terraform &> /dev/null; then
    echo -e "${RED}❌ Error: Terraform is not installed${NC}"
    echo "Install it from: https://www.terraform.io/downloads"
    exit 1
fi

# Check if credentials are set
if [ -z "$SCW_ACCESS_KEY" ]; then
    echo -e "${YELLOW}⚠️  SCW_ACCESS_KEY not set${NC}"
    read -p "Enter your Scaleway Access Key: " SCW_ACCESS_KEY
    export SCW_ACCESS_KEY
fi

if [ -z "$SCW_SECRET_KEY" ]; then
    echo -e "${YELLOW}⚠️  SCW_SECRET_KEY not set${NC}"
    read -sp "Enter your Scaleway Secret Key: " SCW_SECRET_KEY
    echo ""
    export SCW_SECRET_KEY
fi

if [ -z "$SCW_DEFAULT_PROJECT_ID" ]; then
    echo -e "${YELLOW}⚠️  SCW_DEFAULT_PROJECT_ID not set${NC}"
    echo "You can find this in Scaleway Console → Project Settings"
    read -p "Enter your Scaleway Project ID: " SCW_DEFAULT_PROJECT_ID
    export SCW_DEFAULT_PROJECT_ID
fi

# Navigate to terraform directory
cd "$(dirname "$0")/../terraform"

# Check if tfvars exists
if [ ! -f "terraform.tfvars" ]; then
    echo -e "${YELLOW}📝 Creating terraform.tfvars...${NC}"
    cat > terraform.tfvars <<EOF
region      = "fr-par"
zone        = "fr-par-1"
bucket_name = "synflow-prod"
environment = "production"
EOF
    echo -e "${GREEN}✅ Created terraform.tfvars${NC}"
    echo "You can edit this file to customize your configuration"
    echo ""
fi

# Initialize Terraform
echo -e "${YELLOW}🔧 Initializing Terraform...${NC}"
terraform init

echo ""
echo -e "${YELLOW}📋 Planning infrastructure changes...${NC}"
terraform plan

echo ""
read -p "Do you want to apply these changes? (yes/no): " CONFIRM

if [ "$CONFIRM" = "yes" ]; then
    echo ""
    echo -e "${YELLOW}🚀 Applying Terraform configuration...${NC}"
    terraform apply -auto-approve
    
    echo ""
    echo -e "${GREEN}✅ Infrastructure created successfully!${NC}"
    echo ""
    echo -e "${BLUE}📊 Outputs:${NC}"
    terraform output
    
    echo ""
    echo -e "${GREEN}Next steps:${NC}"
    echo "1. Add GitHub secrets (see README.SCALEWAY.md)"
    echo "2. Test deployment with: ./scripts/deploy-scaleway.sh"
    echo "3. Commit with '/prod' to trigger GitHub Actions"
else
    echo -e "${YELLOW}⏸️  Setup cancelled${NC}"
    exit 0
fi
