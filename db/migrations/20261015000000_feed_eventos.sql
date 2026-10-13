-- migrate:up

-- Regras que geram eventos, versionadas. Uma regra publicada nunca muda: mudar
-- a lógica ou um parâmetro (180 dias, R$ 500 mil...) exige uma versão nova, e
-- cada evento guarda a versão que o gerou, para reproduzir e auditar.
CREATE TABLE feed.regra (
  tipo       text NOT NULL CHECK (tipo ~ '^[a-z][a-z0-9_]*$'),
  versao     smallint NOT NULL CHECK (versao > 0),
  descricao  text NOT NULL,
  parametros jsonb NOT NULL DEFAULT '{}',
  criada_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tipo, versao)
);

-- Uma tabela para todos os tipos de evento. O que é específico de cada tipo
-- (números, ids, votos) fica em payload; o que o feed filtra e ordena é coluna.
-- chave_fato: ids da fonte que identificam o fato; chave_dedup = tipo, versão da
-- regra e chave_fato, única: rodar o motor de novo nunca duplica um evento.
-- status: segurado (aguarda revisão: carga inicial ou dinheiro acima do limite),
-- publicado, arquivado (a fonte removeu o fato ou uma versão nova da regra o
-- substituiu). visibilidade = 'seguidores': só aparece para quem segue um alvo.
CREATE TABLE feed.evento (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo          text NOT NULL,
  regra_versao  smallint NOT NULL,
  chave_fato    text NOT NULL,
  chave_dedup   text NOT NULL UNIQUE,
  ocorrido_em   timestamptz NOT NULL,
  coletado_em   timestamptz NOT NULL DEFAULT now(),
  fonte_url     text,
  fonte_dado_em timestamptz,
  titulo        text NOT NULL,
  resumo        text,
  payload       jsonb NOT NULL DEFAULT '{}',
  valor         numeric(16, 2),
  visibilidade  text NOT NULL DEFAULT 'geral' CHECK (visibilidade IN ('geral', 'seguidores')),
  status        text NOT NULL CHECK (status IN ('segurado', 'publicado', 'arquivado')),
  motivo        text CHECK (
    motivo IN ('carga_inicial', 'revisao_valor', 'fonte_removeu', 'regra_substituida', 'admin')
  ),
  publicado_em  timestamptz,
  revisado_em   timestamptz,
  revisado_por  text,
  content_hash  char(64) NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tipo, regra_versao) REFERENCES feed.regra (tipo, versao),
  CHECK (chave_dedup = tipo || ':v' || regra_versao || ':' || chave_fato),
  CHECK (status <> 'publicado' OR (publicado_em IS NOT NULL AND motivo IS NULL)),
  CHECK (status = 'publicado' OR motivo IS NOT NULL)
);

CREATE INDEX evento_feed_idx ON feed.evento (ocorrido_em DESC) WHERE status = 'publicado';
CREATE INDEX evento_status_idx ON feed.evento (status, motivo);
CREATE INDEX evento_fato_idx ON feed.evento (tipo, chave_fato);

-- Quem ou o que o evento envolve: base de "seguir" e dos filtros sem varrer o
-- payload. pessoa = canon.pessoa.id, partido = canon.partido.id, proposicao =
-- canon.proposicao.id, assunto = tema oficial. papel: votante, autor, relator...
CREATE TABLE feed.evento_alvo (
  evento_id uuid NOT NULL REFERENCES feed.evento (id) ON DELETE CASCADE,
  alvo_tipo text NOT NULL CHECK (alvo_tipo IN ('pessoa', 'partido', 'proposicao', 'assunto')),
  alvo_id   text NOT NULL,
  papel     text NOT NULL DEFAULT '',
  PRIMARY KEY (evento_id, alvo_tipo, alvo_id, papel)
);

CREATE INDEX evento_alvo_alvo_idx ON feed.evento_alvo (alvo_tipo, alvo_id);

-- Alvos são substituídos em bloco quando o evento muda.
GRANT DELETE ON feed.evento_alvo TO vp_ingest_role;

-- migrate:down

DROP TABLE feed.evento_alvo;
DROP TABLE feed.evento;
DROP TABLE feed.regra;
