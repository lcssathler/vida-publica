-- migrate:up

-- Papéis de grupo. Em produção, os usuários de login são criados pela
-- infraestrutura e recebem um destes papéis; aqui só garantimos que existam.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vp_ingest_role') THEN
    CREATE ROLE vp_ingest_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vp_api_role') THEN
    CREATE ROLE vp_api_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vp_admin_role') THEN
    CREATE ROLE vp_admin_role NOLOGIN;
  END IF;
END
$$;

-- Ninguém cria objetos no esquema public.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- raw: metadados das coletas e execuções. Só o worker escreve.
-- canon: dados públicos normalizados. Só o worker escreve.
-- feed: eventos gerados. O worker escreve; o admin revisa.
-- app: dados de usuários. Só a API escreve; o worker não lê.
CREATE SCHEMA raw;
CREATE SCHEMA canon;
CREATE SCHEMA feed;
CREATE SCHEMA app;

GRANT USAGE ON SCHEMA raw, canon, feed TO vp_ingest_role;
GRANT USAGE ON SCHEMA canon, feed, app TO vp_api_role;
GRANT USAGE ON SCHEMA raw, canon, feed, app TO vp_admin_role;

-- Privilégios padrão: valem para toda tabela criada daqui em diante pelo dono
-- das migrações, sem precisar repetir GRANT em cada migração.
ALTER DEFAULT PRIVILEGES IN SCHEMA raw, canon, feed
  GRANT SELECT, INSERT, UPDATE ON TABLES TO vp_ingest_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA raw, canon, feed
  GRANT USAGE, SELECT ON SEQUENCES TO vp_ingest_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA canon, feed
  GRANT SELECT ON TABLES TO vp_api_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vp_api_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT USAGE, SELECT ON SEQUENCES TO vp_api_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA raw, canon, feed, app
  GRANT SELECT ON TABLES TO vp_admin_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA feed
  GRANT UPDATE ON TABLES TO vp_admin_role;

-- migrate:down

DROP SCHEMA app CASCADE;
DROP SCHEMA feed CASCADE;
DROP SCHEMA canon CASCADE;
DROP SCHEMA raw CASCADE;
GRANT CREATE ON SCHEMA public TO PUBLIC;
