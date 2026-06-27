terraform {
  required_version = ">= 1.0"
  
  required_providers {
    scaleway = {
      source  = "scaleway/scaleway"
      version = "~> 2.0"
    }
  }
}

provider "scaleway" {
  region  = var.region
  zone    = var.zone
}

# Create Object Storage bucket for static website hosting
resource "scaleway_object_bucket" "synflow" {
  name   = var.bucket_name
  region = var.region
  
  # Enable versioning (optional but recommended)
  versioning {
    enabled = true
  }

  tags = {
    project     = "synflow"
    environment = var.environment
    managed_by  = "terraform"
  }
}

# Configure bucket for website hosting
resource "scaleway_object_bucket_website_configuration" "synflow" {
  bucket = scaleway_object_bucket.synflow.name
  region = var.region

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"  # For SPA routing
  }
}

# Set bucket ACL to public-read for website hosting
resource "scaleway_object_bucket_acl" "synflow" {
  bucket = scaleway_object_bucket.synflow.name
  region = var.region
  acl    = "public-read"
}

# CORS configuration for the bucket
resource "scaleway_object_bucket_cors_configuration" "synflow" {
  bucket = scaleway_object_bucket.synflow.name
  region = var.region

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["*"]
    max_age_seconds = 3000
  }
}

# Bucket policy for public read access
resource "scaleway_object_bucket_policy" "synflow" {
  bucket = scaleway_object_bucket.synflow.name
  region = var.region
  
  policy = jsonencode({
    Version = "2012-10-17"
    Id      = "PublicReadPolicy"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "arn:aws:s3:::${var.bucket_name}/*"
      }
    ]
  })
}
