-- migrate:up

-- O serviço de backup registra cada execução em raw.job_run; o vigia alerta
-- se o backup, o arquivamento de WAL ou o teste de restauração pararem.
INSERT INTO raw.fonte_prazo (job, prazo, descricao) VALUES
  ('backup', '26 hours', 'Backup do banco (pgBackRest): completo semanal, diferencial diário'),
  ('backup-wal', '2 hours', 'Arquivamento contínuo de WAL (restauração por ponto no tempo), conferido a cada hora'),
  ('backup-restauracao', '35 days', 'Teste de restauração num banco descartável, comparado com o original (mensal)');

-- migrate:down

DELETE FROM raw.fonte_prazo WHERE job IN ('backup', 'backup-wal', 'backup-restauracao');
