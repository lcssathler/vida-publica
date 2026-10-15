# Infraestrutura local

Sobe PostgreSQL 16 (com backup contínuo pelo pgBackRest), um armazenamento compatível com S3 ([RustFS](https://github.com/rustfs/rustfs)), a API, o notificador (fila de avisos), a API do admin e o painel de revisão na sua máquina. O worker de coleta roda sob demanda. Requer Docker e Node.

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

Criar uma conta do painel de revisão (mostra, uma única vez, a senha inicial e o segredo do 2FA para o app de autenticação; guarde num cofre de senhas):

```bash
docker compose -f infra/docker-compose.yml exec admin-api node dist/admin/admin-cli.js criar <email> <nome>
```

Aplicar as migrações do banco (veja `db/README.md`):

```bash
docker compose -f infra/docker-compose.yml run --rm migrate
```

Vigia de dados desatualizados: o serviço `vigia` roda sozinho a cada 5 minutos; uma volta avulsa:

```bash
docker compose -f infra/docker-compose.yml run --rm worker vigiar
```

Sentry e healthchecks.io são opcionais: com `VP_SENTRY_DSN` e `VP_HEALTHCHECKS_PING_KEY` no `infra/.env` (nunca versionados), erros, traces e alertas saem também para lá; sem elas, ficam nos logs (`docker compose -f infra/docker-compose.yml logs vigia`).

## Backup e restauração

O banco tem backup contínuo com o [pgBackRest](https://pgbackrest.org): a imagem `infra/postgres` é o Postgres 16 com o pgBackRest, e o próprio banco arquiva cada segmento de WAL no repositório (`archive_command`, no máximo 5 minutos de atraso com `archive_timeout`). Com os backups e o WAL, dá para restaurar o banco em **qualquer ponto no tempo** desde o backup completo mais antigo guardado.

- **Repositório**: S3, cifrado com AES-256 (`VP_BACKUP_CIFRA`; sem a frase, o backup não abre) e comprimido com zstd. No ambiente local é o RustFS, atrás do proxy TLS `backup-s3` (o pgBackRest só fala S3 por HTTPS); em produção, um bucket de outro provedor, longe do servidor do banco. Configuração só por variáveis `PGBACKREST_*` no compose (âncora `x-pgbackrest`).
- **Serviço `backup`** (mesma imagem, dados só para leitura, socket compartilhado), a cada hora:
  - confere o arquivamento de WAL (`pg_stat_archiver`: último arquivado há menos de 30 minutos e nenhuma falha depois dele);
  - faz o backup completo se o último tem mais de 7 dias, ou o diferencial se o último backup tem mais de 24 horas, e verifica o repositório (`pgbackrest verify`); guarda 2 completos (e o WAL entre eles);
  - a cada 30 dias (`VP_BACKUP_TESTE_DIAS`; 0 desliga), roda o teste de restauração.
- **Teste de restauração** (`vp-backup testar-restauracao`): trava as tabelas contra escrita (leituras seguem), marca um ponto de restauração no WAL e soma cada tabela dos esquemas da aplicação (linhas e md5 de todas as linhas) na mesma fotografia; grava uma marca depois do ponto; restaura num banco descartável até o ponto, soma de novo e compara. Passa só se todas as tabelas forem iguais e a marca não estiver na cópia.
- **Alertas**: cada execução vai para `raw.job_run` (`backup`, `backup-wal`, `backup-restauracao`) e o vigia alerta se passar do prazo (26 h, 2 h e 35 dias, em `raw.fonte_prazo`); com `VP_HEALTHCHECKS_PING_KEY`, também pinga o check `backup` do healthchecks.io.

Comandos (dentro do serviço `backup`):

```bash
docker compose -f infra/docker-compose.yml exec backup vp-backup info
```

```bash
docker compose -f infra/docker-compose.yml exec backup vp-backup backup full
```

```bash
docker compose -f infra/docker-compose.yml exec backup vp-backup testar-restauracao
```

### Restaurar o banco de verdade

1. Parar quem escreve: `docker compose -f infra/docker-compose.yml stop api notificador admin-api vigia backup` e, por último, `postgres`.
2. Restaurar sobre o diretório de dados (serviço `restaurar`, com o banco parado), até o instante desejado; sem argumentos, até o último WAL arquivado:

```bash
docker compose -f infra/docker-compose.yml run --rm restaurar --type=time --target="2026-10-15 13:00:00+00" --target-action=promote
```

3. Subir o `postgres`, conferir os dados e subir o resto. Depois de uma restauração para trás, o banco segue numa linha do tempo nova: rode `vp-backup backup full` para começar um backup novo dessa linha.

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
| Painel de revisão | `http://127.0.0.1:3002` | conta do painel (e-mail, senha e 2FA), só desta máquina (`VP_ADMIN_IPS`) |
| API do admin | `http://127.0.0.1:3001/health` | só o painel usa; sem o IP repassado pelo painel, 403 |

O usuário `vp_owner` é o dono do banco e só é usado para rodar migrações. Worker, API, admin e notificador usam os usuários `vp_ingest`, `vp_api`, `vp_admin` e `vp_notify`, com permissões mínimas, criados na primeira subida do volume (`infra/postgres/init`). Se você já tinha um volume antigo, rode `node infra/scripts/init-env.mjs` e recrie com `down -v`. Para manter os dados, aplique as migrações e crie só o usuário que falta, com a senha que o script acrescentou ao `infra/.env` (o `vp_notify` chegou na Fase 7):

```sql
CREATE ROLE vp_notify LOGIN IN ROLE vp_notify_role PASSWORD '<VP_NOTIFY_DB_PASSWORD>';
```

A aplicação só fala com a API S3, então em produção qualquer serviço compatível serve (AWS S3, Cloudflare R2, Wasabi).
