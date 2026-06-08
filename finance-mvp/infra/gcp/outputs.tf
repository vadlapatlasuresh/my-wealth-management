output "public_ip" {
  value       = google_compute_address.ip.address
  description = "The VM's static public IP. Point api.terravest.app at this; use it for the GitHub DEPLOY_HOST secret."
}

output "ssh_command" {
  value       = "ssh -i ~/.ssh/terravest_deploy ${var.ssh_user}@${google_compute_address.ip.address}"
  description = "Copy-paste to SSH into the VM."
}

output "environment" {
  value = var.environment
}
