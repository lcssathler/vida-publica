-- migrate:up

-- Votações nominais do Plenário do Senado e do Congresso, como o Senado as publica.
-- Em votação secreta os votos vêm como "Votou", sem o teor.
CREATE TABLE canon.senado_votacao (
  codigo_sessao_votacao     integer PRIMARY KEY,
  sequencial_votacao        integer,
  codigo_sessao             integer NOT NULL,
  numero_sessao             integer,
  sigla_tipo_sessao         text,
  casa_sessao               text,
  data_sessao               date NOT NULL,
  codigo_sessao_legislativa integer,
  id_processo               bigint,
  codigo_materia            integer,
  identificacao             text,
  sigla                     text,
  numero                    text,
  ano                       integer,
  ementa                    text,
  descricao                 text,
  resultado                 text,
  secreta                   boolean NOT NULL DEFAULT false,
  total_sim                 integer,
  total_nao                 integer,
  total_abstencao           integer,
  informe_id                bigint,
  informe_texto             text,
  raw_object_id             uuid REFERENCES raw.raw_object (id),
  content_hash              char(64) NOT NULL,
  atualizado_em             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX senado_votacao_data_idx ON canon.senado_votacao (data_sessao DESC);
CREATE INDEX senado_votacao_processo_idx ON canon.senado_votacao (id_processo);

-- Voto (ou motivo da ausência) de cada senador. sigla_voto: Sim, Não, Abstenção,
-- Votou (secreta), P-NRV (presente, não votou), AP, LS, MIS, NCom...; a descrição
-- traz o motivo por extenso quando há um.
CREATE TABLE canon.senado_voto (
  codigo_sessao_votacao integer NOT NULL
                        REFERENCES canon.senado_votacao (codigo_sessao_votacao) ON DELETE CASCADE,
  codigo_parlamentar    integer NOT NULL,
  sigla_voto            text NOT NULL,
  descricao_voto        text,
  sigla_partido         text,
  uf                    char(2),
  PRIMARY KEY (codigo_sessao_votacao, codigo_parlamentar)
);

CREATE INDEX senado_voto_parlamentar_idx ON canon.senado_voto (codigo_parlamentar);

-- Votos são substituídos em bloco quando a votação muda.
GRANT DELETE ON canon.senado_voto TO vp_ingest_role;

-- migrate:down

DROP TABLE canon.senado_voto;
DROP TABLE canon.senado_votacao;
