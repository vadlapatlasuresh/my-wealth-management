terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

locals {
  name = "terravest-${var.environment}"
}

# Reserved static external IP so the public IP never changes (survives stop/start).
resource "google_compute_address" "ip" {
  name   = "${local.name}-ip"
  region = var.region
}

# Firewall: allow SSH (22) + HTTP (80) + HTTPS (443) to instances tagged with our name.
resource "google_compute_firewall" "allow_web_ssh" {
  name    = "${local.name}-allow-web-ssh"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["22", "80", "443"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = [local.name]
}

# The VM. A startup script installs Docker + compose and adds the deploy user to the
# docker group (the same hardening bootstrap-vm.sh does, run automatically on first boot).
resource "google_compute_instance" "vm" {
  name         = local.name
  machine_type = var.machine_type
  zone         = var.zone
  tags         = [local.name, "http-server", "https-server"]

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = var.boot_disk_gb
    }
  }

  network_interface {
    network = "default"
    access_config {
      nat_ip = google_compute_address.ip.address
    }
  }

  # GCP creates the Linux user from the "<user>:<key>" metadata format.
  metadata = {
    ssh-keys = "${var.ssh_user}:${trimspace(file(pathexpand(var.ssh_pubkey_path)))}"
  }

  metadata_startup_script = <<-EOT
    #!/usr/bin/env bash
    set -euxo pipefail
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg git
    install -m 0755 -d /etc/apt/keyrings
    if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
      curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      chmod a+r /etc/apt/keyrings/docker.gpg
    fi
    . /etc/os-release
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    usermod -aG docker ${var.ssh_user} || true
    systemctl enable --now docker
  EOT

  # Don't let Terraform churn the box if Google rotates the image pointer.
  lifecycle {
    ignore_changes = [boot_disk[0].initialize_params[0].image]
  }
}
