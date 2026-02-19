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
