-- migrate:up

-- Prestação de contas eleitorais de órgãos partidários (TSE): receitas, doador
-- originário, despesas contratadas e pagamentos (com a fonte do dinheiro:
-- Fundo Especial, Fundo Partidário, outros). Fotografia anual, como as demais.
-- esfera: N nacional, F estadual/distrital, M municipal, Z zonal.
CREATE TABLE canon.tse_partido_receita (
  id                  char(64) PRIMARY KEY,
  ano_eleicao         smallint NOT NULL,
  sq_prestador        bigint NOT NULL,
  tp_prestacao        text,
  dt_prestacao        date,
  esfera              char(1),
  sg_uf               text,
  cd_municipio        integer,
  nm_municipio        text,
  cnpj_prestador      char(14),
  nr_partido          integer,
  sg_partido          text,
  cd_fonte            integer,
  ds_fonte            text,
  cd_origem           integer,
  ds_origem           text,
  ds_natureza         text,
  ds_especie          text,
  doador_cnpj         char(14),
  doador_nome         text,
  doador_nome_rfb     text,
  doador_cnae         text,
  doador_esfera       char(1),
  doador_uf           text,
  doador_municipio    text,
  doador_sq_candidato bigint,
  doador_nr_partido   integer,
  doador_sg_partido   text,
  nr_recibo           text,
  nr_documento        text,
  sq_receita          bigint,
  data                date,
  descricao           text,
  valor               numeric(14, 2) NOT NULL,
  raw_object_id       uuid REFERENCES raw.raw_object (id),
  visto_em            timestamptz NOT NULL DEFAULT now(),
  removido_em         timestamptz,
  CHECK (doador_cnpj IS NULL OR doador_cnpj ~ '^[0-9]{14}$'),
  CHECK (cnpj_prestador IS NULL OR cnpj_prestador ~ '^[0-9]{14}$')
);

CREATE INDEX tse_partido_receita_prestador_idx
  ON canon.tse_partido_receita (ano_eleicao, sq_prestador, sq_receita);
CREATE INDEX tse_partido_receita_partido_idx
  ON canon.tse_partido_receita (ano_eleicao, nr_partido, esfera, sg_uf);
CREATE INDEX tse_partido_receita_cnpj_idx ON canon.tse_partido_receita (cnpj_prestador);

CREATE TABLE ident.tse_partido_receita_doador (
  linha_id char(64) PRIMARY KEY REFERENCES canon.tse_partido_receita (id),
  cpf_hash char(64) NOT NULL CHECK (cpf_hash ~ '^[0-9a-f]{64}$')
);

CREATE TABLE canon.tse_partido_receita_doador_originario (
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

CREATE INDEX tse_partido_receita_doador_originario_receita_idx
  ON canon.tse_partido_receita_doador_originario (ano_eleicao, sq_prestador, sq_receita);

CREATE TABLE ident.tse_partido_receita_doador_originario_doador (
  linha_id char(64) PRIMARY KEY REFERENCES canon.tse_partido_receita_doador_originario (id),
  cpf_hash char(64) NOT NULL CHECK (cpf_hash ~ '^[0-9a-f]{64}$')
);

-- Despesas contratadas. Repasses a candidatos aparecem aqui com o candidato como
-- fornecedor (fornecedor_sq_candidato) e origem "Doações financeiras a outros
-- candidatos/partidos".
CREATE TABLE canon.tse_partido_despesa (
  id                      char(64) PRIMARY KEY,
  ano_eleicao             smallint NOT NULL,
  sq_prestador            bigint NOT NULL,
  tp_prestacao            text,
  dt_prestacao            date,
  esfera                  char(1),
  sg_uf                   text,
  sg_ue                   text,
  cd_municipio            integer,
  nm_municipio            text,
  cnpj_prestador          char(14),
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
  fornecedor_cargo        text,
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
  CHECK (fornecedor_cnpj IS NULL OR fornecedor_cnpj ~ '^[0-9]{14}$'),
  CHECK (cnpj_prestador IS NULL OR cnpj_prestador ~ '^[0-9]{14}$')
);

CREATE INDEX tse_partido_despesa_prestador_idx
  ON canon.tse_partido_despesa (ano_eleicao, sq_prestador, sq_despesa);
CREATE INDEX tse_partido_despesa_candidato_idx
  ON canon.tse_partido_despesa (ano_eleicao, fornecedor_sq_candidato);

CREATE TABLE ident.tse_partido_despesa_fornecedor (
  linha_id char(64) PRIMARY KEY REFERENCES canon.tse_partido_despesa (id),
  cpf_hash char(64) NOT NULL CHECK (cpf_hash ~ '^[0-9a-f]{64}$')
);

-- Pagamentos das despesas, com a fonte do recurso usado.
CREATE TABLE canon.tse_partido_pagamento (
  id               char(64) PRIMARY KEY,
  ano_eleicao      smallint NOT NULL,
  sq_prestador     bigint NOT NULL,
  tp_prestacao     text,
  sg_uf            text,
  tipo_documento   text,
  nr_documento     text,
  cd_fonte         integer,
  ds_fonte         text,
  cd_origem        integer,
  ds_origem        text,
  ds_natureza      text,
  ds_especie       text,
  sq_despesa       bigint,
  sq_parcelamento  bigint,
  data             date,
  descricao        text,
  valor            numeric(14, 2) NOT NULL,
  raw_object_id    uuid REFERENCES raw.raw_object (id),
  visto_em         timestamptz NOT NULL DEFAULT now(),
  removido_em      timestamptz
);

CREATE INDEX tse_partido_pagamento_despesa_idx
  ON canon.tse_partido_pagamento (ano_eleicao, sq_prestador, sq_despesa);

-- migrate:down

DROP TABLE canon.tse_partido_pagamento;
DROP TABLE ident.tse_partido_despesa_fornecedor;
DROP TABLE canon.tse_partido_despesa;
DROP TABLE ident.tse_partido_receita_doador_originario_doador;
DROP TABLE canon.tse_partido_receita_doador_originario;
DROP TABLE ident.tse_partido_receita_doador;
DROP TABLE canon.tse_partido_receita;
