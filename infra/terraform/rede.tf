locals {
  nome = "vida-publica-${var.ambiente}"
}

resource "aws_vpc" "principal" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = local.nome }
}

resource "aws_internet_gateway" "principal" {
  vpc_id = aws_vpc.principal.id
  tags   = { Name = local.nome }
}

# Uma sub-rede pública: as duas máquinas saem para a internet direto (coletas,
# FCM, S3, Sentry) sem NAT pago. O banco não aceita nada de fora: o grupo de
# segurança só abre o 5432 para a máquina da aplicação.
resource "aws_subnet" "publica" {
  vpc_id                  = aws_vpc.principal.id
  cidr_block              = "10.20.1.0/24"
  availability_zone       = var.zona
  map_public_ip_on_launch = true
  tags                    = { Name = "${local.nome}-publica" }
}

resource "aws_route_table" "publica" {
  vpc_id = aws_vpc.principal.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.principal.id
  }

  tags = { Name = "${local.nome}-publica" }
}

resource "aws_route_table_association" "publica" {
  subnet_id      = aws_subnet.publica.id
  route_table_id = aws_route_table.publica.id
}

# Grupo de segurança padrão da VPC sem regra nenhuma (nada entra por engano).
resource "aws_default_security_group" "padrao" {
  vpc_id = aws_vpc.principal.id
}

# Aplicação: só HTTP (redireciona) e HTTPS de fora. Sem SSH: o acesso de
# operação é pelo AWS Systems Manager (Session Manager), com IAM e registro.
resource "aws_security_group" "app" {
  name        = "${local.nome}-app"
  description = "API e painel (HTTPS); sem SSH"
  vpc_id      = aws_vpc.principal.id
}

resource "aws_vpc_security_group_ingress_rule" "app_http" {
  security_group_id = aws_security_group.app.id
  description       = "HTTP (desafio do Let's Encrypt e redirecionamento)"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_ingress_rule" "app_https" {
  security_group_id = aws_security_group.app.id
  description       = "HTTPS (API do app; o painel confere o IP no proxy e na aplicação)"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "app_saida" {
  security_group_id = aws_security_group.app.id
  description       = "Saída para fontes oficiais, FCM, S3, Sentry e o banco"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_security_group" "banco" {
  name        = "${local.nome}-banco"
  description = "PostgreSQL só para a aplicação; sem SSH"
  vpc_id      = aws_vpc.principal.id
}

resource "aws_vpc_security_group_ingress_rule" "banco_postgres" {
  security_group_id            = aws_security_group.banco.id
  description                  = "PostgreSQL vindo só da máquina da aplicação"
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_vpc_security_group_egress_rule" "banco_saida" {
  security_group_id = aws_security_group.banco.id
  description       = "Saída para o S3 (backup), atualizações e o healthchecks.io"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}
