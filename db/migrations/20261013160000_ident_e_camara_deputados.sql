-- migrate:up

-- ident: identificadores sensíveis (hash de CPF e de título de eleitor), usados
-- só para casar a mesma pessoa entre fontes. A API não enxerga este esquema.
CREATE SCHEMA ident;
GRANT USAGE ON SCHEMA ident TO vp_ingest_role, vp_admin_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA ident
  GRANT SELECT, INSERT, UPDATE ON TABLES TO vp_ingest_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA ident
  GRANT SELECT ON TABLES TO vp_admin_role;

-- Deputados federais como a Câmara os publica (uma linha por id da Câmara).
CREATE TABLE canon.camara_deputado (
  id_camara            integer PRIMARY KEY,
  nome_parlamentar     text NOT NULL,
  nome_civil           text,
  nome_eleitoral       text,
  sexo                 char(1) CHECK (sexo IN ('M', 'F')),
  data_nascimento      date,
  data_falecimento     date,
  uf_nascimento        char(2),
  municipio_nascimento text,
  escolaridade         text,
  sigla_partido        text,
  sigla_uf             char(2),
  id_legislatura       integer,
  situacao             text,
  condicao_eleitoral   text,
  status_desde         date,
  url_foto             text,
  email                text,
  redes_sociais        text[] NOT NULL DEFAULT '{}',
  raw_object_id        uuid REFERENCES raw.raw_object (id),
  content_hash         char(64) NOT NULL,
  atualizado_em        timestamptz NOT NULL DEFAULT now()
);

-- Em quais legislaturas cada deputado aparece (inclui suplentes que assumiram).
CREATE TABLE canon.camara_deputado_legislatura (
  id_camara      integer NOT NULL REFERENCES canon.camara_deputado (id_camara),
  id_legislatura integer NOT NULL,
  PRIMARY KEY (id_camara, id_legislatura)
);

CREATE TABLE ident.camara_deputado (
  id_camara integer PRIMARY KEY REFERENCES canon.camara_deputado (id_camara),
  cpf_hash  char(64) CHECK (cpf_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX camara_deputado_cpf_hash_idx ON ident.camara_deputado (cpf_hash);

-- migrate:down

DROP TABLE ident.camara_deputado;
DROP TABLE canon.camara_deputado_legislatura;
DROP TABLE canon.camara_deputado;
DROP SCHEMA ident;
