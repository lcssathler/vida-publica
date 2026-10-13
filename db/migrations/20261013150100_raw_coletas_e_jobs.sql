-- migrate:up

-- Cada arquivo bruto guardado no S3. O conteúdo nunca muda: um mesmo
-- (fonte, dataset, hash) aparece uma única vez.
CREATE TABLE raw.raw_object (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source       text NOT NULL CHECK (source ~ '^[a-z0-9][a-z0-9_-]*$'),
  dataset      text NOT NULL CHECK (dataset ~ '^[a-z0-9][a-z0-9_-]*$'),
  sha256       char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  key          text NOT NULL UNIQUE,
  size_bytes   bigint NOT NULL CHECK (size_bytes >= 0),
  content_type text NOT NULL,
  fetched_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, dataset, sha256)
);

CREATE INDEX raw_object_source_dataset_fetched_idx
  ON raw.raw_object (source, dataset, fetched_at DESC);

-- Cada execução de job: base para alertas de dados desatualizados.
CREATE TABLE raw.job_run (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job         text NOT NULL,
  status      text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at  timestamptz NOT NULL,
  finished_at timestamptz,
  error       text,
  CHECK ((status = 'running') = (finished_at IS NULL)),
  CHECK (status = 'failed' OR error IS NULL)
);

CREATE INDEX job_run_job_started_idx ON raw.job_run (job, started_at DESC);

-- migrate:down

DROP TABLE raw.job_run;
DROP TABLE raw.raw_object;
