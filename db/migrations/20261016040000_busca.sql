-- migrate:up

-- Busca textual em português, sem acento e sem diferenciar maiúsculas:
-- trigramas para nomes (pessoas, partidos, temas) e busca textual com
-- radicais do português para as propostas.
CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public;

-- unaccent() não é IMMUTABLE (depende do dicionário configurado); fixando o
-- dicionário, a função pode entrar em índices.
CREATE FUNCTION canon.normaliza(texto text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  RETURN lower(public.unaccent('public.unaccent'::regdictionary, texto));

-- A API precisa repetir exatamente estas expressões para usar os índices.
CREATE INDEX pessoa_busca_idx ON canon.pessoa
  USING gin (canon.normaliza(coalesce(nome_exibicao, '') || ' ' || coalesce(nome_civil, ''))
             public.gin_trgm_ops);

CREATE INDEX proposicao_busca_idx ON canon.proposicao
  USING gin (to_tsvector('portuguese'::regconfig, canon.normaliza(
    identificacao || ' ' || coalesce(apelido, '') || ' ' || coalesce(ementa, '') || ' '
    || coalesce(keywords, ''))));

CREATE INDEX proposicao_tema_busca_idx ON canon.proposicao_tema
  USING gin (canon.normaliza(tema) public.gin_trgm_ops);

GRANT EXECUTE ON FUNCTION canon.normaliza(text) TO vp_api_role, vp_admin_role, vp_ingest_role;

-- migrate:down

DROP INDEX canon.proposicao_tema_busca_idx;
DROP INDEX canon.proposicao_busca_idx;
DROP INDEX canon.pessoa_busca_idx;
DROP FUNCTION canon.normaliza(text);
DROP EXTENSION pg_trgm;
DROP EXTENSION unaccent;
