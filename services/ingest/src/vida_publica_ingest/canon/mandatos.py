"""Mandatos por pessoa e períodos de filiação partidária."""

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

import pg8000.native

from ..adapters.postgres import rows_as_dicts, transaction
from ..sources.partidos import normalize_sigla

logger = logging.getLogger(__name__)

# Câmara: um mandato por deputado e legislatura, com as datas reais de posse e
# saída do histórico. Sem evento de posse, vale o início da legislatura.
_MANDATOS_CAMARA = """
WITH eventos AS (
  SELECT id_camara, id_legislatura,
    min(data_hora) FILTER (WHERE descricao_status ILIKE 'Entrada%') AS entrada,
    max(data_hora) FILTER (WHERE descricao_status ILIKE 'Saída%') AS saida,
    (array_agg(condicao_eleitoral ORDER BY data_hora)
       FILTER (WHERE descricao_status ILIKE 'Entrada%'))[1] AS condicao,
    (array_agg(sigla_uf ORDER BY data_hora DESC))[1] AS uf
  FROM canon.camara_historico GROUP BY id_camara, id_legislatura
)
INSERT INTO canon.mandato (pessoa_id, casa, cargo, uf, id_legislatura, condicao, inicio, fim,
                           em_exercicio, fonte_id)
SELECT v.pessoa_id, 'camara', 'Deputado Federal', coalesce(e.uf, d.sigla_uf), l.id_legislatura,
  coalesce(e.condicao, d.condicao_eleitoral, 'Titular'),
  coalesce(e.entrada::date, leg.inicio),
  CASE WHEN e.saida > e.entrada THEN e.saida::date
       WHEN leg.fim < current_date THEN leg.fim END,
  d.situacao = 'Exercício' AND d.id_legislatura = l.id_legislatura,
  d.id_camara::text
FROM canon.camara_deputado_legislatura l
JOIN canon.camara_deputado d USING (id_camara)
JOIN canon.legislatura leg ON leg.id = l.id_legislatura
JOIN canon.pessoa_vinculo v ON v.fonte = 'camara' AND v.id_fonte = d.id_camara::text
LEFT JOIN eventos e ON e.id_camara = l.id_camara AND e.id_legislatura = l.id_legislatura
ON CONFLICT (casa, fonte_id, id_legislatura, condicao) DO UPDATE SET
  pessoa_id = EXCLUDED.pessoa_id, uf = EXCLUDED.uf, inicio = EXCLUDED.inicio,
  fim = EXCLUDED.fim, em_exercicio = EXCLUDED.em_exercicio, atualizado_em = now()
RETURNING 1
"""

# Senado: um mandato por participação (titular ou suplente) em cada legislatura.
_MANDATOS_SENADO = """
INSERT INTO canon.mandato (pessoa_id, casa, cargo, uf, id_legislatura, condicao, inicio, fim,
                           em_exercicio, fonte_id)
SELECT v.pessoa_id, 'senado',
  CASE WHEN p.participacao = 'Titular' THEN 'Senador' ELSE p.participacao || ' de Senador' END,
  s.uf_parlamentar, p.id_legislatura, p.participacao, leg.inicio,
  CASE WHEN leg.fim < current_date THEN leg.fim END,
  s.em_exercicio, s.codigo_senado::text
FROM canon.senado_senador_legislatura p
JOIN canon.senado_senador s USING (codigo_senado)
JOIN canon.legislatura leg ON leg.id = p.id_legislatura
JOIN canon.pessoa_vinculo v ON v.fonte = 'senado' AND v.id_fonte = s.codigo_senado::text
ON CONFLICT (casa, fonte_id, id_legislatura, condicao) DO UPDATE SET
  pessoa_id = EXCLUDED.pessoa_id, uf = EXCLUDED.uf, em_exercicio = EXCLUDED.em_exercicio,
  fim = EXCLUDED.fim, atualizado_em = now()
RETURNING 1
"""


