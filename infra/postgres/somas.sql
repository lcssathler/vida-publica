-- Funções temporárias (somem com a sessão) para conferir uma restauração:
-- linhas e soma de verificação de cada tabela dos esquemas da aplicação. A
-- soma é o md5 dos md5 de cada linha em ordem, então não depende da ordem
-- física nem de chave primária.
CREATE FUNCTION pg_temp.vp_tabelas() RETURNS SETOF regclass LANGUAGE sql AS $$
  SELECT c.oid::regclass
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'r'
     AND n.nspname IN ('raw', 'canon', 'feed', 'app', 'admin', 'ident', 'public')
   ORDER BY c.oid::regclass::text
$$;

CREATE FUNCTION pg_temp.vp_soma(t regclass, OUT linhas bigint, OUT soma text)
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'SELECT count(*), coalesce(md5(string_agg(h, %L ORDER BY h)), %L)'
    ' FROM (SELECT md5(x::text) AS h FROM %s x) y', '', '', t)
  INTO linhas, soma;
END
$$;
