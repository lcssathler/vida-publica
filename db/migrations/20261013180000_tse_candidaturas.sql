-- migrate:up

-- Candidaturas como o TSE as publica: uma linha por candidatura e turno.
-- O e-mail declarado pelo candidato existe no arquivo do TSE, mas não é guardado.
CREATE TABLE canon.tse_candidatura (
  ano_eleicao             smallint NOT NULL,
  sq_candidato            bigint NOT NULL,
  nr_turno                smallint NOT NULL,
  cd_eleicao              integer,
  ds_eleicao              text,
  dt_eleicao              date,
  sg_uf                   text,
  sg_ue                   text,
  nm_ue                   text,
  cd_cargo                smallint,
  ds_cargo                text,
  nr_candidato            integer,
  nm_candidato            text NOT NULL,
  nm_urna_candidato       text,
  nm_social_candidato     text,
  ds_situacao_candidatura text,
  nr_partido              integer,
  sg_partido              text,
  nm_partido              text,
  nr_federacao            integer,
  sg_federacao            text,
  nm_federacao            text,
  sq_coligacao            bigint,
  nm_coligacao            text,
  sg_uf_nascimento        text,
  dt_nascimento           date,
  ds_genero               text,
  ds_grau_instrucao       text,
  ds_estado_civil         text,
  ds_cor_raca             text,
  ds_ocupacao             text,
  ds_sit_tot_turno        text,
  raw_object_id           uuid REFERENCES raw.raw_object (id),
  content_hash            char(64) NOT NULL,
  atualizado_em           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ano_eleicao, sq_candidato, nr_turno)
);

CREATE INDEX tse_candidatura_cargo_uf_idx ON canon.tse_candidatura (ano_eleicao, cd_cargo, sg_uf);
CREATE INDEX tse_candidatura_partido_idx ON canon.tse_candidatura (ano_eleicao, nr_partido);

CREATE TABLE ident.tse_candidatura (
  ano_eleicao  smallint NOT NULL,
  sq_candidato bigint NOT NULL,
  cpf_hash     char(64) CHECK (cpf_hash ~ '^[0-9a-f]{64}$'),
  titulo_hash  char(64) CHECK (titulo_hash ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (ano_eleicao, sq_candidato)
);

CREATE INDEX tse_candidatura_cpf_hash_idx ON ident.tse_candidatura (cpf_hash);

-- migrate:down

DROP TABLE ident.tse_candidatura;
DROP TABLE canon.tse_candidatura;
