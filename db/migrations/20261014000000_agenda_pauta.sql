-- migrate:up

-- Eventos da Câmara (sessões do Plenário, reuniões de comissão, audiências...).
-- deliberativo = true quando a pauta é coletada (sessões e reuniões deliberativas).
CREATE TABLE canon.camara_evento (
  id            integer PRIMARY KEY,
  inicio        timestamp NOT NULL,
  fim           timestamp,
  situacao      text,
  tipo          text,
  descricao     text,
  local_externo text,
  local_camara  text,
  url_registro  text,
  id_orgao      integer,
  sigla_orgao   text,
  deliberativo  boolean NOT NULL DEFAULT false,
  raw_object_id uuid REFERENCES raw.raw_object (id),
  content_hash  char(64) NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX camara_evento_inicio_idx ON canon.camara_evento (inicio DESC);

CREATE TABLE canon.camara_evento_orgao (
  id_evento integer NOT NULL REFERENCES canon.camara_evento (id) ON DELETE CASCADE,
  id_orgao  integer NOT NULL,
  sigla     text,
  nome      text,
  PRIMARY KEY (id_evento, id_orgao)
);

-- Itens de pauta de um evento, na ordem publicada pela Câmara.
CREATE TABLE canon.camara_pauta_item (
  id_evento                 integer NOT NULL REFERENCES canon.camara_evento (id) ON DELETE CASCADE,
  posicao                   integer NOT NULL,
  ordem                     integer,
  topico                    text,
  regime                    text,
  cod_regime                integer,
  titulo                    text,
  proposicao_id             integer,
  proposicao_sigla_tipo     text,
  proposicao_numero         integer,
  proposicao_ano            integer,
  proposicao_ementa         text,
  proposicao_relacionada_id integer,
  relator_id                integer,
  relator_nome              text,
  texto_parecer             text,
  situacao_item             text,
  votacao_id                text,
  PRIMARY KEY (id_evento, posicao)
);

CREATE INDEX camara_pauta_item_proposicao_idx ON canon.camara_pauta_item (proposicao_id);
CREATE INDEX camara_pauta_item_relacionada_idx
  ON canon.camara_pauta_item (proposicao_relacionada_id);

-- Sessões do Plenário do Senado e do Congresso (agenda, inclusive futura).
CREATE TABLE canon.senado_sessao (
  codigo            integer PRIMARY KEY,
  data              date NOT NULL,
  hora              text,
  numero            text,
  tipo              text,
  local             text,
  casa              text,
  legislatura       integer,
  sessao_legislativa integer,
  cod_situacao      integer,
  situacao          text,
  realizada         boolean,
  pauta_confirmada  boolean,
  tipo_presenca     text,
  comunicado        text,
  raw_object_id     uuid REFERENCES raw.raw_object (id),
  content_hash      char(64) NOT NULL,
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX senado_sessao_data_idx ON canon.senado_sessao (data DESC);

-- Matérias na pauta de cada sessão do Plenário.
CREATE TABLE canon.senado_pauta_item (
  codigo_sessao          integer NOT NULL REFERENCES canon.senado_sessao (codigo) ON DELETE CASCADE,
  posicao                integer NOT NULL,
  codigo_materia         integer,
  identificacao          text,
  sigla                  text,
  numero                 text,
  ano                    integer,
  descricao_identificacao text,
  objetivo               text,
  casa_iniciadora        text,
  ementa                 text,
  parecer                text,
  apreciacao             text,
  autor                  text,
  tipo_pauta             text,
  descricao_tipo_pauta   text,
  sequencia_ordem        integer,
  PRIMARY KEY (codigo_sessao, posicao)
);

CREATE INDEX senado_pauta_item_materia_idx ON canon.senado_pauta_item (codigo_materia);

-- Reuniões das comissões do Senado e do Congresso.
CREATE TABLE canon.senado_reuniao (
  codigo           integer PRIMARY KEY,
  titulo           text,
  descricao        text,
  inicio           timestamp NOT NULL,
  codigo_colegiado integer,
  sigla_colegiado  text,
  nome_colegiado   text,
  tipo             text,
  cod_situacao     integer,
  situacao         text,
  realizada        boolean,
  local            text,
  tipo_presenca    text,
  secreta          boolean,
  url_pauta        text,
  url_resultado    text,
  raw_object_id    uuid REFERENCES raw.raw_object (id),
  content_hash     char(64) NOT NULL,
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX senado_reuniao_inicio_idx ON canon.senado_reuniao (inicio DESC);

-- Itens de cada parte da reunião (matérias, requerimentos, audiências).
CREATE TABLE canon.senado_reuniao_item (
  codigo_reuniao integer NOT NULL REFERENCES canon.senado_reuniao (codigo) ON DELETE CASCADE,
  posicao        integer NOT NULL,
  parte          integer,
  parte_nome     text,
  deliberativa   boolean NOT NULL DEFAULT false,
  codigo_item    integer,
  ordem          integer,
  tipo           text,
  nome           text,
  descricao      text,
  id_processo    bigint,
  codigo_materia integer,
  identificacao  text,
  sigla          text,
  numero         text,
  ano            integer,
  ementa         text,
  autoria        text,
  relatorio      text,
  resultado      text,
  resultado_texto text,
  relator_codigo integer,
  relator_nome   text,
  relator_casa   text,
  PRIMARY KEY (codigo_reuniao, posicao)
);

CREATE INDEX senado_reuniao_item_processo_idx ON canon.senado_reuniao_item (id_processo);

-- Filhos substituídos em bloco quando o pai muda.
GRANT DELETE ON canon.camara_evento_orgao, canon.camara_pauta_item, canon.senado_pauta_item,
  canon.senado_reuniao_item TO vp_ingest_role;

-- migrate:down

DROP TABLE canon.senado_reuniao_item;
DROP TABLE canon.senado_reuniao;
DROP TABLE canon.senado_pauta_item;
DROP TABLE canon.senado_sessao;
DROP TABLE canon.camara_pauta_item;
DROP TABLE canon.camara_evento_orgao;
DROP TABLE canon.camara_evento;
