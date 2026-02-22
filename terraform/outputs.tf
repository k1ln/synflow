output "bucket_name" {
  description = "The name of the S3 bucket"
  value       = scaleway_object_bucket.synflow.name
}

output "bucket_endpoint" {
  description = "The endpoint URL of the bucket"
  value       = scaleway_object_bucket.synflow.endpoint
}

output "website_endpoint" {
  description = "The website endpoint URL (HTTP)"
  value       = "http://${scaleway_object_bucket.synflow.name}.s3-website.${var.region}.scw.cloud"
}

output "website_endpoint_https" {
  description = "The website endpoint URL (HTTPS)"
  value       = "https://${scaleway_object_bucket.synflow.name}.s3.${var.region}.scw.cloud"
}

output "bucket_region" {
  description = "The region of the bucket"
  value       = scaleway_object_bucket.synflow.region
}

output "post_apply_commands" {
  description = "Commands to run after terraform apply to configure website and CORS"
  value = <<-EOT
  
  Configure website hosting and CORS with these commands:
  
  # Set website configuration
  aws s3 website s3://${var.bucket_name}/ \
    --index-document index.html \
    --error-document index.html \
    --endpoint-url=https://s3.${var.region}.scw.cloud
  
  # Set CORS configuration
  cat > /tmp/cors.json << 'EOF'
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
  EOF
  
  aws s3api put-bucket-cors \
    --bucket ${var.bucket_name} \
    --cors-configuration file:///tmp/cors.json \
    --endpoint-url=https://s3.${var.region}.scw.cloud
  
  EOT
}
