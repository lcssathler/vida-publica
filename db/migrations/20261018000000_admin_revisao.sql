-- migrate:up

-- Painel de revisão (Fase 8). O admin é outro processo da API (mesmo código,
-- só as rotas /admin), com o usuário de login vp_admin e o papel
-- vp_admin_role. Login próprio, separado das contas anônimas do app: e-mail,
-- senha e código de 2FA (TOTP). Nada daqui é visível à API do app, ao worker
-- ou ao notificador.
CREATE SCHEMA admin;
GRANT USAGE ON SCHEMA admin TO vp_admin_role;

-- Quem revisa. senha_hash: scrypt com sal (nunca a senha). totp_segredo:
-- segredo do 2FA cifrado com AES-256-GCM pela chave ADMIN_TOTP_CHAVE do
-- ambiente (o banco sozinho não basta para gerar códigos). totp_ultimo_passo:
-- o último código aceito não vale de novo. falhas e bloqueado_ate: depois de
-- 5 tentativas erradas seguidas, a conta espera 15 minutos.
CREATE TABLE admin.usuario (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text NOT NULL UNIQUE CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+$'),
  nome              text NOT NULL CHECK (length(nome) BETWEEN 1 AND 100),
  senha_hash        text NOT NULL CHECK (senha_hash ~ '^scrypt\$'),
  totp_segredo      text NOT NULL CHECK (totp_segredo ~ '^v1\.'),
  totp_ultimo_passo bigint NOT NULL DEFAULT 0,
  ativo             boolean NOT NULL DEFAULT true,
  falhas            smallint NOT NULL DEFAULT 0 CHECK (falhas >= 0),
  bloqueado_ate     timestamptz,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  ultimo_acesso_em  timestamptz
);

-- Sessão do painel: só o hash SHA-256 do token. Curta (horas), encerrada ao
-- sair e ao desativar a conta.
CREATE TABLE admin.sessao (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   uuid NOT NULL REFERENCES admin.usuario (id) ON DELETE CASCADE,
  token_hash   char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  ip           inet,
  criada_em    timestamptz NOT NULL DEFAULT now(),
  expira_em    timestamptz NOT NULL,
  encerrada_em timestamptz,
  CHECK (expira_em > criada_em)
);

CREATE INDEX sessao_usuario_idx ON admin.sessao (usuario_id) WHERE encerrada_em IS NULL;

