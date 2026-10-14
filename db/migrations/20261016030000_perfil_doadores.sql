-- migrate:up

-- Doadores pessoa física de cada candidatura, para o perfil no app. A API não
-- enxerga o esquema ident: esta visão (que roda com os privilégios do dono)
-- agrupa as doações pelo hash do CPF e entrega só o total e o número de
-- doações de cada doador, sem o hash. O nome só aparece acima de R$ 10 mil
-- somados na candidatura; abaixo disso, a linha vem sem nome (a API soma tudo
-- em "outras pessoas físicas"). Recursos próprios (o CPF do próprio candidato)
-- ficam de fora: são mostrados como origem, não como doador.
-- A receita vigente é a da prestação mais recente (final > relatório
-- financeiro > parcial), como no motor de eventos.
CREATE VIEW canon.tse_doador_pessoa_fisica AS
WITH vigente AS (
  SELECT r.id, r.ano_eleicao, r.sq_candidato, r.doador_nome, r.valor,
         row_number() OVER (
           PARTITION BY r.ano_eleicao, r.sq_candidato, coalesce(r.sq_receita::text, r.id)
           ORDER BY CASE upper(coalesce(r.tp_prestacao, ''))
                      WHEN 'FINAL' THEN 3
                      WHEN 'RELATÓRIO FINANCEIRO' THEN 2
                      WHEN 'RELATORIO FINANCEIRO' THEN 2
                      WHEN 'PARCIAL' THEN 1
                      ELSE 0 END DESC,
                    r.dt_prestacao DESC NULLS LAST, r.id
         ) AS ordem
  FROM canon.tse_receita r
  WHERE r.removido_em IS NULL AND r.cd_origem IS DISTINCT FROM 10010100
)
SELECT v.ano_eleicao, v.sq_candidato,
       CASE WHEN sum(v.valor) > 10000 THEN max(v.doador_nome) END AS doador_nome,
       count(*)::integer AS doacoes,
       sum(v.valor) AS total
FROM vigente v
JOIN ident.tse_receita_doador d ON d.linha_id = v.id
WHERE v.ordem = 1
GROUP BY v.ano_eleicao, v.sq_candidato, d.cpf_hash;

GRANT SELECT ON canon.tse_doador_pessoa_fisica TO vp_api_role, vp_admin_role;

-- migrate:down

DROP VIEW canon.tse_doador_pessoa_fisica;
