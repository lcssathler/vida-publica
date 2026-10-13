-- migrate:up

-- Senadores e suplentes como o Senado os publica (uma linha por código do Senado).
CREATE TABLE canon.senado_senador (
  codigo_senado    integer PRIMARY KEY,
  nome_parlamentar text NOT NULL,
  nome_completo    text,
  sexo             char(1) CHECK (sexo IN ('M', 'F')),
  data_nascimento  date,
  naturalidade     text,
  uf_naturalidade  char(2),
  sigla_partido    text,
  uf_parlamentar   char(2),
  email            text,
  url_foto         text,
  url_pagina       text,
  em_exercicio     boolean NOT NULL DEFAULT false,
  raw_object_id    uuid REFERENCES raw.raw_object (id),
  content_hash     char(64) NOT NULL,
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);

-- Participação em cada legislatura: titular ou suplente (1º, 2º).
CREATE TABLE canon.senado_senador_legislatura (
  codigo_senado  integer NOT NULL REFERENCES canon.senado_senador (codigo_senado),
  id_legislatura integer NOT NULL,
  participacao   text NOT NULL,
  PRIMARY KEY (codigo_senado, id_legislatura, participacao)
);

-- migrate:down

DROP TABLE canon.senado_senador_legislatura;
DROP TABLE canon.senado_senador;
