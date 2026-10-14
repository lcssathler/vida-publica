-- migrate:up

-- Resumo semanal (Fase 7): uma vez por semana, um aviso com o dinheiro e as
-- despesas de quem a pessoa segue (despesa_mensal, repasse, doacao,
-- fundo_recebido) publicados na semana, mais os avisos que passaram do teto
-- diário. Um por usuário e semana (chave primária): rodar de novo não reenvia.
-- semana: a segunda-feira da semana resumida, no fuso do usuário.
-- status:
--   pendente   espera a vez (enviar_apos); motivo 'silencio' ou 'erro_envio';
--   enviado    chegou a pelo menos um aparelho;
--   vazio      nada para resumir: não manda aviso;
--   descartado resumo ou avisos desligados, sem aparelho, texto recusado;
--   falhou     o FCM falhou em todas as tentativas.
-- conteudo: contagens e totais por tipo (nunca nomes: doador pessoa física
-- não aparece nem no feed) e quantos avisos passaram do teto. titulo, corpo e
-- url: o texto do aviso e o link que abre o feed no app.
CREATE TABLE app.resumo_semanal (
  usuario_id    uuid NOT NULL REFERENCES app.usuario (id) ON DELETE CASCADE,
  semana        date NOT NULL CHECK (extract(isodow FROM semana) = 1),
  status        text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'enviado', 'vazio', 'descartado', 'falhou')),
  motivo        text CHECK (motivo IN (
    'silencio', 'erro_envio', 'desligado', 'sem_dispositivo', 'texto')),
  conteudo      jsonb NOT NULL DEFAULT '{}',
  titulo        text,
  corpo         text,
  url           text CHECK (url LIKE 'vidapublica://%'),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  enviar_apos   timestamptz NOT NULL DEFAULT now(),
  tentativas    smallint NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  enviado_em    timestamptz,
  dispositivos  smallint CHECK (dispositivos > 0),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, semana),
  CHECK ((status = 'enviado') = (enviado_em IS NOT NULL)),
  CHECK (status <> 'enviado' OR dispositivos IS NOT NULL),
  CHECK (status NOT IN ('pendente', 'enviado')
         OR (titulo IS NOT NULL AND corpo IS NOT NULL AND url IS NOT NULL))
);

CREATE INDEX resumo_semanal_pendente_idx ON app.resumo_semanal (enviar_apos, usuario_id)
  WHERE status = 'pendente';

-- Só o notificador lê e escreve o resumo; a API não enxerga.
REVOKE ALL ON app.resumo_semanal FROM vp_api_role;
GRANT SELECT, INSERT, UPDATE ON app.resumo_semanal TO vp_notify_role;

-- migrate:down

DROP TABLE app.resumo_semanal;
