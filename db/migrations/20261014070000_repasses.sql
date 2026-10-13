-- migrate:up

-- Repasses de partido para candidato, uma linha por receita do TSE com origem
-- "Recursos de partido político". Cada linha guarda o diretório que repassou
-- (esfera e UF) e a fonte do dinheiro (fundo especial, fundo partidário, outros):
-- níveis diferentes nunca são somados num só número.
-- A mesma receita aparece em mais de uma prestação (parcial, relatório
-- financeiro, final): só a mais recente fica vigente e entra nos totais.
CREATE TABLE canon.repasse (
  receita_id             char(64) PRIMARY KEY REFERENCES canon.tse_receita (id) ON DELETE CASCADE,
  ano_eleicao            smallint NOT NULL,
  sq_candidato           bigint NOT NULL,
  sq_receita             bigint,
  pessoa_id              uuid REFERENCES canon.pessoa (id),
  nr_partido             integer,
  sg_partido             text,
  partido_id             integer REFERENCES canon.partido (id),
  esfera                 char(1) CHECK (esfera IN ('N', 'F', 'M', 'Z')),
  uf_diretorio           text,
  municipio_diretorio    text,
  cnpj_diretorio         char(14),
  sq_prestador_diretorio bigint,
  fonte                  text NOT NULL CHECK (fonte IN ('fundo_especial', 'fundo_partidario', 'outros')),
  natureza               text,
  valor                  numeric(14, 2) NOT NULL,
  data                   date,
  tp_prestacao           text,
  dt_prestacao           date,
  vigente                boolean NOT NULL DEFAULT true,
  removido               boolean NOT NULL DEFAULT false,
  atualizado_em          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX repasse_candidato_idx ON canon.repasse (ano_eleicao, sq_candidato);
CREATE INDEX repasse_pessoa_idx ON canon.repasse (pessoa_id);
CREATE INDEX repasse_partido_idx ON canon.repasse (ano_eleicao, nr_partido, esfera, uf_diretorio);

-- Totais por candidato, diretório (esfera e UF) e fonte. Não soma esferas nem fontes.
CREATE VIEW canon.repasse_total AS
SELECT ano_eleicao, sq_candidato, pessoa_id, nr_partido, sg_partido, partido_id,
       esfera, uf_diretorio, fonte,
       count(*) AS repasses, sum(valor) AS valor, min(data) AS primeiro, max(data) AS ultimo
FROM canon.repasse
WHERE vigente AND NOT removido
GROUP BY ano_eleicao, sq_candidato, pessoa_id, nr_partido, sg_partido, partido_id,
         esfera, uf_diretorio, fonte;

GRANT SELECT ON canon.repasse_total TO vp_api_role, vp_admin_role;

-- migrate:down

DROP VIEW canon.repasse_total;
DROP TABLE canon.repasse;
