-- migrate:up

-- Um registro por par (número no TSE, sigla). Números são reaproveitados
-- (o 14 foi do PTB e hoje é do Missão) e siglas mudam, então a história de um
-- partido é a cadeia de sucessores.
CREATE TABLE canon.partido (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero_tse        smallint NOT NULL,
  sigla             text NOT NULL,
  sigla_normalizada text NOT NULL,
  nome              text,
  primeiro_ano      smallint,
  ultimo_ano        smallint,
  id_camara         integer UNIQUE,
  sucessor_id       integer REFERENCES canon.partido (id),
  tipo_sucessao     text CHECK (
    tipo_sucessao IN ('renomeacao', 'fusao', 'incorporacao', 'mudanca_numero')
  ),
  ano_sucessao      smallint,
  sucessao_inferida boolean NOT NULL DEFAULT false,
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (numero_tse, sigla_normalizada),
  CHECK ((sucessor_id IS NULL) = (tipo_sucessao IS NULL))
);

-- migrate:down

DROP TABLE canon.partido;
