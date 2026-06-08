variable "project_id" {
  type        = string
  description = "Your GCP project ID (Console → project selector → ID, not the display name)."
}

variable "region" {
  type        = string
  default     = "us-east1" # match your Neon DB region for low latency
  description = "GCP region."
}

variable "zone" {
  type        = string
  default     = "us-east1-b"
  description = "GCP zone within the region."
}

variable "environment" {
  type        = string
  default     = "prod"
  description = "Environment name (prod | qa | dev). Used to name resources so multiple can coexist."
}

variable "machine_type" {
  type        = string
  default     = "e2-standard-2" # 2 vCPU / 8 GB — comfortable for the 11-service stack
  description = "Compute Engine machine type."
}

variable "boot_disk_gb" {
  type        = number
  default     = 30
  description = "Boot disk size in GB."
}

variable "ssh_user" {
  type        = string
  default     = "deploy"
  description = "Linux user created for SSH/deploy (matches DEPLOY_USER in the GitHub deploy workflow)."
}

variable "ssh_pubkey_path" {
  type        = string
  default     = "~/.ssh/terravest_deploy.pub"
  description = "Path to the deploy SSH public key (its private half is the GitHub DEPLOY_SSH_KEY secret)."
}
