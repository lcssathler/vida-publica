-- migrate:up

-- Notificações (Fase 7). O notificador é um processo separado da API, com o
-- próprio papel: lê os eventos publicados e quem segue o quê, e grava só a
-- fila de avisos. O usuário de login (vp_notify) é criado pela infraestrutura
-- (infra/postgres/init) e recebe este papel; aqui só garantimos que exista.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vp_notify_role') THEN
    CREATE ROLE vp_notify_role NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA feed, app TO vp_notify_role;

-- Aparelho que recebe avisos: um por sessão (cada aparelho tem a sua). Só o
-- token de envio do FCM e a plataforma. Some ao sair (a API apaga), ao excluir
-- a conta (cascata) e quando o FCM diz que o token não vale mais (o notificador
-- apaga). Login numa conta existente leva a sessão, e o aparelho vai junto.
CREATE TABLE app.dispositivo (
  sessao_id     uuid PRIMARY KEY REFERENCES app.sessao (id) ON DELETE CASCADE,
  token         text NOT NULL UNIQUE
    CHECK (token ~ '^[A-Za-z0-9_:.-]+$' AND length(token) BETWEEN 32 AND 4096),
  plataforma    text NOT NULL CHECK (plataforma IN ('android', 'ios')),
  registrado_em timestamptz NOT NULL DEFAULT now()
);

-- Fila de avisos: no máximo um por usuário e evento, então rodar o notificador
-- de novo nunca reenvia. evento_id = feed.evento.id (sem chave estrangeira:
-- outro dono, outro ciclo de vida; eventos não são apagados, só arquivados).
-- status:
--   pendente   espera a vez (enviar_apos); motivo 'silencio' quando caiu no
--              horário de silêncio, 'erro_envio' quando o FCM falhou e vai
--              tentar de novo;
--   enviada    chegou a pelo menos um aparelho (conta no teto do dia);
--   resumo     passou do teto diário: entra no resumo semanal;
--   descartada não vai ser enviada (avisos desligados, sem aparelho, deixou de
--              seguir, evento despublicado, texto recusado);
--   falhou     o FCM falhou em todas as tentativas.
-- titulo e corpo: o texto exatamente como foi enviado.
CREATE TABLE app.notificacao (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id   uuid NOT NULL REFERENCES app.usuario (id) ON DELETE CASCADE,
  evento_id    uuid NOT NULL,
  tipo         text NOT NULL,
  status       text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'enviada', 'resumo', 'descartada', 'falhou')),
  motivo       text CHECK (motivo IN (
    'silencio', 'erro_envio', 'teto', 'desligada', 'sem_dispositivo', 'nao_segue',
    'despublicado', 'texto')),
  criada_em    timestamptz NOT NULL DEFAULT now(),
  enviar_apos  timestamptz NOT NULL DEFAULT now(),
  tentativas   smallint NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  enviada_em   timestamptz,
  dispositivos smallint CHECK (dispositivos > 0),
  titulo       text,
  corpo        text,
  atualizada_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, evento_id),
  CHECK ((status = 'enviada') = (enviada_em IS NOT NULL)),
  CHECK (status <> 'enviada' OR (titulo IS NOT NULL AND corpo IS NOT NULL
                                 AND dispositivos IS NOT NULL)),
  CHECK (status = 'enviada' OR motivo IS NOT NULL OR status = 'pendente')
);

CREATE INDEX notificacao_pendente_idx ON app.notificacao (enviar_apos, usuario_id)
  WHERE status = 'pendente';
CREATE INDEX notificacao_enviada_idx ON app.notificacao (usuario_id, enviada_em)
  WHERE status = 'enviada';

-- Até onde o notificador já leu os eventos publicados (feed.evento.publicado_em).
-- A primeira execução só marca o instante (iniciado_em): a carga inicial e o
-- que já estava publicado antes nunca geram aviso, nem pela releitura.
CREATE TABLE app.notificacao_cursor (
  nome          text PRIMARY KEY CHECK (nome = 'eventos'),
  iniciado_em   timestamptz NOT NULL,
  publicado_ate timestamptz NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (publicado_ate >= iniciado_em)
);

-- Eventos recém-publicados, em ordem de publicação.
CREATE INDEX evento_publicado_idx ON feed.evento (publicado_em) WHERE status = 'publicado';

-- A API registra e apaga o aparelho da própria sessão (privilégios padrão do
-- esquema app) e não toca na fila.
REVOKE ALL ON app.notificacao, app.notificacao_cursor FROM vp_api_role;

-- O notificador lê eventos publicados, seus alvos, quem segue o quê e as
-- preferências; das sessões, só o necessário para saber se o aparelho ainda
-- vale; apaga tokens inválidos; escreve a fila e o cursor. Não lê canon, raw,
-- ident nem logins e refresh tokens.
GRANT SELECT ON feed.evento, feed.evento_alvo TO vp_notify_role;
GRANT SELECT ON app.seguindo, app.preferencias TO vp_notify_role;
GRANT SELECT (id, usuario_id, revogada_em) ON app.sessao TO vp_notify_role;
GRANT SELECT, DELETE ON app.dispositivo TO vp_notify_role;
GRANT SELECT, INSERT, UPDATE ON app.notificacao, app.notificacao_cursor TO vp_notify_role;

-- migrate:down

DROP INDEX feed.evento_publicado_idx;
DROP TABLE app.notificacao_cursor;
DROP TABLE app.notificacao;
DROP TABLE app.dispositivo;
REVOKE USAGE ON SCHEMA feed, app FROM vp_notify_role;