# Grafias usadas pela Câmara para siglas que existem em canon.partido.
SIGLAS_EQUIVALENTES = {
    "PATRI": "PATRIOTA",
    "SD": "SOLIDARIEDADE",
    "SDD": "SOLIDARIEDADE",
    "PODEMOS": "PODE",
}
# Marcadores de "sem partido": não são partido e não contam como dado faltando.
SEM_PARTIDO = {"S.PART.", "S/PARTIDO", "SEM PARTIDO", "S.PART"}


def sigla_canonica(sigla: str) -> str | None:
    """Sigla normalizada para buscar em canon.partido; None para "sem partido"."""
    if sigla.strip().upper() in SEM_PARTIDO:
        return None
    normalizada = normalize_sigla(sigla)
    return normalize_sigla(SIGLAS_EQUIVALENTES.get(normalizada, normalizada))


@dataclass(frozen=True)
class Periodo:
    sigla: str
    desde: date
    ate: date | None


def periodos_de_filiacao(eventos: list[tuple[datetime, str]]) -> list[Periodo]:
    """Agrupa eventos consecutivos com a mesma sigla em períodos.

    `ate` é o dia anterior à próxima troca (ou o mesmo dia, se a troca foi no
    mesmo dia). O último período fica em aberto.
    """
    grupos: list[tuple[str, date]] = []
    for momento, sigla in sorted(eventos):
        if not grupos or normalize_sigla(grupos[-1][0]) != normalize_sigla(sigla):
            grupos.append((sigla, momento.date()))
    periodos = []
    for indice, (sigla, desde) in enumerate(grupos):
        proximo = grupos[indice + 1][1] if indice + 1 < len(grupos) else None
        ate = max(desde, proximo - timedelta(days=1)) if proximo else None
        periodos.append(Periodo(sigla, desde, ate))
    return periodos


@dataclass
class BuildStats:
    mandatos_camara: int = 0
    mandatos_senado: int = 0
    filiacoes: int = 0
    sem_partido_declarado: int = 0
    # Siglas anteriores a 2018 ainda não estão em canon.partido.
    sigla_nao_encontrada: int = 0


def build(conn: pg8000.native.Connection) -> BuildStats:
    stats = BuildStats()
    with transaction(conn):
        stats.mandatos_camara = len(conn.run(_MANDATOS_CAMARA))
        stats.mandatos_senado = len(conn.run(_MANDATOS_SENADO))

        partidos = {
            row["sigla_normalizada"]: row["id"]
            for row in rows_as_dicts(
                conn,
                "SELECT DISTINCT ON (sigla_normalizada) sigla_normalizada, id"
                " FROM canon.partido ORDER BY sigla_normalizada, ultimo_ano DESC",
            )
        }
        eventos: dict[Any, list[tuple[datetime, str]]] = {}
        for row in rows_as_dicts(
            conn,
            "SELECT v.pessoa_id, h.data_hora, h.sigla_partido FROM canon.camara_historico h"
            " JOIN canon.pessoa_vinculo v ON v.fonte = 'camara'"
            " AND v.id_fonte = h.id_camara::text WHERE h.sigla_partido IS NOT NULL",
        ):
            eventos.setdefault(row["pessoa_id"], []).append(
                (row["data_hora"], row["sigla_partido"])
            )

        for pessoa_id, lista in eventos.items():
            for periodo in periodos_de_filiacao(lista):
                canonica = sigla_canonica(periodo.sigla)
                partido_id = partidos.get(canonica) if canonica else None
                stats.filiacoes += 1
                stats.sem_partido_declarado += canonica is None
                stats.sigla_nao_encontrada += canonica is not None and partido_id is None
                conn.run(
                    "INSERT INTO canon.filiacao (pessoa_id, sigla, partido_id, desde, ate, fonte)"
                    " VALUES (:pessoa, :sigla, :partido, :desde, :ate, 'camara')"
                    " ON CONFLICT (pessoa_id, fonte, desde) DO UPDATE SET sigla = EXCLUDED.sigla,"
                    " partido_id = EXCLUDED.partido_id, ate = EXCLUDED.ate, atualizado_em = now()",
                    pessoa=pessoa_id,
                    sigla=periodo.sigla,
                    partido=partido_id,
                    desde=periodo.desde,
                    ate=periodo.ate,
                )
    logger.info("mandatos-filiacoes: %s", stats)
    return stats