-- Registro de tudo o que o painel muda: quem, quando, o quê. Só cresce (o
-- papel do admin insere e lê, não altera nem apaga).
CREATE TABLE admin.acao (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id uuid NOT NULL REFERENCES admin.usuario (id),
  acao       text NOT NULL CHECK (acao ~ '^[a-z][a-z_.]*$'),
  alvo_tipo  text NOT NULL,
  alvo_id    text NOT NULL,
  detalhe    jsonb NOT NULL DEFAULT '{}',
  criada_em  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX acao_criada_idx ON admin.acao (criada_em DESC);
CREATE INDEX acao_alvo_idx ON admin.acao (alvo_tipo, alvo_id);

GRANT SELECT, INSERT, UPDATE ON admin.usuario, admin.sessao TO vp_admin_role;
GRANT SELECT, INSERT ON admin.acao TO vp_admin_role;

-- Fila de casamentos: quem resolveu, quando, com qual pessoa e por quê.
ALTER TABLE canon.match_review
  ADD COLUMN pessoa_id     uuid REFERENCES canon.pessoa (id),
  ADD COLUMN resolvido_em  timestamptz,
  ADD COLUMN resolvido_por text,
  ADD COLUMN nota          text CHECK (length(nota) <= 1000);

-- Resolver um casamento: ligar o registro da fonte a uma pessoa (vínculo
-- 'manual', que o worker nunca sobrescreve) ou criar a pessoa quando ela não
-- existe; o worker preenche nome e data na próxima resolução.
GRANT INSERT ON canon.pessoa TO vp_admin_role;
GRANT INSERT, UPDATE ON canon.pessoa_vinculo TO vp_admin_role;

-- Errata pública: o que estava errado, o que foi feito e quando. Ligada ao
-- evento corrigido (opcional) e à pessoa casada errado (opcional). Não se
-- edita nem se apaga: uma correção da errata é outra errata. publicada_por:
-- id da conta do painel (o app não mostra quem publicou).
CREATE TABLE feed.errata (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id     uuid REFERENCES feed.evento (id),
  pessoa_id     uuid REFERENCES canon.pessoa (id),
  titulo        text NOT NULL CHECK (length(titulo) BETWEEN 5 AND 200),
  texto         text NOT NULL CHECK (length(texto) BETWEEN 10 AND 4000),
  publicada_em  timestamptz NOT NULL DEFAULT now(),
  publicada_por uuid NOT NULL
);

CREATE INDEX errata_publicada_idx ON feed.errata (publicada_em DESC, id DESC);
CREATE INDEX errata_evento_idx ON feed.errata (evento_id) WHERE evento_id IS NOT NULL;

-- A API do app lê as erratas (privilégio padrão do esquema feed); o worker
-- não escreve nelas; o admin publica.
REVOKE INSERT, UPDATE ON feed.errata FROM vp_ingest_role;
GRANT INSERT ON feed.errata TO vp_admin_role;
REVOKE UPDATE ON feed.errata FROM vp_admin_role;

-- "Reportar erro" no detalhe de cada evento do app. Um por conta e evento.
-- usuario_id só para isso e para sumir com a conta; o painel não o enxerga.
-- texto: o que a pessoa escreveu, com sequências parecidas com CPF trocadas
-- pela API antes de gravar.
CREATE TABLE app.reporte (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    uuid NOT NULL REFERENCES app.usuario (id) ON DELETE CASCADE,
  evento_id     uuid NOT NULL REFERENCES feed.evento (id),
  motivo        text NOT NULL CHECK (
    motivo IN ('fato_errado', 'pessoa_errada', 'valor_errado', 'fonte_quebrada', 'outro')),
  texto         text CHECK (length(texto) <= 1000),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'corrigido', 'descartado')),
  resolvido_em  timestamptz,
  resolvido_por uuid,
  errata_id     uuid REFERENCES feed.errata (id),
  UNIQUE (usuario_id, evento_id),
  CHECK ((status = 'aberto') = (resolvido_em IS NULL)),
  CHECK (status <> 'corrigido' OR errata_id IS NOT NULL)
);

CREATE INDEX reporte_aberto_idx ON app.reporte (criado_em) WHERE status = 'aberto';

-- O notificador não precisa dos reportes.
REVOKE ALL ON app.reporte FROM vp_notify_role;

-- Dados de usuários do app no painel: só o necessário. O admin deixa de ler o
-- esquema app (sessões, logins, aparelhos, o que cada um segue, avisos) e vê
-- dos reportes só o conteúdo, sem a conta; resolve um reporte mudando o status.
-- CPF nunca, também no painel: o admin deixa de ler os hashes do esquema ident.
REVOKE SELECT ON ALL TABLES IN SCHEMA app FROM vp_admin_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE SELECT ON TABLES FROM vp_admin_role;
GRANT SELECT (id, evento_id, motivo, texto, criado_em, status, resolvido_em, resolvido_por, errata_id)
  ON app.reporte TO vp_admin_role;
GRANT UPDATE (status, resolvido_em, resolvido_por, errata_id) ON app.reporte TO vp_admin_role;

REVOKE SELECT ON ALL TABLES IN SCHEMA ident FROM vp_admin_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA ident REVOKE SELECT ON TABLES FROM vp_admin_role;
REVOKE USAGE ON SCHEMA ident FROM vp_admin_role;

-- migrate:down

GRANT USAGE ON SCHEMA ident TO vp_admin_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA ident GRANT SELECT ON TABLES TO vp_admin_role;
GRANT SELECT ON ALL TABLES IN SCHEMA ident TO vp_admin_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT ON TABLES TO vp_admin_role;
DROP TABLE app.reporte;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO vp_admin_role;
DROP TABLE feed.errata;
REVOKE INSERT, UPDATE ON canon.pessoa_vinculo FROM vp_admin_role;
REVOKE INSERT ON canon.pessoa FROM vp_admin_role;
ALTER TABLE canon.match_review
  DROP COLUMN nota,
  DROP COLUMN resolvido_por,
  DROP COLUMN resolvido_em,
  DROP COLUMN pessoa_id;
DROP SCHEMA admin CASCADE;
