# Um papel por máquina, com o mínimo: Session Manager (operação sem SSH), o
# próprio segredo e o próprio bucket. As credenciais vêm do serviço de
# metadados (IMDSv2), renovadas pela AWS: nenhuma chave em arquivo.

data "aws_iam_policy_document" "assumir_ec2" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app" {
  name               = "${local.nome}-app"
  assume_role_policy = data.aws_iam_policy_document.assumir_ec2.json
}

resource "aws_iam_role" "banco" {
  name               = "${local.nome}-banco"
  assume_role_policy = data.aws_iam_policy_document.assumir_ec2.json
}

resource "aws_iam_role_policy_attachment" "ssm" {
  for_each   = { app = aws_iam_role.app.name, banco = aws_iam_role.banco.name }
  role       = each.value
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "app" {
  statement {
    sid       = "Segredo"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.app.arn]
  }
  statement {
    sid       = "BucketBruto"
    actions   = ["s3:ListBucket", "s3:GetBucketLocation"]
    resources = [aws_s3_bucket.bruto.arn]
  }
  statement {
    sid       = "ObjetosBrutos"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${aws_s3_bucket.bruto.arn}/*"]
  }
}

data "aws_iam_policy_document" "banco" {
  statement {
    sid       = "Segredo"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.banco.arn]
  }
  statement {
    sid       = "BucketBackup"
    actions   = ["s3:ListBucket", "s3:GetBucketLocation"]
    resources = [aws_s3_bucket.backup.arn]
  }
  statement {
    sid       = "ObjetosBackup"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.backup.arn}/*"]
  }
}

resource "aws_iam_role_policy" "app" {
  name   = "${local.nome}-app"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.app.json
}

resource "aws_iam_role_policy" "banco" {
  name   = "${local.nome}-banco"
  role   = aws_iam_role.banco.id
  policy = data.aws_iam_policy_document.banco.json
}

resource "aws_iam_instance_profile" "app" {
  name = "${local.nome}-app"
  role = aws_iam_role.app.name
}

resource "aws_iam_instance_profile" "banco" {
  name = "${local.nome}-banco"
  role = aws_iam_role.banco.name
}
