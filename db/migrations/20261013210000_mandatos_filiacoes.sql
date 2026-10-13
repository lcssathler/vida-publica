-- migrate:up

CREATE TABLE canon.legislatura (
  id     integer PRIMARY KEY,
  inicio date NOT NULL,
  fim    date NOT NULL,
  CHECK (fim > inicio)
);

-- Eventos do histórico de cada deputado na Câmara (posse, saída, licença,
-- troca de partido). Linhas sem situação são marcadores internos e ficam de fora.
CREATE TABLE canon.camara_historico (
  id_camara          integer NOT NULL REFERENCES canon.camara_deputado (id_camara),
  data_hora          timestamp NOT NULL,
  id_legislatura     integer NOT NULL,
  sigla_partido      text,
  sigla_uf           char(2),
  situacao           text NOT NULL,
  condicao_eleitoral text,
  descricao_status   text NOT NULL,
  PRIMARY KEY (id_camara, data_hora, id_legislatura, descricao_status)
);

-- Mandato por pessoa, casa e legislatura.
CREATE TABLE canon.mandato (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id      uuid NOT NULL REFERENCES canon.pessoa (id),
  casa           text NOT NULL CHECK (casa IN ('camara', 'senado')),
  cargo          text NOT NULL,
  uf             char(2),
  id_legislatura integer NOT NULL REFERENCES canon.legislatura (id),
  condicao       text NOT NULL,
  inicio         date,
  fim            date,
  em_exercicio   boolean NOT NULL DEFAULT false,
  fonte_id       text NOT NULL,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casa, fonte_id, id_legislatura, condicao)
);

CREATE INDEX mandato_pessoa_idx ON canon.mandato (pessoa_id);

-- Períodos de filiação com datas, a partir do histórico das casas.
-- O partido em cada eleição está em canon.candidatura_partido.
CREATE TABLE canon.filiacao (
  pessoa_id     uuid NOT NULL REFERENCES canon.pessoa (id),
  sigla         text NOT NULL,
  partido_id    integer REFERENCES canon.partido (id),
  desde         date NOT NULL,
  ate           date,
  fonte         text NOT NULL CHECK (fonte IN ('camara', 'senado')),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pessoa_id, fonte, desde),
  CHECK (ate IS NULL OR ate >= desde)
);

-- Partido de cada candidatura, ligado a canon.partido pelo número e pela sigla.
CREATE VIEW canon.candidatura_partido AS
SELECT v.pessoa_id, c.ano_eleicao, c.sq_candidato, c.nr_turno, c.ds_cargo, c.sg_uf,
       c.dt_eleicao, c.sg_partido, p.id AS partido_id
FROM canon.tse_candidatura c
JOIN canon.pessoa_vinculo v ON v.fonte = 'tse' AND v.id_fonte = c.ano_eleicao || ':' || c.sq_candidato
LEFT JOIN canon.partido p
  ON p.numero_tse = c.nr_partido
 AND p.sigla_normalizada = upper(replace(translate(c.sg_partido,
       'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOOUCaaaaeeiooouc'), ' ', ''));

GRANT SELECT ON canon.candidatura_partido TO vp_api_role, vp_admin_role;

-- migrate:down

DROP VIEW canon.candidatura_partido;
DROP TABLE canon.filiacao;
DROP TABLE canon.mandato;
DROP TABLE canon.camara_historico;
DROP TABLE canon.legislatura;
