# PostgreSQL 16 com o pgBackRest (backup contínuo, restauração por ponto no
# tempo). A mesma imagem roda o banco (o arquivamento de WAL chama o
# pgBackRest) e o serviço de backup (backups, verificação e teste de
# restauração). Configuração só por variáveis PGBACKREST_*: nenhuma credencial
# fica na imagem nem no repositório.
#   docker build -t vida-publica-postgres infra/postgres
FROM postgres:16-alpine

RUN apk add --no-cache pgbackrest jq curl \
 && mkdir -p /var/log/pgbackrest /var/spool/pgbackrest /var/lib/pgbackrest \
 && chown postgres:postgres /var/log/pgbackrest /var/spool/pgbackrest /var/lib/pgbackrest

COPY --chmod=755 vp-backup /usr/local/bin/vp-backup
COPY --chmod=644 somas.sql /usr/local/share/vp-backup/somas.sql
