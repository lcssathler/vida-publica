"""Repasses partido → candidato a partir das receitas de campanha do TSE."""

import logging
from dataclasses import dataclass

import pg8000.native

from ..adapters.postgres import rows_as_dicts, transaction

logger = logging.getLogger(__name__)

# Origem da receita que caracteriza repasse de partido (código e descrição do TSE).
CD_ORIGEM_PARTIDO = 10020000
DS_ORIGEM_PARTIDO = "Recursos de partido político"


def fonte(ds_fonte: str | None) -> str:
    """Fonte do dinheiro conforme o TSE: fundo especial (FEFC), fundo partidário ou outros."""
    texto = (ds_fonte or "").strip().upper()
    if texto.startswith("FUNDO ESPECIAL"):
        return "fundo_especial"
    if texto.startswith("FUNDO PARTID"):
        return "fundo_partidario"
    return "outros"


# Ordem de prevalência das prestações: a final vale mais que o relatório
# financeiro, que vale mais que a parcial; empate decide pela data.
_PRIORIDADE = """
CASE upper(coalesce(tp_prestacao, ''))
  WHEN 'FINAL' THEN 3
  WHEN 'RELATÓRIO FINANCEIRO' THEN 2
  WHEN 'RELATORIO FINANCEIRO' THEN 2
  WHEN 'PARCIAL' THEN 1
  ELSE 0 END
"""

_UPSERT = f"""
WITH diretorios AS (
  SELECT DISTINCT ON (ano_eleicao, cnpj_prestador) ano_eleicao, cnpj_prestador, sq_prestador
  FROM (
    SELECT ano_eleicao, cnpj_prestador, sq_prestador FROM canon.tse_partido_receita
    UNION ALL
    SELECT ano_eleicao, cnpj_prestador, sq_prestador FROM canon.tse_partido_despesa
  ) x WHERE cnpj_prestador IS NOT NULL
  ORDER BY ano_eleicao, cnpj_prestador, sq_prestador
), partidos AS (
  SELECT DISTINCT ON (numero_tse) numero_tse, id FROM canon.partido
  ORDER BY numero_tse, ultimo_ano DESC
)
INSERT INTO canon.repasse (receita_id, ano_eleicao, sq_candidato, sq_receita, pessoa_id,
  nr_partido, sg_partido, partido_id, esfera, uf_diretorio, municipio_diretorio,
  cnpj_diretorio, sq_prestador_diretorio, fonte, natureza, valor, data, tp_prestacao,
  dt_prestacao, removido)
SELECT r.id, r.ano_eleicao, r.sq_candidato, r.sq_receita, v.pessoa_id,
  r.doador_nr_partido, r.doador_sg_partido, p.id,
  CASE WHEN r.doador_esfera IN ('N', 'F', 'M', 'Z') THEN r.doador_esfera END,
  r.doador_uf, r.doador_municipio, r.doador_cnpj, d.sq_prestador,
  CASE WHEN upper(coalesce(r.ds_fonte, '')) LIKE 'FUNDO ESPECIAL%' THEN 'fundo_especial'
       WHEN upper(coalesce(r.ds_fonte, '')) LIKE 'FUNDO PARTID%' THEN 'fundo_partidario'
       ELSE 'outros' END,
  r.ds_natureza, r.valor, r.data, r.tp_prestacao, r.dt_prestacao, r.removido_em IS NOT NULL
FROM canon.tse_receita r
LEFT JOIN canon.pessoa_vinculo v
  ON v.fonte = 'tse' AND v.id_fonte = r.ano_eleicao || ':' || r.sq_candidato
LEFT JOIN partidos p ON p.numero_tse = r.doador_nr_partido
LEFT JOIN diretorios d ON d.ano_eleicao = r.ano_eleicao AND d.cnpj_prestador = r.doador_cnpj
WHERE r.cd_origem = {CD_ORIGEM_PARTIDO} OR r.ds_origem = '{DS_ORIGEM_PARTIDO}'
ON CONFLICT (receita_id) DO UPDATE SET
  pessoa_id = EXCLUDED.pessoa_id, partido_id = EXCLUDED.partido_id,
  sq_prestador_diretorio = EXCLUDED.sq_prestador_diretorio, removido = EXCLUDED.removido,
  atualizado_em = now()
WHERE (canon.repasse.pessoa_id, canon.repasse.partido_id, canon.repasse.sq_prestador_diretorio,
       canon.repasse.removido)
  IS DISTINCT FROM (EXCLUDED.pessoa_id, EXCLUDED.partido_id, EXCLUDED.sq_prestador_diretorio,
       EXCLUDED.removido)
RETURNING 1
"""  # noqa: S608 - constantes do módulo, não entrada externa

_VIGENCIA = f"""
WITH ordenado AS (
  SELECT receita_id,
    row_number() OVER (
      PARTITION BY ano_eleicao, sq_candidato, coalesce(sq_receita, -1)
      ORDER BY removido, {_PRIORIDADE} DESC, dt_prestacao DESC NULLS LAST, receita_id
    ) = 1 AS primeiro
  FROM canon.repasse
)
UPDATE canon.repasse x SET vigente = o.primeiro, atualizado_em = now()
FROM ordenado o WHERE o.receita_id = x.receita_id AND x.vigente IS DISTINCT FROM o.primeiro
RETURNING 1
"""  # noqa: S608 - constantes do módulo


@dataclass
class BuildStats:
    repasses_alterados: int = 0
    vigencia_alterada: int = 0
    total: int = 0
    vigentes: int = 0
    sem_pessoa: int = 0
    sem_diretorio: int = 0
    sem_esfera: int = 0


def build(conn: pg8000.native.Connection) -> BuildStats:
    stats = BuildStats()
    with transaction(conn):
        stats.repasses_alterados = len(conn.run(_UPSERT))
        stats.vigencia_alterada = len(conn.run(_VIGENCIA))
    [resumo] = rows_as_dicts(
        conn,
        "SELECT count(*) AS total, count(*) FILTER (WHERE vigente AND NOT removido) AS vigentes,"
        " count(*) FILTER (WHERE pessoa_id IS NULL) AS sem_pessoa,"
        " count(*) FILTER (WHERE sq_prestador_diretorio IS NULL) AS sem_diretorio,"
        " count(*) FILTER (WHERE esfera IS NULL) AS sem_esfera FROM canon.repasse",
    )
    for campo, valor in resumo.items():
        setattr(stats, campo, valor)
    logger.info("repasses: %s", stats)
    return stats


def resumo_por_fonte(conn: pg8000.native.Connection) -> list[dict]:
    """Totais vigentes por esfera e fonte, para conferência (nunca somados entre si)."""
    return rows_as_dicts(
        conn,
        "SELECT ano_eleicao, esfera, fonte, count(*) AS repasses, sum(valor) AS valor"
        " FROM canon.repasse WHERE vigente AND NOT removido"
        " GROUP BY 1, 2, 3 ORDER BY 1, 2, 3",
    )
