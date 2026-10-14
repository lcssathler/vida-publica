-- migrate:up

-- Usuário do app. Começa anônimo (só o aparelho conhece o refresh token) e pode
-- ser vinculado a um login Apple ou Google. Nenhum dado pessoal: nem e-mail,
-- nem nome, só o identificador opaco que o provedor dá para o app.
CREATE TABLE app.usuario (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- Login externo vinculado ao usuário. sujeito = claim "sub" do token do provedor.
CREATE TABLE app.identidade (
  provedor    text NOT NULL CHECK (provedor IN ('apple', 'google')),
  sujeito     text NOT NULL CHECK (length(sujeito) BETWEEN 1 AND 255),
  usuario_id  uuid NOT NULL REFERENCES app.usuario (id) ON DELETE CASCADE,
  vinculado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provedor, sujeito)
);

CREATE INDEX identidade_usuario_idx ON app.identidade (usuario_id);

-- Uma sessão por aparelho. Revogar a sessão invalida todos os refresh tokens dela.
CREATE TABLE app.sessao (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid NOT NULL REFERENCES app.usuario (id) ON DELETE CASCADE,
  plataforma  text CHECK (plataforma IN ('ios', 'android', 'web')),
  criada_em   timestamptz NOT NULL DEFAULT now(),
  usada_em    timestamptz NOT NULL DEFAULT now(),
  revogada_em timestamptz,
  motivo_revogacao text CHECK (motivo_revogacao IN ('saida', 'reuso', 'exclusao'))
);

CREATE INDEX sessao_usuario_idx ON app.sessao (usuario_id);

-- Refresh tokens rotativos: só o hash SHA-256 fica no banco. Cada um vale uma
-- vez; apresentar de novo um token já usado revoga a sessão inteira (sinal de
-- que ele vazou).
CREATE TABLE app.refresh_token (
  hash       char(64) PRIMARY KEY CHECK (hash ~ '^[0-9a-f]{64}$'),
  sessao_id  uuid NOT NULL REFERENCES app.sessao (id) ON DELETE CASCADE,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  expira_em  timestamptz NOT NULL,
  usado_em   timestamptz,
  CHECK (expira_em > criado_em)
);

CREATE INDEX refresh_token_sessao_idx ON app.refresh_token (sessao_id);

-- migrate:down

DROP TABLE app.refresh_token;
DROP TABLE app.sessao;
DROP TABLE app.identidade;
DROP TABLE app.usuario;
