output "instance_id" {
  description = "EC2 instance id recorded by LocalStack."
  value       = aws_instance.app.id
}

output "security_group_id" {
  description = "Security group that opens port 8080."
  value       = aws_security_group.app.id
}

output "instance_address" {
  description = "Address Ansible connects to (the host container on the Docker network)."
  value       = docker_container.host.network_data[0].ip_address
}
