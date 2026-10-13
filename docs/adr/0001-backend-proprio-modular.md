# 0001 — Backend próprio, modular e portável

Data: 2026-10-13 · Situação: aceita

## Contexto

O app precisa crescer sem depender inteiramente de um único fornecedor de infraestrutura, e deve rodar completo na máquina de quem desenvolve, inclusive com banco local.

## Decisão

- API própria em NestJS, organizada como monólito modular.
- Toda dependência externa fica atrás de uma interface: banco (PostgreSQL padrão), fila (tabela no Postgres com `SKIP LOCKED`, depois RabbitMQ ou SQS), armazenamento (API S3: MinIO no local), push (FCM), login (módulo próprio com JWT e OIDC), busca (busca textual do Postgres).
- Tudo roda em contêineres: Docker Compose no local; VMs com Terraform em produção.

## Consequências

- Cerca de 2 a 3 semanas a mais no MVP para autenticação, API e permissões.
- A equipe passa a cuidar de backup, atualizações e monitoramento.
- Qualquer peça pode ser trocada sem reescrever a regra de negócio.
