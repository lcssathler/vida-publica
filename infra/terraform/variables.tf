variable "regiao" {
  description = "Região da AWS. São Paulo: os dados ficam no Brasil e a latência para quem usa o app é a menor."
  type        = string
  default     = "sa-east-1"
}

variable "zona" {
  description = "Zona de disponibilidade das máquinas e do disco do banco (a mesma para os dois)."
  type        = string
  default     = "sa-east-1a"
}

variable "ambiente" {
  description = "Nome do ambiente (vai nos nomes e nas tags)."
  type        = string
  default     = "producao"
}

variable "ami_ubuntu" {
  description = <<-EOT
    AMI do Ubuntu Server 24.04 LTS (amd64) na região. Pegue a atual com:
    aws ssm get-parameter --region sa-east-1 --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id --query Parameter.Value --output text
  EOT
  type        = string

  validation {
    condition     = can(regex("^ami-[0-9a-f]{8,17}$", var.ami_ubuntu))
    error_message = "Use um id de AMI (ami-...)."
  }
}

variable "tipo_app" {
  description = "Máquina da aplicação: API, notificador, painel, API do admin, vigia, agendador das coletas e o proxy com TLS."
  type        = string
  default     = "t3a.medium"
}

variable "tipo_banco" {
  description = "Máquina do banco: PostgreSQL e o serviço de backup."
  type        = string
  default     = "t3a.medium"
}

variable "disco_banco_gb" {
  description = "Disco de dados do banco (gp3, cifrado). Pode crescer depois, não diminuir."
  type        = number
  default     = 50
}

variable "admin_ips" {
  description = "IPs ou faixas CIDR (IPv4) da equipe que podem abrir o painel de revisão."
  type        = list(string)

  validation {
    condition     = length(var.admin_ips) > 0 && alltrue([for ip in var.admin_ips : can(cidrhost(ip, 0))])
    error_message = "Informe ao menos uma faixa CIDR válida (ex.: 203.0.113.10/32)."
  }
}

variable "dominio_api" {
  description = "Domínio da API do app (o DNS aponta para o IP elástico da máquina da aplicação)."
  type        = string
  default     = "api.vidapublica.org.br"
}

variable "dominio_painel" {
  description = "Domínio do painel de revisão."
  type        = string
  default     = "revisao.vidapublica.org.br"
}

variable "repositorio" {
  description = "Repositório git clonado nas máquinas (arquivos do compose de produção e migrações)."
  type        = string
  default     = "https://github.com/lcssathler/vida-publica.git"
}

variable "versao" {
  description = "Tag do git e das imagens no GHCR que as máquinas sobem (ex.: v0.8.0)."
  type        = string
}

variable "imagens" {
  description = "Prefixo das imagens publicadas pelo workflow imagens.yml."
  type        = string
  default     = "ghcr.io/lcssathler/vida-publica"
}

variable "planejar_sem_conta" {
  description = "true só para terraform plan local sem conta da AWS (credenciais fictícias)."
  type        = bool
  default     = false
}
