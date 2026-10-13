-- migrate:up

-- A pessoa é o centro: candidaturas, mandatos e registros de cada fonte apontam
-- para ela. O id é interno; ids das fontes ficam em pessoa_vinculo.
CREATE TABLE canon.pessoa (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_civil      text,
  nome_exibicao   text,
  data_nascimento date,
  sexo            char(1) CHECK (sexo IN ('M', 'F')),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

-- Cada registro de fonte ligado a uma pessoa, com o método e a confiança.
-- id_fonte: TSE "ano:sq_candidato", Câmara id do deputado, Senado código.
CREATE TABLE canon.pessoa_vinculo (
  fonte     text NOT NULL CHECK (fonte IN ('tse', 'camara', 'senado')),
  id_fonte  text NOT NULL,
  pessoa_id uuid NOT NULL REFERENCES canon.pessoa (id),
  metodo    text NOT NULL CHECK (
    metodo IN ('cpf', 'nome_nascimento', 'nascimento_cargo_uf', 'manual')
  ),
  confianca numeric(3, 2) NOT NULL CHECK (confianca > 0 AND confianca <= 1),
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fonte, id_fonte)
);

CREATE INDEX pessoa_vinculo_pessoa_idx ON canon.pessoa_vinculo (pessoa_id);

-- Registros que não puderam ser casados com segurança: revisão humana.
CREATE TABLE canon.match_review (
  fonte         text NOT NULL,
  id_fonte      text NOT NULL,
  motivo        text NOT NULL,
  candidatos    uuid[] NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente', 'resolvido', 'descartado')),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fonte, id_fonte)
);

-- Hash do CPF por pessoa: só worker e admin enxergam.
CREATE TABLE ident.pessoa (
  pessoa_id uuid PRIMARY KEY REFERENCES canon.pessoa (id),
  cpf_hash  char(64) NOT NULL UNIQUE CHECK (cpf_hash ~ '^[0-9a-f]{64}$')
);

-- O admin resolve a fila de revisão.
GRANT UPDATE ON canon.match_review TO vp_admin_role;

-- migrate:down

DROP TABLE ident.pessoa;
DROP TABLE canon.match_review;
DROP TABLE canon.pessoa_vinculo;
DROP TABLE canon.pessoa;
