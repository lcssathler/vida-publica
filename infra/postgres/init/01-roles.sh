#!/bin/sh
# Roda uma única vez, quando o volume do Postgres é criado.
# Cria os papéis de grupo e os usuários de login de cada componente. As
# credenciais vêm do infra/.env (nunca do repositório); as permissões ficam
# nas migrações (db/).
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v ingest_cred="$VP_INGEST_DB_PASSWORD" \
  -v api_cred="$VP_API_DB_PASSWORD" \
  -v admin_cred="$VP_ADMIN_DB_PASSWORD" <<'SQL'
CREATE ROLE vp_ingest_role NOLOGIN;
CREATE ROLE vp_api_role NOLOGIN;
CREATE ROLE vp_admin_role NOLOGIN;

-- format() com %L escapa o valor como literal SQL.
SELECT format('CREATE ROLE %I LOGIN IN ROLE %I', login, grupo)
FROM (VALUES ('vp_ingest', 'vp_ingest_role'),
             ('vp_api', 'vp_api_role'),
             ('vp_admin', 'vp_admin_role')) AS papeis (login, grupo)
\gexec

SELECT format('ALTER ROLE %I WITH ENCRYPTED PASSWORD %L', login, cred)
FROM (VALUES ('vp_ingest', :'ingest_cred'),
             ('vp_api', :'api_cred'),
             ('vp_admin', :'admin_cred')) AS credenciais (login, cred)
\gexec
SQL
