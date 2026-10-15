-- migrate:up

-- Prazo máximo sem coleta bem-sucedida de cada job (raw.job_run). Estourou, o
-- vigia do worker (vp-ingest vigiar) abre um alerta. Os prazos saem da
-- frequência de coleta de cada fonte, com folga para uma ou duas falhas
-- seguidas; mudar um prazo é uma migração nova (fica auditável). ativo = false
-- desliga o alerta de um job que não roda de propósito.
CREATE TABLE raw.fonte_prazo (
  job       text PRIMARY KEY CHECK (job ~ '^[a-z0-9][a-z0-9_-]*$'),
  prazo     interval NOT NULL CHECK (prazo > interval '0'),
  descricao text NOT NULL,
  ativo     boolean NOT NULL DEFAULT true
);

INSERT INTO raw.fonte_prazo (job, prazo, descricao) VALUES
  ('camara-votacoes', '6 hours', 'Votações e votos da Câmara (coleta a cada 10 min em dia de sessão, 1 h fora)'),
  ('senado-votacoes', '6 hours', 'Votações e votos do Senado (coleta a cada 10 min em dia de sessão, 1 h fora)'),
  ('camara-eventos', '3 hours', 'Agenda e pauta da Câmara (coleta a cada 30 min)'),
  ('senado-agenda', '3 hours', 'Agenda e pauta do Senado (coleta a cada 30 min)'),
  ('proposicoes', '6 hours', 'Proposições e tramitações (coleta a cada 1 h)'),
  ('camara-presenca', '48 hours', 'Presença na Câmara (diária)'),
  ('camara-deputados', '36 hours', 'Deputados (diária)'),
  ('senado-senadores', '36 hours', 'Senadores (diária)'),
  ('cota-camara', '48 hours', 'Cota parlamentar da Câmara (diária, após a regeração do arquivo)'),
  ('ceaps-senado', '48 hours', 'CEAPS do Senado (diária)'),
  ('tse-candidaturas', '24 hours', 'Candidaturas do TSE (a cada 6 h, só baixa se o arquivo mudou)'),
  ('tse-contas-candidatos', '24 hours', 'Prestação de contas de candidatos (a cada 6 h)'),
  ('tse-contas-partidos', '24 hours', 'Prestação de contas de partidos (a cada 6 h)'),
  ('repasses', '24 hours', 'Repasses partido → candidato (depois das contas do TSE)'),
  ('resolver-pessoas', '36 hours', 'Resolução de pessoas entre fontes (diária)'),
  ('mandatos-filiacoes', '36 hours', 'Mandatos e filiações (diária)'),
  ('partidos', '8 days', 'Partidos (semanal)'),
  ('camara-historico', '8 days', 'Histórico de legislaturas da Câmara (semanal)');

-- Motor de eventos: cada tipo é um job (eventos-<tipo>), rodado depois das coletas.
INSERT INTO raw.fonte_prazo (job, prazo, descricao)
SELECT 'eventos-' || tipo, '2 hours', 'Motor de eventos: ' || tipo
FROM (VALUES ('voto_nominal'), ('voto_contra_orientacao'), ('pauta'), ('tramitacao'),
             ('mudanca_regime'), ('proposta_parada'), ('presenca'), ('ausencia'),
             ('despesa_mensal'), ('fundo_recebido'), ('repasse'), ('doacao'),
             ('troca_partido'), ('situacao_candidatura'), ('resultado')) AS t (tipo);

-- Alertas abertos e resolvidos. Um aberto por chave (fonte:<job>), que fecha
-- sozinho quando a coleta volta. aviso_em: último aviso enviado (o vigia
-- repete o aviso de um alerta aberto a cada 24 h, não a cada volta).
CREATE TABLE raw.alerta (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chave        text NOT NULL,
  aberto_em    timestamptz NOT NULL DEFAULT now(),
  resolvido_em timestamptz,
  aviso_em     timestamptz NOT NULL DEFAULT now(),
  detalhe      jsonb NOT NULL DEFAULT '{}',
  CHECK (resolvido_em IS NULL OR resolvido_em >= aberto_em)
);

CREATE UNIQUE INDEX alerta_aberto_idx ON raw.alerta (chave) WHERE resolvido_em IS NULL;
CREATE INDEX alerta_aberto_em_idx ON raw.alerta (aberto_em DESC);

-- Último job bem-sucedido por nome, sem varrer o histórico inteiro.
CREATE INDEX job_run_sucesso_idx ON raw.job_run (job, finished_at DESC) WHERE status = 'succeeded';

-- O worker lê os prazos e grava os alertas (privilégios padrão de raw); o
-- admin lê os dois (privilégio padrão), para a tela de saúde das fontes.

-- migrate:down

DROP INDEX raw.job_run_sucesso_idx;
DROP TABLE raw.alerta;
DROP TABLE raw.fonte_prazo;
