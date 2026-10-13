# Infraestrutura local

Sobe PostgreSQL 16 e um armazenamento compatível com S3 ([RustFS](https://github.com/rustfs/rustfs)) na sua máquina. Requer Docker e Node.

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

O usuário `vp_owner` é o dono do banco e só é usado para rodar migrações. API, worker e admin usam papéis próprios com permissões mínimas, criados pelas migrações em `db/`.

A aplicação só fala com a API S3, então em produção qualquer serviço compatível serve (AWS S3, Cloudflare R2, Wasabi).
