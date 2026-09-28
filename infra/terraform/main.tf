# Lab 08 step 3: this first version is INSECURE ON PURPOSE so that tfsec and
# checkov have real findings to report. The fixed version replaces the two
# aws_* resources below.

resource "aws_security_group" "app" {
  name        = "taskflow-app"
  description = "Security group for the taskflow-api host"

  ingress {
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "app" {
  ami                    = var.ami_id
  instance_type          = var.instance_type
  vpc_security_group_ids = [aws_security_group.app.id]

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
