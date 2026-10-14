"""Eventos de presença, ausência e despesas mensais da cota parlamentar."""

import calendar
from collections.abc import Iterator
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

import pg8000.native

from ..adapters.postgres import rows_as_dicts
from .comum import CAMARA_API, Indices, carregar_indices, reais, resumir
from .engine import BRT, LIMITE_REVISAO, Evento, Gerador, Regra, momento

# Senado: códigos de comparecimento nas votações nominais.
SENADO_PRESENTE = ("Sim", "Não", "Abstenção", "Obstrução", "Votou", "P-NRV",
                   "Presidente (art. 51 RISF)")  # fmt: skip
SENADO_AUSENTE = ("AP", "LS", "MIS", "NCom", "LP", "LAP")
CAMARA_AUSENCIAS = ("Ausência", "Ausência justificada")
# Prazo para os parlamentares apresentarem os comprovantes: até lá o mês está incompleto.
PRAZO_DESPESAS_DIAS = 90

MESES = ("janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
         "setembro", "outubro", "novembro", "dezembro")  # fmt: skip

REGRA_PRESENCA = Regra(
    "presenca",
    1,
    "Presença de parlamentar em sessão deliberativa do Plenário. Câmara: lista de presença da"
    " sessão encerrada (/eventos/{id}/deputados). Senado: comparecimento em ao menos uma"
    " votação nominal da sessão (voto ou presente sem voto). Presença em comissões não entra.",
    {"senado_presente": list(SENADO_PRESENTE)},
)
REGRA_AUSENCIA = Regra(
    "ausencia",
    1,
    "Ausência de parlamentar no Plenário, só quando a casa a publica. Câmara: frequência"
    " oficial do dia (serviço legado), com a justificativa; a lista de presença por sessão não"
    " diz quem era esperado. Senado: código de ausência em todas as votações nominais da"
    " sessão, com o motivo.",
    {"camara_frequencias": list(CAMARA_AUSENCIAS), "senado_ausente": list(SENADO_AUSENTE)},
)
REGRA_DESPESA = Regra(
    "despesa_mensal",
    1,
    "Total mensal das despesas da cota parlamentar de cada deputado (CEAP) e senador (CEAPS),"
    " por categoria, sem fornecedores. O mês fica marcado como incompleto até 90 dias depois"
    " do fim, prazo para a apresentação dos comprovantes. Despesas removidas pela fonte não"
    " contam; despesas de liderança sem deputado ficam de fora.",
    {"prazo_dias": PRAZO_DESPESAS_DIAS, "revisao_acima_de": int(LIMITE_REVISAO)},
)

_PRESENCA_CAMARA = """
SELECT e.id AS id_evento, e.inicio, p.id_camara, d.nome_parlamentar, r.fetched_at
FROM canon.camara_presenca p
JOIN canon.camara_evento e ON e.id = p.id_evento
LEFT JOIN canon.camara_deputado d ON d.id_camara = p.id_camara
LEFT JOIN raw.raw_object r ON r.id = e.raw_object_id
WHERE e.sigla_orgao = 'PLEN' AND e.deliberativo AND e.situacao LIKE 'Encerrada%'
ORDER BY e.id, p.id_camara
"""

_AUSENCIA_CAMARA = """
SELECT f.data, f.id_camara, f.frequencia, f.justificativa, d.nome_parlamentar, r.fetched_at
FROM canon.camara_presenca_dia f
LEFT JOIN canon.camara_deputado d ON d.id_camara = f.id_camara
LEFT JOIN raw.raw_object r ON r.id = f.raw_object_id
WHERE f.frequencia IN ('Ausência', 'Ausência justificada')
ORDER BY f.data, f.id_camara
"""

# Uma linha por senador e sessão: presente se compareceu a alguma votação; senão, o motivo
# de ausência mais frequente (empate: o primeiro em ordem alfabética).
_SENADO = """
WITH votos AS (
  SELECT v.codigo_sessao, v.data_sessao, vo.codigo_parlamentar, vo.sigla_voto,
    vo.descricao_voto, vo.sigla_partido, r.fetched_at
  FROM canon.senado_voto vo
  JOIN canon.senado_votacao v ON v.codigo_sessao_votacao = vo.codigo_sessao_votacao
  LEFT JOIN raw.raw_object r ON r.id = v.raw_object_id
)
SELECT codigo_sessao, data_sessao, codigo_parlamentar,
  bool_or(sigla_voto = ANY(CAST(:presente AS text[]))) AS presente,
  bool_or(sigla_voto = ANY(CAST(:ausente AS text[]))) AS ausente,
  mode() WITHIN GROUP (ORDER BY descricao_voto)
    FILTER (WHERE sigla_voto = ANY(CAST(:ausente AS text[]))) AS motivo,
  mode() WITHIN GROUP (ORDER BY sigla_voto)
    FILTER (WHERE sigla_voto = ANY(CAST(:ausente AS text[]))) AS codigo,
  max(sigla_partido) AS sigla_partido, max(fetched_at) AS fetched_at,
  (SELECT nome_parlamentar FROM canon.senado_senador s
   WHERE s.codigo_senado = votos.codigo_parlamentar) AS nome_parlamentar
FROM votos
GROUP BY codigo_sessao, data_sessao, codigo_parlamentar
ORDER BY codigo_sessao, codigo_parlamentar
"""


