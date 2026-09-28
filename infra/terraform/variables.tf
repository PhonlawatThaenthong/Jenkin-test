variable "aws_region" {
  description = "Region reported to LocalStack."
  type        = string
  default     = "us-east-1"
}

variable "localstack_endpoint" {
  description = "LocalStack edge endpoint, reachable from the Jenkins docker network."
  type        = string
  default     = "http://localstack:4566"
}

variable "ami_id" {
  description = "An AMI id that LocalStack knows (awslocal ec2 describe-images)."
  type        = string
  default     = "ami-03cf127a"
}

variable "instance_type" {
  description = "EC2 instance type for the taskflow-api host."
  type        = string
  default     = "t3.micro"
}

variable "docker_network" {
  description = "Docker network shared by Jenkins, LocalStack and the host container."
  type        = string
  default     = "iac-net"
}

variable "ssh_public_key_path" {
  description = "Public half of the key Ansible uses to log in to the host."
  type        = string
  default     = "../ansible/ansible_ed25519.pub"
}

variable "allowed_cidr" {
  description = "Only this internal range may reach port 8080."
  type        = string
  default     = "10.0.0.0/16"
}
