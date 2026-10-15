# Buckets e cofre. Os valores dos segredos NÃO passam pelo Terraform (não vão
# para o estado): o Terraform cria só o segredo vazio, e quem opera grava o
# conteúdo pela CLI (infra/producao/README.md).

resource "random_id" "sufixo" {
  byte_length = 4
}

locals {
  bucket_bruto  = "${local.nome}-bruto-${random_id.sufixo.hex}"
  bucket_backup = "${local.nome}-backup-${random_id.sufixo.hex}"
}

# Dados brutos de cada coleta (guardados por 2 anos ou mais, sem alteração).
resource "aws_s3_bucket" "bruto" {
  bucket = local.bucket_bruto
}

# Repositório do pgBackRest (backups e WAL, já cifrados pelo pgBackRest).
resource "aws_s3_bucket" "backup" {
  bucket = local.bucket_backup
}

resource "aws_s3_bucket_public_access_block" "todos" {
  for_each                = { bruto = aws_s3_bucket.bruto.id, backup = aws_s3_bucket.backup.id }
  bucket                  = each.value
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "todos" {
  for_each = { bruto = aws_s3_bucket.bruto.id, backup = aws_s3_bucket.backup.id }
  bucket   = each.value
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "todos" {
  for_each = { bruto = aws_s3_bucket.bruto.id, backup = aws_s3_bucket.backup.id }
  bucket   = each.value
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Versões: um arquivo apagado ou sobrescrito por engano (ou por invasão) ainda
# pode ser recuperado.
resource "aws_s3_bucket_versioning" "todos" {
  for_each = { bruto = aws_s3_bucket.bruto.id, backup = aws_s3_bucket.backup.id }
  bucket   = each.value
  versioning_configuration {
    status = "Enabled"
  }
}

# O pgBackRest apaga o que sai da retenção; a versão antiga some em 30 dias.
resource "aws_s3_bucket_lifecycle_configuration" "backup" {
  bucket = aws_s3_bucket.backup.id

  rule {
    id     = "versoes-antigas"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# Cofre: um segredo por máquina, cada um um JSON com as variáveis de ambiente.
resource "aws_secretsmanager_secret" "app" {
  name                    = "${local.nome}/app"
  description             = "Variáveis da máquina da aplicação (senhas do banco por usuário, JWT, 2FA do painel, FCM, Sentry, healthchecks.io)"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret" "banco" {
  name                    = "${local.nome}/banco"
  description             = "Variáveis da máquina do banco (senha do dono, senhas dos usuários, cifra do backup, healthchecks.io)"
  recovery_window_in_days = 7
}