def _senado(conn: pg8000.native.Connection) -> list[dict[str, Any]]:
    return rows_as_dicts(
        conn,
        _SENADO,
        presente="{" + ",".join(f'"{c}"' for c in SENADO_PRESENTE) + "}",
        ausente="{" + ",".join(SENADO_AUSENTE) + "}",
    )


def _plenario(casa: str, dia: date) -> str:
    nome = "da Câmara" if casa == "camara" else "do Senado"
    return f"sessão deliberativa do Plenário {nome} de {dia:%d/%m/%Y}"


def _alvos(indices: Indices, casa: str, id_fonte: object, sigla: str | None) -> tuple:
    return (*indices.pessoa(casa, id_fonte, "parlamentar"), *indices.partido(sigla))


def gerar_presencas(conn: pg8000.native.Connection) -> Iterator[Evento]:
    indices = carregar_indices(conn)
    for row in rows_as_dicts(conn, _PRESENCA_CAMARA):
        dia = row["inicio"].date()
        nome = row["nome_parlamentar"] or f"Deputado {row['id_camara']}"
        yield Evento(
            chave=f"camara:{row['id_evento']}:{row['id_camara']}",
            ocorrido_em=momento(row["inicio"]),
            titulo=f"{nome}: presente na {_plenario('camara', dia)}",
            payload={"casa": "camara", "sessao": row["id_evento"], "presente": True},
            alvos=_alvos(indices, "camara", row["id_camara"], None),
            fonte_url=f"{CAMARA_API}/eventos/{row['id_evento']}/deputados",
            fonte_dado_em=row["fetched_at"],
        )
    for row in _senado(conn):
        if not row["presente"]:
            continue
        nome = row["nome_parlamentar"] or f"Senador {row['codigo_parlamentar']}"
        yield Evento(
            chave=f"senado:{row['codigo_sessao']}:{row['codigo_parlamentar']}",
            ocorrido_em=momento(row["data_sessao"]),
            titulo=f"{nome}: presente na {_plenario('senado', row['data_sessao'])}",
            payload={"casa": "senado", "sessao": row["codigo_sessao"], "presente": True},
            alvos=_alvos(indices, "senado", row["codigo_parlamentar"], row["sigla_partido"]),
            fonte_url=_senado_url(row["data_sessao"]),
            fonte_dado_em=row["fetched_at"],
        )


def _senado_url(dia: date) -> str:
    return (
        "https://legis.senado.leg.br/dadosabertos/votacao"
        f"?dataInicio={dia:%Y-%m-%d}&dataFim={dia:%Y-%m-%d}"
    )


def gerar_ausencias(conn: pg8000.native.Connection) -> Iterator[Evento]:
    indices = carregar_indices(conn)
    for row in rows_as_dicts(conn, _AUSENCIA_CAMARA):
        dia = row["data"]
        nome = row["nome_parlamentar"] or f"Deputado {row['id_camara']}"
        justificada = row["frequencia"] == "Ausência justificada"
        titulo = f"{nome}: ausente no Plenário da Câmara em {dia:%d/%m/%Y}"
        yield Evento(
            chave=f"camara:{dia:%Y-%m-%d}:{row['id_camara']}",
            ocorrido_em=momento(dia),
            titulo=titulo + (" (ausência justificada)" if justificada else ""),
            resumo=resumir(f"Justificativa: {row['justificativa']}")
            if row["justificativa"]
            else None,
            payload={
                "casa": "camara",
                "data": dia,
                "presente": False,
                "justificada": justificada,
                "justificativa": row["justificativa"],
            },
            alvos=_alvos(indices, "camara", row["id_camara"], None),
            fonte_url=f"https://www.camara.leg.br/SitCamaraWS/SessoesReunioes.asmx/"
            f"ListarPresencasDia?data={dia:%d/%m/%Y}",
            fonte_dado_em=row["fetched_at"],
        )
    for row in _senado(conn):
        if row["presente"] or not row["ausente"]:
            continue
        nome = row["nome_parlamentar"] or f"Senador {row['codigo_parlamentar']}"
        motivo = row["motivo"] or row["codigo"]
        yield Evento(
            chave=f"senado:{row['codigo_sessao']}:{row['codigo_parlamentar']}",
            ocorrido_em=momento(row["data_sessao"]),
            titulo=f"{nome}: ausente na {_plenario('senado', row['data_sessao'])} ({motivo})",
            payload={
                "casa": "senado",
                "sessao": row["codigo_sessao"],
                "presente": False,
                "codigo": row["codigo"],
                "motivo": row["motivo"],
            },
            alvos=_alvos(indices, "senado", row["codigo_parlamentar"], row["sigla_partido"]),
            fonte_url=_senado_url(row["data_sessao"]),
            fonte_dado_em=row["fetched_at"],
        )


