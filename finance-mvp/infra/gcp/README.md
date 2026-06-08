# GCP infrastructure (Terraform)

Provisions the TerraVest VM on Google Cloud with **one command**: a Compute Engine
instance (Ubuntu 22.04), a **static public IP**, a **firewall** (22/80/443), the
**deploy SSH key**, and **Docker installed** automatically on first boot.

This replaces the manual "create instance" clicking and the `deploy/bootstrap-vm.sh`
step. After `terraform apply`, you still do the app deploy (repo + `.env.prod` + first
`deploy.sh`, then the one-click GitHub workflow) — those stay out of Terraform so secrets
never land in Terraform state.

## One-time prerequisites
```bash
brew install terraform google-cloud-sdk    # or your platform's installer
gcloud auth application-default login        # authenticates Terraform as you
gcloud config set project <YOUR_PROJECT_ID>
# Enable the Compute API once:
gcloud services enable compute.googleapis.com
```

## Provision
```bash
cd finance-mvp/infra/gcp
cp terraform.tfvars.example terraform.tfvars   # set project_id (+ any overrides)
terraform init
terraform apply        # review the plan, type yes
```
On success it prints `public_ip` and `ssh_command`. Give that IP to the deploy step
(DNS `api.terravest.app` → IP, and the GitHub `DEPLOY_HOST` secret).

## Multiple environments (later — you don't need this yet)
The resources are named `terravest-<environment>`, so use Terraform workspaces:
```bash
terraform workspace new qa
terraform apply -var environment=qa -var machine_type=e2-small
```
Each workspace keeps its own state and its own VM/IP/firewall. For now, just use the
default `prod`. Dev = your laptop (`deploy/start-local.sh`).

## Cost
- `e2-standard-2` ≈ $49/mo (covered by the $300 / 90-day free trial).
- A static IP attached to a running VM is free; an *unused* reserved IP bills a few $/mo,
  so `terraform destroy` when you tear an environment down.

## Tear down
```bash
terraform destroy      # removes the VM, IP, and firewall for this workspace
```
