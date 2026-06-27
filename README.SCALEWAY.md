# Scaleway Deployment Guide

This guide covers deploying Synflow to Scaleway Object Storage with HTTPS support and custom domain configuration.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Infrastructure Setup with Terraform](#infrastructure-setup-with-terraform)
3. [GitHub Actions Configuration](#github-actions-configuration)
4. [Custom Domain Setup](#custom-domain-setup)
5. [Deployment](#deployment)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Accounts & Tools

- **Scaleway Account**: Sign up at [scaleway.com](https://www.scaleway.com)
- **GitHub Account**: For repository and Actions
- **Terraform**: Install from [terraform.io](https://www.terraform.io/downloads)
- **AWS CLI**: Required for S3 sync (Scaleway is S3-compatible)

### Install AWS CLI

```bash
# macOS
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Verify installation
aws --version
```

---

## Infrastructure Setup with Terraform

### Step 1: Get Scaleway API Credentials

1. Log in to [Scaleway Console](https://console.scaleway.com)
2. Go to **Identity and Access Management (IAM)** → **API Keys**
3. Click **Generate API Key**
4. Save the **Access Key** and **Secret Key** (you won't see the secret again!)

### Step 2: Configure Terraform Variables

Create a `terraform.tfvars` file (not committed to git):

```bash
cd terraform
```

Create `terraform.tfvars`:

```hcl
region      = "fr-par"           # Options: fr-par (Paris), nl-ams (Amsterdam), pl-waw (Warsaw)
zone        = "fr-par-1"
bucket_name = "synflow-prod"     # Must be globally unique
environment = "production"
```

### Step 3: Set Scaleway Credentials

```bash
export SCW_ACCESS_KEY="your-access-key"
export SCW_SECRET_KEY="your-secret-key"
export SCW_DEFAULT_ORGANIZATION_ID="your-org-id"  # Found in Scaleway console
export SCW_DEFAULT_PROJECT_ID="your-project-id"   # Found in Scaleway console
```

Or create `~/.scwrc`:

```ini
[default]
access_key = your-access-key
secret_key = your-secret-key
default_organization_id = your-org-id
default_project_id = your-project-id
default_region = fr-par
default_zone = fr-par-1
```

### Step 4: Initialize and Apply Terraform

```bash
cd terraform

# Initialize Terraform
terraform init

# Preview changes
terraform plan

# Create infrastructure
terraform apply

# Save outputs
terraform output
```

**Important Outputs:**
- `bucket_name`: Your bucket name
- `website_endpoint`: HTTP endpoint
- `website_endpoint_https`: HTTPS endpoint
- `bucket_region`: Region code

---

## GitHub Actions Configuration

### Step 1: Add GitHub Secrets

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add the following secrets:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `SCW_ACCESS_KEY` | Your Scaleway Access Key | From IAM API Keys |
| `SCW_SECRET_KEY` | Your Scaleway Secret Key | From IAM API Keys |
| `SCW_BUCKET_NAME` | `synflow-prod` | Your bucket name |
| `SCW_REGION` | `fr-par` | Your Scaleway region |

### Step 2: Test the Workflow

The GitHub Actions workflow is configured in `.github/workflows/deploy-scaleway.yml`.

**Deployment triggers when:**
- You push to `main` or `master` branch
- AND the commit message contains `/prod`

Example:
```bash
git add .
git commit -m "Update UI /prod"
git push origin main
```

**Manual trigger:**
- Go to **Actions** tab in GitHub
- Select **Deploy to Scaleway**
- Click **Run workflow**

---

## Custom Domain Setup

### Step 1: DNS Configuration

You'll use **CNAME records** to point your domain to the Scaleway bucket.

1. **Get your bucket website endpoint** (from Terraform output):
   ```
   synflow-prod.s3-website.fr-par.scw.cloud
   ```

2. **Add DNS records** in your domain registrar:

   For apex domain (example.com):
   ```
   Type: ALIAS or ANAME (if supported)
   Name: @
   Value: synflow-prod.s3-website.fr-par.scw.cloud
   ```

   For subdomain (www.example.com):
   ```
   Type: CNAME
   Name: www
   Value: synflow-prod.s3-website.fr-par.scw.cloud
   TTL: 300
   ```

   **Note**: Not all DNS providers support ALIAS for apex domains. If yours doesn't:
   - Use a subdomain (www.example.com)
   - Or use Cloudflare DNS (supports CNAME flattening)

### Step 2: HTTPS Configuration

Scaleway Object Storage provides HTTPS at:
```
https://synflow-prod.s3.fr-par.scw.cloud
```

However, for custom domains with HTTPS, you need a CDN/proxy:

#### Option A: Cloudflare (Recommended - Free)

1. **Add your domain to Cloudflare** (free plan works)
2. **Update nameservers** at your registrar
3. **DNS settings in Cloudflare:**
   ```
   Type: CNAME
   Name: @ (or www)
   Target: synflow-prod.s3-website.fr-par.scw.cloud
   Proxy status: Proxied (orange cloud)
   ```

4. **SSL/TLS settings:**
   - Go to **SSL/TLS** → **Overview**
   - Set to **Full** (not Full Strict)

5. **Page Rules** (optional but recommended for SPA):
   - URL: `*yourdomain.com/*`
   - Setting: **Cache Level** → Cache Everything
   - Setting: **Edge Cache TTL** → 2 hours

**Benefits:**
- ✅ Free HTTPS certificate
- ✅ Global CDN
- ✅ DDoS protection
- ✅ Works with apex domains

#### Option B: Scaleway Load Balancer (Paid)

1. Create a Load Balancer in Scaleway Console
2. Configure SSL certificate (Let's Encrypt or custom)
3. Point to Object Storage bucket
4. Update DNS to point to Load Balancer IP

---

## Deployment

### Initial Deployment

1. **Deploy infrastructure:**
   ```bash
   cd terraform
   terraform apply
   ```

2. **Commit and push with `/prod`:**
   ```bash
   git add .
   git commit -m "Initial Scaleway setup /prod"
   git push origin main
   ```

3. **Monitor deployment:**
   - Go to GitHub **Actions** tab
   - Watch the workflow progress

4. **Verify deployment:**
   ```bash
   curl https://synflow-prod.s3-website.fr-par.scw.cloud
   ```

### Subsequent Deployments

Simply commit with `/prod` in the message:

```bash
git add .
git commit -m "Update feature X /prod"
git push origin main
```

### Manual Deployment (without GitHub Actions)

If you need to deploy manually:

```bash
# Build the app
npm run build

# Deploy to Scaleway
aws s3 sync dist/ s3://synflow-prod/ \
  --endpoint-url=https://s3.fr-par.scw.cloud \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html"

# Upload HTML with no-cache
aws s3 sync dist/ s3://synflow-prod/ \
  --endpoint-url=https://s3.fr-par.scw.cloud \
  --exclude "*" \
  --include "*.html" \
  --cache-control "public, max-age=0, must-revalidate"
```

---

## Troubleshooting

### Common Issues

#### 1. **403 Forbidden when accessing bucket**

**Solution**: Check bucket policy and ACL
```bash
cd terraform
terraform apply  # Reapply to ensure policies are set
```

#### 2. **CORS errors in browser**

**Solution**: Verify CORS configuration in Terraform or add manually:
```bash
aws s3api put-bucket-cors \
  --bucket synflow-prod \
  --endpoint-url=https://s3.fr-par.scw.cloud \
  --cors-configuration file://cors.json
```

`cors.json`:
```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

#### 3. **GitHub Actions failing**

**Check:**
- All secrets are set correctly in GitHub
- AWS CLI is using correct endpoint
- Bucket name matches in all configurations

**Debug:**
```bash
# Test AWS CLI access locally
aws s3 ls s3://synflow-prod/ \
  --endpoint-url=https://s3.fr-par.scw.cloud
```

#### 4. **SPA routing not working (404 on refresh)**

**Solution**: Ensure error document is set to `index.html` in Terraform:
```hcl
error_document {
  key = "index.html"
}
```

#### 5. **Custom domain not resolving**

**Check:**
- DNS propagation (can take up to 48 hours)
- Use `dig yourdomain.com` to verify DNS records
- Ensure CNAME points to correct bucket endpoint

```bash
dig www.yourdomain.com
# Should show CNAME to synflow-prod.s3-website.fr-par.scw.cloud
```

---

## Cost Estimation

Scaleway Object Storage pricing (as of 2024):

- **Storage**: €0.01/GB/month
- **Outbound traffic**: First 75GB free, then €0.01/GB
- **Requests**: GET requests are free

**Example for Synflow (estimated ~50MB build):**
- Storage: ~€0.01/month
- Traffic (10K visits/month, ~500MB): Free (under 75GB)

**Total: < €1/month** (essentially free for small-medium traffic)

---

## Additional Resources

- [Scaleway Object Storage Docs](https://www.scaleway.com/en/docs/storage/object/)
- [Terraform Scaleway Provider](https://registry.terraform.io/providers/scaleway/scaleway/latest/docs)
- [AWS CLI S3 Commands](https://docs.aws.amazon.com/cli/latest/reference/s3/)

---

## Next Steps

1. ✅ Set up monitoring (Scaleway Cockpit)
2. ✅ Configure custom domain with HTTPS
3. ✅ Set up staging environment (create separate bucket)
4. ✅ Add deployment notifications (Slack/Discord webhook)
5. ✅ Implement cache invalidation strategy

---

**Need help?** Open an issue or check Scaleway documentation.