# Ano fora de 1..9999 não existe no calendário do Python (só aparece em dados de teste).
_DESPESAS = {
    "camara": """
SELECT d.id_camara AS id_fonte, d.ano, d.mes, d.descricao AS categoria,
  count(*) AS documentos, sum(d.valor_liquido) AS valor, max(r.fetched_at) AS fetched_at,
  max(d.nome_parlamentar) AS nome, max(d.sigla_partido) AS sigla_partido
FROM canon.camara_despesa d
LEFT JOIN raw.raw_object r ON r.id = d.raw_object_id
WHERE d.removido_em IS NULL AND d.id_camara IS NOT NULL AND d.ano BETWEEN 1 AND 9999
GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4
""",
    "senado": """
SELECT d.codigo_senado AS id_fonte, d.ano, d.mes, d.tipo_despesa AS categoria,
  count(*) AS documentos, sum(d.valor) AS valor, max(r.fetched_at) AS fetched_at,
  max(s.nome_parlamentar) AS nome, max(s.sigla_partido) AS sigla_partido
FROM canon.senado_despesa d
LEFT JOIN canon.senado_senador s ON s.codigo_senado = d.codigo_senado
LEFT JOIN raw.raw_object r ON r.id = d.raw_object_id
WHERE d.removido_em IS NULL AND d.codigo_senado IS NOT NULL AND d.ano BETWEEN 1 AND 9999
GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4
""",
}
_FONTES_DESPESA = {
    "camara": "https://www.camara.leg.br/cotas/Ano-{ano}.csv.zip",
    "senado": "https://www.senado.gov.br/transparencia/LAI/verba/despesa_ceaps_{ano}.csv",
}


def fim_do_mes(ano: int, mes: int) -> date:
    return date(ano, mes, calendar.monthrange(ano, mes)[1])


def incompleto(ano: int, mes: int, hoje: date) -> bool:
    return hoje <= fim_do_mes(ano, mes) + timedelta(days=PRAZO_DESPESAS_DIAS)


def _categoria(linha: dict[str, Any]) -> str:
    return (linha["categoria"] or "Sem categoria").strip().rstrip(".")


def gerar_despesas(conn: pg8000.native.Connection, hoje: date | None = None) -> Iterator[Evento]:
    indices = carregar_indices(conn)
    hoje = hoje or datetime.now(BRT).date()
    for casa, sql in _DESPESAS.items():
        meses: dict[tuple[Any, int, int], list[dict[str, Any]]] = {}
        for row in rows_as_dicts(conn, sql):
            meses.setdefault((row["id_fonte"], row["ano"], row["mes"]), []).append(row)
        for (id_fonte, ano, mes), categorias in meses.items():
            total = sum((c["valor"] for c in categorias), Decimal(0))
            parcial = incompleto(ano, mes, hoje)
            nome = categorias[0]["nome"]
            titulo = f"{nome}: {reais(total)} em despesas da cota em {MESES[mes - 1]} de {ano}"
            ordenadas = sorted(categorias, key=lambda c: (-c["valor"], c["categoria"] or ""))
            yield Evento(
                chave=f"{casa}:{id_fonte}:{ano}-{mes:02d}",
                ocorrido_em=momento(fim_do_mes(ano, mes)),
                titulo=titulo + (" (parcial)" if parcial else ""),
                resumo=resumir(
                    "Maiores categorias: "
                    + "; ".join(f"{_categoria(c)}: {reais(c['valor'])}" for c in ordenadas[:3])
                    + "."
                    + (
                        " Mês ainda incompleto: há prazo para apresentar comprovantes."
                        if parcial
                        else ""
                    )
                ),
                payload={
                    "casa": casa,
                    "ano": ano,
                    "mes": mes,
                    "total": total,
                    "documentos": sum(c["documentos"] for c in categorias),
                    "incompleto": parcial,
                    "categorias": [
                        {
                            "categoria": c["categoria"],
                            "valor": c["valor"],
                            "documentos": c["documentos"],
                        }
                        for c in ordenadas
                    ],
                },
                alvos=_alvos(indices, casa, id_fonte, categorias[0]["sigla_partido"]),
                fonte_url=_FONTES_DESPESA[casa].format(ano=ano),
                fonte_dado_em=max(c["fetched_at"] for c in categorias if c["fetched_at"])
                if any(c["fetched_at"] for c in categorias)
                else None,
                valor=total,
            )


GERADORES = [
    Gerador(REGRA_PRESENCA, gerar_presencas),
    Gerador(REGRA_AUSENCIA, gerar_ausencias),
    Gerador(REGRA_DESPESA, gerar_despesas),
]
