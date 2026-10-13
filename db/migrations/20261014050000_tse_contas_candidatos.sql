-- migrate:up

-- Prestação de contas eleitorais de candidatos (TSE), como fotografia anual:
-- linhas novas entram, ausentes ganham removido_em. A mesma receita pode
-- aparecer em mais de uma prestação (parcial, relatório financeiro, final).
-- CPF de doador ou fornecedor pessoa física só em hash, em ident; CNPJ em claro.
CREATE TABLE canon.tse_receita (
  id                   char(64) PRIMARY KEY,
  ano_eleicao          smallint NOT NULL,
  sq_candidato         bigint NOT NULL,
  nr_turno             smallint,
  sq_prestador         bigint,
  tp_prestacao         text,
  dt_prestacao         date,
  sg_uf                text,
  sg_ue                text,
  cd_cargo             smallint,
  ds_cargo             text,
  nr_candidato         integer,
  nm_candidato         text,
  nr_partido           integer,
  sg_partido           text,
  cd_fonte             integer,
  ds_fonte             text,
  cd_origem            integer,
  ds_origem            text,
  ds_natureza          text,
  ds_especie           text,
  doador_cnpj          char(14),
  doador_nome          text,
  doador_nome_rfb      text,
  doador_cnae          text,
  doador_esfera        char(1),
  doador_uf            text,
  doador_municipio     text,
  doador_sq_candidato  bigint,
  doador_nr_partido    integer,
  doador_sg_partido    text,
  nr_recibo            text,
  nr_documento         text,
  sq_receita           bigint,
  data                 date,
  descricao            text,
  valor                numeric(14, 2) NOT NULL,
  natureza_estimavel   text,
  raw_object_id        uuid REFERENCES raw.raw_object (id),
  visto_em             timestamptz NOT NULL DEFAULT now(),
  removido_em          timestamptz,
  CHECK (doador_cnpj IS NULL OR doador_cnpj ~ '^[0-9]{14}$')
);

CREATE INDEX tse_receita_candidato_idx ON canon.tse_receita (ano_eleicao, sq_candidato);
CREATE INDEX tse_receita_prestador_idx ON canon.tse_receita (ano_eleicao, sq_prestador, sq_receita);
CREATE INDEX tse_receita_doador_cnpj_idx ON canon.tse_receita (doador_cnpj);
CREATE INDEX tse_receita_origem_idx ON canon.tse_receita (ano_eleicao, cd_origem);

CREATE TABLE ident.tse_receita_doador (
  linha_id char(64) PRIMARY KEY REFERENCES canon.tse_receita (id),
  cpf_hash char(64) NOT NULL CHECK (cpf_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX tse_receita_doador_hash_idx ON ident.tse_receita_doador (cpf_hash);

-- Doador originário de recursos repassados por partido ou outro candidato.
-- Liga-se à receita por (ano, sq_prestador, sq_receita).
CREATE TABLE canon.tse_receita_doador_originario (
  id              char(64) PRIMARY KEY,
  ano_eleicao     smallint NOT NULL,
  sq_prestador    bigint NOT NULL,
  sq_receita      bigint,
  tp_prestacao    text,
  sg_uf           text,
  doador_cnpj     char(14),
  doador_nome     text,
  doador_nome_rfb text,
  tipo            char(1),
  doador_cnae     text,
  data            date,
  descricao       text,
  valor           numeric(14, 2) NOT NULL,
  raw_object_id   uuid REFERENCES raw.raw_object (id),
  visto_em        timestamptz NOT NULL DEFAULT now(),
  removido_em     timestamptz,
  CHECK (doador_cnpj IS NULL OR doador_cnpj ~ '^[0-9]{14}$')
);

CREATE INDEX tse_receita_doador_originario_receita_idx
  ON canon.tse_receita_doador_originario (ano_eleicao, sq_prestador, sq_receita);

CREATE TABLE ident.tse_receita_doador_originario_doador (
  linha_id char(64) PRIMARY KEY REFERENCES canon.tse_receita_doador_originario (id),
  cpf_hash char(64) NOT NULL CHECK (cpf_hash ~ '^[0-9a-f]{64}$')
);

-- Despesas contratadas pelos candidatos.
CREATE TABLE canon.tse_despesa (
  id                      char(64) PRIMARY KEY,
  ano_eleicao             smallint NOT NULL,
  sq_candidato            bigint NOT NULL,
  nr_turno                smallint,
  sq_prestador            bigint,
  tp_prestacao            text,
  dt_prestacao            date,
  sg_uf                   text,
  sg_ue                   text,
  cd_cargo                smallint,
  ds_cargo                text,
  nr_candidato            integer,
  nm_candidato            text,
  nr_partido              integer,
  sg_partido              text,
  fornecedor_tipo         text,
  fornecedor_cnae         text,
  fornecedor_cnpj         char(14),
  fornecedor_nome         text,
  fornecedor_nome_rfb     text,
  fornecedor_esfera       char(1),
  fornecedor_uf           text,
  fornecedor_municipio    text,
  fornecedor_sq_candidato bigint,
  fornecedor_nr_partido   integer,
  fornecedor_sg_partido   text,
  tipo_documento          text,
  nr_documento            text,
  cd_origem               integer,
  ds_origem               text,
  sq_despesa              bigint,
  data                    date,
  descricao               text,
  valor                   numeric(14, 2) NOT NULL,
  raw_object_id           uuid REFERENCES raw.raw_object (id),
  visto_em                timestamptz NOT NULL DEFAULT now(),
  removido_em             timestamptz,
  CHECK (fornecedor_cnpj IS NULL OR fornecedor_cnpj ~ '^[0-9]{14}$')
);

CREATE INDEX tse_despesa_candidato_idx ON canon.tse_despesa (ano_eleicao, sq_candidato);
CREATE INDEX tse_despesa_fornecedor_cnpj_idx ON canon.tse_despesa (fornecedor_cnpj);

CREATE TABLE ident.tse_despesa_fornecedor (
  linha_id char(64) PRIMARY KEY REFERENCES canon.tse_despesa (id),
  cpf_hash char(64) NOT NULL CHECK (cpf_hash ~ '^[0-9a-f]{64}$')
);

-- migrate:down

DROP TABLE ident.tse_despesa_fornecedor;
DROP TABLE canon.tse_despesa;
DROP TABLE ident.tse_receita_doador_originario_doador;
DROP TABLE canon.tse_receita_doador_originario;
DROP TABLE ident.tse_receita_doador;
DROP TABLE canon.tse_receita;
