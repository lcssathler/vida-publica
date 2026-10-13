# Banco de dados

Migrações SQL versionadas com [dbmate](https://github.com/amacneil/dbmate), rodando por Docker (nenhuma instalação local).

## Aplicar as migrações

Com a infraestrutura local no ar (`infra/README.md`):

```bash
docker compose -f infra/docker-compose.yml run --rm migrate
```

## Criar uma migração

```bash
docker compose -f infra/docker-compose.yml run --rm migrate new nome_da_migracao
```

O arquivo aparece em `db/migrations/` com as seções `-- migrate:up` e `-- migrate:down`. Escreva sempre as duas.

## Esquemas

| Esquema | Conteúdo | Escreve | Lê |
| --- | --- | --- | --- |
| `raw` | Metadados de cada coleta e execuções de jobs | worker | worker, admin |
| `canon` | Dados públicos normalizados | worker | worker, API, admin |
| `feed` | Eventos gerados | worker (admin revisa) | worker, API, admin |
| `app` | Dados de usuários | API | API, admin |

## Papéis

Cada componente conecta com um usuário próprio, membro de um papel de grupo:

| Usuário | Papel | Pode |
| --- | --- | --- |
| `vp_ingest` | `vp_ingest_role` | ler e escrever `raw`, `canon`, `feed`; não enxerga `app` |
| `vp_api` | `vp_api_role` | ler `canon` e `feed`; ler e escrever `app`; não enxerga `raw` |
| `vp_admin` | `vp_admin_role` | ler tudo; atualizar `feed` (revisão de eventos) |

Nenhum deles cria tabelas: só o dono do banco (`vp_owner` no ambiente local), usado apenas pelas migrações, altera o esquema. Os privilégios padrão (`ALTER DEFAULT PRIVILEGES`) fazem toda tabela nova herdar essas regras.

No ambiente local, os usuários são criados por `infra/postgres/init/01-roles.sh` na primeira subida do volume, com senhas do `infra/.env`. Em produção, a infraestrutura cria os usuários e concede os papéis.

## Testes

As permissões e as restrições do esquema têm testes de integração em `services/ingest/tests/integration`, rodados no CI contra um banco recém-migrado:

```bash
cd services/ingest
uv run pytest -m integration
```

As variáveis do `infra/.env` precisam estar no ambiente.
