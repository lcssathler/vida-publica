-- migrate:up

-- Votações da Câmara (Plenário e comissões). O id é o da Câmara ("2611313-34").
-- nominal = true quando a Câmara publicou votos individuais.
CREATE TABLE canon.camara_votacao (
  id                      text PRIMARY KEY,
  data                    date NOT NULL,
  registrado_em           timestamp NOT NULL,
  id_orgao                integer,
  sigla_orgao             text,
  id_evento               integer,
  descricao               text,
  aprovacao               boolean,
  abertura_descricao      text,
  abertura_em             timestamp,
  proposicao_principal_id integer,
  nominal                 boolean NOT NULL DEFAULT false,
  raw_object_id           uuid REFERENCES raw.raw_object (id),
  content_hash            char(64) NOT NULL,
  atualizado_em           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX camara_votacao_data_idx ON canon.camara_votacao (data DESC);
CREATE INDEX camara_votacao_proposicao_idx ON canon.camara_votacao (proposicao_principal_id);

-- Proposições ligadas à votação: as afetadas (objeto da deliberação) e as
-- possíveis (pareceres, destaques, emendas e requerimentos citados).
CREATE TABLE canon.camara_votacao_proposicao (
  votacao_id    text NOT NULL REFERENCES canon.camara_votacao (id) ON DELETE CASCADE,
  proposicao_id integer NOT NULL,
  papel         text NOT NULL CHECK (papel IN ('afetada', 'objeto')),
  sigla_tipo    text,
  numero        integer,
  ano           integer,
  ementa        text,
  PRIMARY KEY (votacao_id, proposicao_id, papel)
);

CREATE INDEX camara_votacao_proposicao_prop_idx
  ON canon.camara_votacao_proposicao (proposicao_id);

-- Voto de cada deputado numa votação nominal. Sem FK para canon.camara_deputado:
-- votações antigas citam deputados de outras legislaturas ainda não coletadas.
CREATE TABLE canon.camara_voto (
  votacao_id    text NOT NULL REFERENCES canon.camara_votacao (id) ON DELETE CASCADE,
  id_camara     integer NOT NULL,
  voto          text NOT NULL,
  sigla_partido text,
  sigla_uf      char(2),
  registrado_em timestamp,
  PRIMARY KEY (votacao_id, id_camara)
);

CREATE INDEX camara_voto_deputado_idx ON canon.camara_voto (id_camara);

-- Orientação de cada bancada (partido, bloco, federação, governo, maioria).
CREATE TABLE canon.camara_orientacao (
  votacao_id         text NOT NULL REFERENCES canon.camara_votacao (id) ON DELETE CASCADE,
  sigla_bancada      text NOT NULL,
  orientacao         text NOT NULL,
  cod_tipo_lideranca text,
  cod_partido_bloco  integer,
  PRIMARY KEY (votacao_id, sigla_bancada)
);

-- Votos, orientações e proposições são substituídos em bloco quando a votação
-- muda; por isso o worker pode apagá-los (as demais tabelas seguem sem DELETE).
GRANT DELETE ON canon.camara_voto, canon.camara_orientacao, canon.camara_votacao_proposicao
  TO vp_ingest_role;

-- migrate:down

DROP TABLE canon.camara_orientacao;
DROP TABLE canon.camara_voto;
DROP TABLE canon.camara_votacao_proposicao;
DROP TABLE canon.camara_votacao;
