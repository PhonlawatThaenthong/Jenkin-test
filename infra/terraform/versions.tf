terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }

  # Remote state in LocalStack S3. Credentials come from AWS_ACCESS_KEY_ID /
  # AWS_SECRET_ACCESS_KEY in the environment, never from this file.
  # terraform.tfstate is never written to the repo (see .gitignore).
  backend "s3" {
    bucket                      = "taskflow-tfstate"
    key                         = "lab08/terraform.tfstate"
    region                      = "us-east-1"
    endpoints                   = { s3 = "http://localstack:4566" }
    use_path_style              = true
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
  }
}
