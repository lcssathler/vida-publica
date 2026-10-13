-- migrate:up

-- Despesas da Cota para Exercício da Atividade Parlamentar dos Senadores (CEAPS),
-- do arquivo anual do Senado. O arquivo identifica o senador só pelo nome;
-- codigo_senado vem do casamento com canon.senado_senador. CPF de fornecedor
-- pessoa física só em hash, em ident.
CREATE TABLE canon.senado_despesa (
  id              char(64) PRIMARY KEY,
  ano             smallint NOT NULL,
  mes             smallint NOT NULL,
  codigo_senado   integer REFERENCES canon.senado_senador (codigo_senado),
  nome_senador    text NOT NULL,
  tipo_despesa    text,
  fornecedor      text,
  fornecedor_cnpj char(14),
  documento       text,
  data            date,
  detalhamento    text,
  valor           numeric(14, 2) NOT NULL,
  cod_documento   bigint,
  raw_object_id   uuid REFERENCES raw.raw_object (id),
  visto_em        timestamptz NOT NULL DEFAULT now(),
  removido_em     timestamptz,
  CHECK (fornecedor_cnpj IS NULL OR fornecedor_cnpj ~ '^[0-9]{14}$')
);

CREATE INDEX senado_despesa_senador_mes_idx ON canon.senado_despesa (codigo_senado, ano, mes);
CREATE INDEX senado_despesa_ano_idx ON canon.senado_despesa (ano, mes);

CREATE TABLE ident.senado_despesa_fornecedor (
  linha_id char(64) PRIMARY KEY REFERENCES canon.senado_despesa (id),
  cpf_hash char(64) NOT NULL CHECK (cpf_hash ~ '^[0-9a-f]{64}$')
);

-- migrate:down

DROP TABLE ident.senado_despesa_fornecedor;
DROP TABLE canon.senado_despesa;
