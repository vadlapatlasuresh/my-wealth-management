# ============================================================
#  Cloud KMS root key for the secrets-service (envelope encryption).
#
#  The KEK lives here and never leaves KMS. The VM's service account (below) is
#  granted ONLY encrypt/decrypt on this one key, so it can wrap/unwrap the
#  secrets-service's data keys via the metadata-server identity — no key file or
#  env secret anywhere. See apps/secrets-service GcpKmsMasterKeyProvider and
#  docs/architecture/SECRET_MANAGEMENT_DESIGN.md.
#
#  After `terraform apply`, set on the VM's .env.prod:
#    SECRETS_PROVIDER=kms
#    SECRETS_KMS_KEY_NAME=<terraform output -raw secrets_kms_key_name>
#  and you can then drop SECRETS_MASTER_KEY entirely.
# ============================================================

resource "google_project_service" "kms" {
  service            = "cloudkms.googleapis.com"
  disable_on_destroy = false
}

# Key ring is regional and immutable (cannot be destroyed) — Terraform will keep it
# in state but it lingers in GCP; that's expected for KMS.
resource "google_kms_key_ring" "secrets" {
  name       = "${local.name}-secrets"
  location   = var.region
  depends_on = [google_project_service.kms]
}

# Symmetric encrypt/decrypt key, auto-rotated. Wrapping/unwrapping DEKs only.
resource "google_kms_crypto_key" "secrets_root" {
  name            = "secrets-root"
  key_ring        = google_kms_key_ring.secrets.id
  purpose         = "ENCRYPT_DECRYPT"
  rotation_period = "7776000s" # 90 days

  lifecycle {
    prevent_destroy = true
  }
}

# Dedicated service account for the VM (least privilege; replaces the default compute SA).
resource "google_service_account" "vm" {
  account_id   = "${local.name}-vm"
  display_name = "TerraVest ${var.environment} VM (secrets KMS access)"
  depends_on   = [time_sleep.wait_api]
}

# The ONLY KMS grant: encrypt/decrypt on the secrets-root key. Nothing else.
resource "google_kms_crypto_key_iam_member" "vm_encrypt_decrypt" {
  crypto_key_id = google_kms_crypto_key.secrets_root.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:${google_service_account.vm.email}"
}

output "secrets_kms_key_name" {
  value       = "projects/${var.project_id}/locations/${var.region}/keyRings/${google_kms_key_ring.secrets.name}/cryptoKeys/${google_kms_crypto_key.secrets_root.name}"
  description = "Set as SECRETS_KMS_KEY_NAME in .env.prod (with SECRETS_PROVIDER=kms)."
}

output "vm_service_account_email" {
  value       = google_service_account.vm.email
  description = "Service account attached to the VM; holds KMS encrypt/decrypt on the secrets key."
}
