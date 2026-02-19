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
  
  # Set ACL to public-read for website hosting
  acl = "public-read"

  tags = {
    project     = "synflow"
    environment = var.environment
    managed_by  = "terraform"
  }
}

# Note: Additional configuration (CORS, website config, etc.) 
# needs to be done via AWS CLI after bucket creation
# See post-apply instructions in outputs
