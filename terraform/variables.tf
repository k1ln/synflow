variable "region" {
  description = "Scaleway region"
  type        = string
  default     = "fr-par"  # Paris region, change to nl-ams for Amsterdam or pl-waw for Warsaw
}

variable "zone" {
  description = "Scaleway availability zone"
  type        = string
  default     = "fr-par-1"
}

variable "bucket_name" {
  description = "Name of the S3 bucket for static website hosting"
  type        = string
  default     = "synflow-prod"  # Must be globally unique
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}
