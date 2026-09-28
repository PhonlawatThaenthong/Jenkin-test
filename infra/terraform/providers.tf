# AWS API calls go to LocalStack, not to a real account.
provider "aws" {
  region                      = var.aws_region
  s3_use_path_style           = true
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  endpoints {
    ec2 = var.localstack_endpoint
    iam = var.localstack_endpoint
    s3  = var.localstack_endpoint
    sts = var.localstack_endpoint
  }
}

# LocalStack's free tier only mocks EC2 (no real VM boots), so the host that
# Ansible configures is a container created through the local Docker daemon.
provider "docker" {
  host = "unix:///var/run/docker.sock"
}
