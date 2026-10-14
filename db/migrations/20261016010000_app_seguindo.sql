-- migrate:up

-- O que cada usuário segue. Os alvos são os mesmos de feed.evento_alvo:
-- pessoa = canon.pessoa.id, partido = canon.partido.id, proposicao =
-- canon.proposicao.id, assunto = nome do tema oficial. Não há chave
-- estrangeira para canon (outro dono, outro ciclo de vida): a API confere que
-- o alvo existe antes de gravar.
CREATE TABLE app.seguindo (
  usuario_id uuid NOT NULL REFERENCES app.usuario (id) ON DELETE CASCADE,
  alvo_tipo  text NOT NULL CHECK (alvo_tipo IN ('pessoa', 'partido', 'proposicao', 'assunto')),
  alvo_id    text NOT NULL CHECK (length(alvo_id) BETWEEN 1 AND 200),
  criado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, alvo_tipo, alvo_id)
);

-- Quem segue um alvo (notificações, Fase 7).
CREATE INDEX seguindo_alvo_idx ON app.seguindo (alvo_tipo, alvo_id);

-- migrate:down

DROP TABLE app.seguindo;
