# Produção

Duas máquinas virtuais na AWS em São Paulo (`sa-east-1`), criadas pelo Terraform (`infra/terraform`), cada uma com Docker Compose:

| Máquina | Serviços | Disco |
| --- | --- | --- |
| `app` (t3a.medium, IP elástico) | Caddy (TLS automático), API, notificador, API do admin, painel, agendador das coletas, vigia | 30 GB, cifrado |
| `banco` (t3a.medium) | PostgreSQL 16 com pgBackRest, serviço de backup | 20 GB + disco de dados de 50 GB separado, cifrados |

Por que assim:

- **Região São Paulo**: os dados ficam no Brasil (o que cada pessoa segue pode revelar opinião política; a consulta de LGPD ainda está pendente) e a latência para quem usa o app é a menor.
- **Sem SSH**: nenhuma porta 22 aberta. Operação pelo AWS Systems Manager (`aws ssm start-session --target <id>`), com IAM e registro.
- **Banco fechado**: só a máquina da aplicação chega no 5432 (grupo de segurança); o banco escuta só no IP privado.
- **Segredos no AWS Secrets Manager**: um segredo por máquina (JSON com as variáveis). O Terraform cria só o segredo vazio; o conteúdo vai pela CLI, sem passar pelo estado do Terraform, pelo user_data nem por arquivo. Cada máquina lê só o próprio segredo (papel IAM), na subida (`subir.sh`), direto para as variáveis dos processos.
- **Credenciais da AWS**: as máquinas usam o papel delas (IMDSv2). O S3 de dados brutos e o repositório do backup não têm chave em lugar nenhum.
- **Backup**: pgBackRest no bucket de backup (cifrado com AES-256 pela frase do segredo do banco, versões guardadas por 30 dias), WAL contínuo e teste de restauração mensal (veja `infra/README.md`).
- **Painel de revisão**: só os IPs da equipe (`admin_ips`), conferidos no Caddy, no painel e na API do admin, com login e 2FA.

## Custo estimado (por mês, sob demanda, sem impostos)

Preços da AWS em `sa-east-1` consultados em outubro de 2026 (aws-pricing.com; o preço de S3 é aproximado).

| Item | Conta | US$ |
| --- | --- | --- |
| 2 × EC2 t3a.medium (2 vCPU, 4 GB) | 2 × 730 h × US$ 0,0605 | 88,33 |
| EBS gp3 (30 + 20 + 50 GB) | 100 GB × US$ 0,152 | 15,20 |
| IPv4 público (IP elástico da app + IP do banco) | 2 × 730 h × US$ 0,005 | 7,30 |
| S3 (dados brutos e backup, ~20 GB no início) | ~US$ 0,04/GB + pedidos | ~2,00 |
| Secrets Manager (2 segredos) | 2 × US$ 0,40 | 0,80 |
| Tráfego de saída | os primeiros 100 GB/mês são gratuitos | 0,00 |
| **Total** | | **~US$ 114** |

Sentry e healthchecks.io: planos gratuitos. Para reduzir: um Savings Plan de 1 ano corta cerca de 30% das máquinas; instâncias Graviton (t4g) custam cerca de 11% menos, mas pedem imagens arm64.

## Primeira subida

Pré-requisitos: conta na AWS (com a CLI configurada, de preferência pelo AWS CloudShell, para não deixar credencial em arquivo), o domínio, e o Terraform (ou o contêiner `hashicorp/terraform`).

1. **Imagens**: crie a tag (`git tag v0.8.0 && git push origin v0.8.0`); o workflow `Imagens` publica `ghcr.io/lcssathler/vida-publica-{api,painel,worker,postgres}`. Deixe os quatro pacotes públicos (GitHub > Packages > Package settings > Change visibility), porque as máquinas baixam sem login.
2. **Infraestrutura**: copie `infra/terraform/exemplo.tfvars` para `producao.tfvars` (ignorado pelo git), com a AMI do Ubuntu 24.04 (veja a descrição da variável `ami_ubuntu`), a versão e os IPs da equipe. Depois:

```bash
terraform -chdir=infra/terraform init
```

```bash
terraform -chdir=infra/terraform apply -var-file=producao.tfvars
```

3. **Segredos** (as máquinas tentam subir sozinhas e esperam o segredo; rode isto logo depois do apply):

```bash
segredos=$(node infra/producao/gerar-segredos.mjs --email-acme equipe@vidapublica.org.br)
```

```bash
jq -c .app <<<"$segredos" | aws secretsmanager put-secret-value --secret-id vida-publica-producao/app --secret-string file:///dev/stdin
```

```bash
jq -c .banco <<<"$segredos" | aws secretsmanager put-secret-value --secret-id vida-publica-producao/banco --secret-string file:///dev/stdin
```

   Guarde a `VP_BACKUP_CIFRA` também fora da AWS (num cofre de senhas): sem ela, o backup não abre. Os opcionais (`VP_FCM_CREDENCIAIS_JSON`, `VP_SENTRY_DSN`, `VP_HEALTHCHECKS_PING_KEY`, `VP_APPLE_CLIENT_IDS`, `VP_GOOGLE_CLIENT_IDS`) entram no JSON do segredo com `put-secret-value` e valem no próximo `systemctl restart vida-publica`.
4. **Subir**: em cada máquina (pelo Session Manager), primeiro o banco, depois a aplicação: `sudo systemctl restart vida-publica` e `sudo journalctl -u vida-publica`.
5. **DNS**: registros A de `api` e `revisao` para o `ip_app` (saída do Terraform). O Caddy pede os certificados sozinho.
6. **Conta do painel** (na máquina `app`): `sudo docker compose -f /opt/vida-publica/infra/producao/app.compose.yml exec admin-api node dist/admin/admin-cli.js criar <email> <nome>`.
7. **Carga inicial**: o agendador começa as coletas sozinho; a primeira execução de cada tipo do motor fica segurada (carga inicial) até `docker compose ... run --rm agendador eventos-liberar` ou a revisão no painel.

## Atualizar

1. Nova tag e imagens publicadas (passo 1 acima).
2. Em cada máquina (banco primeiro, por causa das migrações): `cd /opt/vida-publica && sudo git fetch --depth 1 origin tag <versao> && sudo git checkout <versao>`, troque `VERSAO` em `/etc/vida-publica/ambiente` e `sudo systemctl restart vida-publica`.

## Restaurar o banco

Na máquina `banco`, com a aplicação parada (`systemctl stop vida-publica` na `app`):

```bash
sudo docker compose -f /opt/vida-publica/infra/producao/banco.compose.yml stop postgres backup
```

```bash
sudo -E docker compose -f /opt/vida-publica/infra/producao/banco.compose.yml run --rm restaurar --type=time --target="2026-10-15 13:00:00+00" --target-action=promote
```

(as variáveis do segredo precisam estar exportadas, como no `subir.sh`; sem `--type`, restaura até o último WAL). Depois `systemctl restart vida-publica` no banco e na aplicação, e um backup completo novo: `docker compose ... exec backup vp-backup backup full`.

## Desligar

`terraform destroy -var-file=producao.tfvars` apaga tudo, menos o disco de dados do banco (`prevent_destroy`) e os buckets com objetos (o S3 recusa apagar bucket cheio). Isso é de propósito.
