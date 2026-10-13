-- migrate:up

-- Despesas da cota parlamentar (CEAP) da Câmara, uma linha por documento do
-- arquivo anual. O id é um hash dos campos que identificam a linha no arquivo
-- (o ideDocumento se repete em alguns lançamentos). O arquivo é rebaixado todo
-- dia: linhas novas entram, linhas que sumiram ganham removido_em.
-- O CPF do deputado existe no arquivo e não é guardado; o do fornecedor pessoa
-- física vira hash em ident.
CREATE TABLE canon.camara_despesa (
  id                      char(64) PRIMARY KEY,
  ano                     smallint NOT NULL,
  mes                     smallint NOT NULL,
  id_camara               integer,
  nu_deputado_id          integer,
  nome_parlamentar        text NOT NULL,
  sigla_uf                text,
  sigla_partido           text,
  id_legislatura          integer,
  num_subcota             integer NOT NULL,
  descricao               text,
  num_especificacao       integer,
  descricao_especificacao text,
  fornecedor              text,
  fornecedor_cnpj         char(14),
  numero_documento        text,
  tipo_documento          smallint,
  emitido_em              date,
  valor_documento         numeric(14, 2),
  valor_glosa             numeric(14, 2),
  valor_liquido           numeric(14, 2) NOT NULL,
  parcela                 integer,
  passageiro              text,
  trecho                  text,
  lote                    bigint,
  ressarcimento           bigint,
  restituicao_paga_em     date,
  valor_restituicao       numeric(14, 2),
  ide_documento           bigint,
  url_documento           text,
  raw_object_id           uuid REFERENCES raw.raw_object (id),
  visto_em                timestamptz NOT NULL DEFAULT now(),
  removido_em             timestamptz,
  CHECK (fornecedor_cnpj IS NULL OR fornecedor_cnpj ~ '^[0-9]{14}$')
);

CREATE INDEX camara_despesa_deputado_mes_idx ON canon.camara_despesa (id_camara, ano, mes);
CREATE INDEX camara_despesa_ano_idx ON canon.camara_despesa (ano, mes);

CREATE TABLE ident.camara_despesa_fornecedor (
  despesa_id char(64) PRIMARY KEY REFERENCES canon.camara_despesa (id),
  cpf_hash   char(64) NOT NULL CHECK (cpf_hash ~ '^[0-9a-f]{64}$')
);

-- migrate:down

DROP TABLE ident.camara_despesa_fornecedor;
DROP TABLE canon.camara_despesa;
