# Lab 08 step 3: fixed after triaging tfsec and checkov (replaces the insecure first version).

resource "aws_security_group" "app" {
  name        = "taskflow-app"
  description = "Security group for the taskflow-api host"

  # FIX tfsec aws-ec2-no-public-ingress-sgr: only the internal network reaches 8080.
  # FIX tfsec aws-ec2-add-description-to-security-group-rule / checkov CKV_AWS_23.
  ingress {
    description = "taskflow-api HTTP from the internal network only"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = [var.allowed_cidr]
  }

  # FIX checkov CKV_AWS_382: no more "all protocols, all ports" egress; HTTPS only.
  # tfsec:ignore:aws-ec2-no-public-egress-sgr Accepted risk: the host must reach public package mirrors and registries over HTTPS.
  egress {
    description = "HTTPS out for OS packages and container images"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# FIX checkov CKV2_AWS_41: the instance gets its own least-privilege role.
resource "aws_iam_role" "app" {
  name = "taskflow-app"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_instance_profile" "app" {
  name = "taskflow-app"
  role = aws_iam_role.app.name
}

resource "aws_instance" "app" {
  # checkov:skip=CKV_AWS_126:LocalStack does not implement MonitorInstances; enable detailed monitoring on real AWS
  ami                    = var.ami_id
  instance_type          = var.instance_type
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.app.name
  ebs_optimized          = true # FIX checkov CKV_AWS_135

  # FIX tfsec aws-ec2-enforce-http-token-imds / checkov CKV_AWS_79: IMDSv2 only.
  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  # FIX tfsec aws-ec2-enable-at-rest-encryption / checkov CKV_AWS_8.
  # LocalStack's RunInstances needs an explicit size once a block device is described.
  root_block_device {
    encrypted   = true
    volume_size = 8
    volume_type = "gp3"
  }

  tags = {
    Name = "taskflow-app"
  }
}

# ---- the host Ansible actually configures (see providers.tf) ----

resource "docker_image" "host" {
  name         = "taskflow-host:lab08"
  keep_locally = false

  build {
    context = "${path.module}/../host"
  }
}

resource "docker_container" "host" {
  name     = "taskflow-host"
  image    = docker_image.host.image_id
  hostname = "taskflow-host"

  networks_advanced {
    name = var.docker_network
  }

  # Lets `docker pull` on the host use the Docker daemon that runs the lab
  # registry (localhost:5001). Acceptable in a lab only: this socket is root.
  volumes {
    host_path      = "/var/run/docker.sock"
    container_path = "/var/run/docker.sock"
  }

  upload {
    content = file("${path.module}/${var.ssh_public_key_path}")
    file    = "/home/ansible/.ssh/authorized_keys"
  }

  labels {
    label = "managed-by"
    value = "terraform"
  }
}
