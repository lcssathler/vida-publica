-- migrate:up

-- Presença de deputados em eventos da Câmara (sessões e reuniões deliberativas),
-- pela API /eventos/{id}/deputados. Só registra quem esteve presente.
CREATE TABLE canon.camara_presenca (
  id_evento     integer NOT NULL REFERENCES canon.camara_evento (id) ON DELETE CASCADE,
  id_camara     integer NOT NULL,
  registrado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id_evento, id_camara)
);

CREATE INDEX camara_presenca_deputado_idx ON canon.camara_presenca (id_camara);

-- Frequência diária no Plenário pelo serviço legado (SitCamaraWS), com a
-- justificativa de ausência. Coletado só com VP_CAMARA_PRESENCA_LEGADO=true.
CREATE TABLE canon.camara_presenca_dia (
  data             date NOT NULL,
  id_camara        integer NOT NULL,
  frequencia       text NOT NULL,
  justificativa    text,
  presenca_externa boolean NOT NULL DEFAULT false,
  sessoes          integer NOT NULL DEFAULT 0,
  sessoes_presente integer NOT NULL DEFAULT 0,
  raw_object_id    uuid REFERENCES raw.raw_object (id),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (data, id_camara)
);

CREATE INDEX camara_presenca_dia_deputado_idx ON canon.camara_presenca_dia (id_camara);

-- migrate:down

DROP TABLE canon.camara_presenca_dia;
DROP TABLE canon.camara_presenca;
