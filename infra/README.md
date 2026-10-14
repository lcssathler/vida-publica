# Infraestrutura local

Sobe PostgreSQL 16, um armazenamento compatível com S3 ([RustFS](https://github.com/rustfs/rustfs)) a API e o notificador (fila de avisos) na sua máquina. O worker de coleta roda sob demanda. Requer Docker e Node.

## Primeira vez

Gere o `infra/.env` com senhas aleatórias (o arquivo nunca é versionado):

```bash
node infra/scripts/init-env.mjs
```

## Comandos

```bash
docker compose -f infra/docker-compose.yml up -d --wait
```

```bash
docker compose -f infra/docker-compose.yml down
```

Rodar um comando do worker de coleta:

```bash
docker compose -f infra/docker-compose.yml run --rm worker check-storage
```

Uma rodada do notificador (o serviço `notificador` roda o modo contínuo; sem credenciais do FCM, usa o adaptador falso, que só registra os envios no log):

```bash
docker compose -f infra/docker-compose.yml run --rm notificador node dist/notificacoes/notificador.js ciclo
```

Aplicar as migrações do banco (veja `db/README.md`):

```bash
docker compose -f infra/docker-compose.yml run --rm migrate
```

Para apagar também os dados locais:

```bash
docker compose -f infra/docker-compose.yml down -v
```

## Endereços

| Serviço | Endereço | Credenciais |
| --- | --- | --- |
| PostgreSQL | `localhost:5433`, banco `vida_publica` | `POSTGRES_USER` / `POSTGRES_PASSWORD` do `infra/.env` |
| S3 (API) | `http://localhost:9000` | `S3_ACCESS_KEY` / `S3_SECRET_KEY` do `infra/.env` |
| S3 (console) | `http://localhost:9001` | as mesmas |
| API | `http://localhost:3000/health` | — |

O usuário `vp_owner` é o dono do banco e só é usado para rodar migrações. Worker, API, admin e notificador usam os usuários `vp_ingest`, `vp_api`, `vp_admin` e `vp_notify`, com permissões mínimas, criados na primeira subida do volume (`infra/postgres/init`). Se você já tinha um volume antigo, rode `node infra/scripts/init-env.mjs` e recrie com `down -v`. Para manter os dados, aplique as migrações e crie só o usuário que falta, com a senha que o script acrescentou ao `infra/.env` (o `vp_notify` chegou na Fase 7):

```sql
CREATE ROLE vp_notify LOGIN IN ROLE vp_notify_role PASSWORD '<VP_NOTIFY_DB_PASSWORD>';
```

A aplicação só fala com a API S3, então em produção qualquer serviço compatível serve (AWS S3, Cloudflare R2, Wasabi).
