terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.12"
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

# Enable the Compute Engine API via Terraform (uses ADC), so no separate
# `gcloud services enable` / gcloud CLI login is needed. Everything below waits on it.
resource "google_project_service" "compute" {
  service            = "compute.googleapis.com"
  disable_on_destroy = false
}

# Give the freshly-enabled API time to propagate before creating resources.
resource "time_sleep" "wait_api" {
  depends_on      = [google_project_service.compute]
  create_duration = "60s"
}

# Reserved static external IP so the public IP never changes (survives stop/start).
resource "google_compute_address" "ip" {
  name       = "${local.name}-ip"
  region     = var.region
  depends_on = [time_sleep.wait_api]
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
  depends_on    = [time_sleep.wait_api]
}

# The VM. A startup script installs Docker + compose and adds the deploy user to the
# docker group (the same hardening bootstrap-vm.sh does, run automatically on first boot).
resource "google_compute_instance" "vm" {
  name         = local.name
  machine_type = var.machine_type
  zone         = var.zone
  tags         = [local.name, "http-server", "https-server"]
  depends_on   = [time_sleep.wait_api]

  # Allow Terraform to stop the VM to apply changes that require it (e.g. resizing
  # machine_type). The static IP and boot disk persist across the stop/start.
  allow_stopping_for_update = true

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

  # Dedicated service account so the VM can call Cloud KMS (wrap/unwrap the
  # secrets-service DEKs) via its metadata-server identity — no key file needed.
  # cloud-platform scope + the single KMS IAM grant in kms.tf gate what it can do.
  service_account {
    email  = google_service_account.vm.email
    scopes = ["cloud-platform"]
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
