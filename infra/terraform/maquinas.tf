locals {
  comum = {
    repositorio = var.repositorio
    versao      = var.versao
    imagens     = var.imagens
    regiao      = var.regiao
  }
}

# Disco de dados do banco: separado da máquina, cifrado, sobrevive a uma troca
# de máquina (e a um terraform apply que recria a instância).
resource "aws_ebs_volume" "dados_banco" {
  availability_zone = var.zona
  size              = var.disco_banco_gb
  type              = "gp3"
  encrypted         = true
  tags              = { Name = "${local.nome}-dados-banco" }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_instance" "banco" {
  ami                    = var.ami_ubuntu
  instance_type          = var.tipo_banco
  subnet_id              = aws_subnet.publica.id
  vpc_security_group_ids = [aws_security_group.banco.id]
  iam_instance_profile   = aws_iam_instance_profile.banco.name

  # IMDSv2 obrigatório; 2 saltos para os contêineres (pgBackRest e a CLI da
  # AWS) pegarem as credenciais do papel.
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 20
    encrypted   = true
  }

  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", merge(local.comum, {
    papel   = "banco"
    segredo = aws_secretsmanager_secret.banco.name
    volume  = replace(aws_ebs_volume.dados_banco.id, "-", "")
    extras  = { VP_BACKUP_S3_BUCKET = aws_s3_bucket.backup.bucket }
  }))
  user_data_replace_on_change = false

  tags = { Name = "${local.nome}-banco" }
}

resource "aws_volume_attachment" "dados_banco" {
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.dados_banco.id
  instance_id = aws_instance.banco.id
}

resource "aws_instance" "app" {
  ami                    = var.ami_ubuntu
  instance_type          = var.tipo_app
  subnet_id              = aws_subnet.publica.id
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.app.name

  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 30
    encrypted   = true
  }

  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", merge(local.comum, {
    papel   = "app"
    segredo = aws_secretsmanager_secret.app.name
    volume  = ""
    extras = {
      VP_DB_HOST       = aws_instance.banco.private_ip
      VP_S3_BUCKET_RAW = aws_s3_bucket.bruto.bucket
      API_DOMINIO      = var.dominio_api
      PAINEL_DOMINIO   = var.dominio_painel
      ADMIN_IPS_CADDY  = join(" ", var.admin_ips)
      VP_ADMIN_IPS     = join(",", var.admin_ips)
    }
  }))
  user_data_replace_on_change = false

  tags = { Name = "${local.nome}-app" }
}

# IP fixo da aplicação: é para ele que o DNS da API e do painel aponta.
resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"
  tags     = { Name = "${local.nome}-app" }
}
