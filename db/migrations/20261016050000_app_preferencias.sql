-- migrate:up

-- Preferências do usuário. Linha criada na primeira alteração; sem linha, a
-- API usa os padrões abaixo. Horário de silêncio e teto diário valem para as
-- notificações (Fase 7). uf: estado escolhido no onboarding (o CEP é
-- convertido no aparelho e nunca chega aqui).
CREATE TABLE app.preferencias (
  usuario_id        uuid PRIMARY KEY REFERENCES app.usuario (id) ON DELETE CASCADE,
  uf                char(2) CHECK (uf IN (
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
    'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO')),
  notificacoes      boolean NOT NULL DEFAULT true,
  resumo_semanal    boolean NOT NULL DEFAULT true,
  max_por_dia       smallint NOT NULL DEFAULT 5 CHECK (max_por_dia BETWEEN 1 AND 20),
  silencio_inicio   time NOT NULL DEFAULT '22:00',
  silencio_fim      time NOT NULL DEFAULT '07:00',
  fuso              text NOT NULL DEFAULT 'America/Sao_Paulo' CHECK (fuso IN (
    'America/Noronha', 'America/Sao_Paulo', 'America/Bahia', 'America/Fortaleza',
    'America/Recife', 'America/Maceio', 'America/Belem', 'America/Araguaina',
    'America/Manaus', 'America/Cuiaba', 'America/Campo_Grande', 'America/Porto_Velho',
    'America/Boa_Vista', 'America/Rio_Branco', 'America/Eirunepe', 'America/Santarem')),
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

-- migrate:down

DROP TABLE app.preferencias;
