output "ip_app" {
  description = "IP fixo da aplicação: crie os registros A da API e do painel apontando para ele."
  value       = aws_eip.app.public_ip
}

output "dns" {
  description = "Registros de DNS a criar (no provedor do domínio)."
  value = {
    (var.dominio_api)    = aws_eip.app.public_ip
    (var.dominio_painel) = aws_eip.app.public_ip
  }
}

output "maquinas" {
  description = "Ids das máquinas (acesso: aws ssm start-session --target <id>)."
  value = {
    app   = aws_instance.app.id
    banco = aws_instance.banco.id
  }
}

output "ip_privado_banco" {
  value = aws_instance.banco.private_ip
}

output "buckets" {
  value = {
    bruto  = aws_s3_bucket.bruto.bucket
    backup = aws_s3_bucket.backup.bucket
  }
}

output "segredos" {
  description = "Segredos a preencher pela CLI antes de ligar as máquinas (infra/producao/README.md)."
  value = {
    app   = aws_secretsmanager_secret.app.name
    banco = aws_secretsmanager_secret.banco.name
  }
}
