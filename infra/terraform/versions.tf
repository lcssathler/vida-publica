terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Estado local por padrão (fora do git: o .gitignore bloqueia *.tfstate). Para
  # mais de uma pessoa, troque por um backend S3 com trava, num bucket criado à
  # mão antes do primeiro apply (veja infra/producao/README.md).
}

provider "aws" {
  region = var.regiao

  # Só para validar e planejar sem conta (credenciais fictícias): nenhuma
  # chamada à AWS. Nunca ligado num apply de verdade.
  skip_credentials_validation = var.planejar_sem_conta
  skip_requesting_account_id  = var.planejar_sem_conta
  skip_metadata_api_check     = var.planejar_sem_conta

  default_tags {
    tags = {
      Projeto  = "vida-publica"
      Ambiente = var.ambiente
      Gerencia = "terraform"
    }
  }
}
