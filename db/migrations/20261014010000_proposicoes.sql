-- migrate:up

-- Proposições das duas casas num só lugar. id_fonte: Câmara = id da proposição;
-- Senado = id do processo. A mesma matéria pode aparecer uma vez por casa.
CREATE TABLE canon.proposicao (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casa                    text NOT NULL CHECK (casa IN ('camara', 'senado')),
  id_fonte                text NOT NULL,
  sigla_tipo              text NOT NULL,
  numero                  integer,
  ano                     integer,
  identificacao           text NOT NULL,
  descricao_tipo          text,
  ementa                  text,
  ementa_detalhada        text,
  keywords                text,
  apelido                 text,
  apresentada_em          date,
  autoria_resumo          text,
  situacao                text,
  situacao_em             date,
  sigla_orgao             text,
  regime                  text,
  despacho                text,
  tramitando              boolean,
  url_inteiro_teor        text,
  proposicao_principal_id_fonte text,
  codigo_materia          integer,
  casa_iniciadora         text,
  raw_object_id           uuid REFERENCES raw.raw_object (id),
  content_hash            char(64) NOT NULL,
  atualizado_em           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casa, id_fonte)
);

CREATE INDEX proposicao_identificacao_idx ON canon.proposicao (sigla_tipo, numero, ano);
CREATE INDEX proposicao_situacao_em_idx ON canon.proposicao (situacao_em DESC);

-- Tramitações (Câmara) e informes legislativos (Senado), na ordem da fonte.
-- id_fonte: Câmara = sequência; Senado = id do informe.
CREATE TABLE canon.proposicao_tramitacao (
  proposicao_id   uuid NOT NULL REFERENCES canon.proposicao (id) ON DELETE CASCADE,
  id_fonte        text NOT NULL,
  sequencia       integer NOT NULL,
  data_hora       timestamp NOT NULL,
  sigla_orgao     text,
  descricao       text NOT NULL,
  cod_tipo        text,
  situacao        text,
  cod_situacao    text,
  despacho        text,
  regime          text,
  relator_id_fonte text,
  url             text,
  PRIMARY KEY (proposicao_id, id_fonte)
);

CREATE INDEX proposicao_tramitacao_data_idx ON canon.proposicao_tramitacao (data_hora DESC);

-- Temas oficiais: Câmara (/temas) e Senado (classificações do processo).
CREATE TABLE canon.proposicao_tema (
  proposicao_id uuid NOT NULL REFERENCES canon.proposicao (id) ON DELETE CASCADE,
  cod_tema      integer,
  tema          text NOT NULL,
  relevancia    integer,
  PRIMARY KEY (proposicao_id, tema)
);

-- Autores, na ordem de assinatura. id_fonte: id do deputado ou código do senador.
CREATE TABLE canon.proposicao_autor (
  proposicao_id uuid NOT NULL REFERENCES canon.proposicao (id) ON DELETE CASCADE,
  ordem         integer NOT NULL,
  nome          text NOT NULL,
  tipo          text,
  id_fonte      text,
  proponente    boolean,
  PRIMARY KEY (proposicao_id, ordem)
);

CREATE INDEX proposicao_autor_fonte_idx ON canon.proposicao_autor (tipo, id_fonte);

-- Temas e autores são substituídos em bloco; tramitações só crescem.
GRANT DELETE ON canon.proposicao_tema, canon.proposicao_autor TO vp_ingest_role;

-- migrate:down

DROP TABLE canon.proposicao_autor;
DROP TABLE canon.proposicao_tema;
DROP TABLE canon.proposicao_tramitacao;
DROP TABLE canon.proposicao;
