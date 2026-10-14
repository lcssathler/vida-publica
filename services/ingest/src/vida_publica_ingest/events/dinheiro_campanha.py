"""Eventos de dinheiro de campanha: fundo recebido pelos partidos, repasses e doações."""

from collections.abc import Iterator
from datetime import date, datetime
from decimal import Decimal
from typing import Any

import pg8000.native

from ..adapters.postgres import rows_as_dicts
from ..canon.repasses import _PRIORIDADE as PRIORIDADE_PRESTACAO
from ..sources import tse_contas_candidatos, tse_contas_partidos
from .comum import Indices, carregar_indices, reais
from .engine import BRT, LIMITE_REVISAO, Evento, Gerador, Regra, momento

# Campanha eleitoral: do início da propaganda ao segundo turno. Nesse período os eventos
# de candidatos só aparecem para quem segue o candidato ou o partido.
CAMPANHAS = {2026: (date(2026, 8, 16), date(2026, 10, 25))}

ESFERAS = {"N": "nacional", "F": "estadual", "M": "municipal", "Z": "zonal"}
FONTES = {
    "fundo_especial": "Fundo Especial",
    "fundo_partidario": "Fundo Partidário",
    "outros": "outros recursos",
}
# Origens de receita de candidato que viram evento de doação (as de partido são repasses).
ORIGENS_DOACAO = {
    10010200: "pessoas físicas",
    10010100: "recursos próprios",
    10040000: "outros candidatos",
    10020500: "financiamento coletivo",
    10010400: "doações pela internet",
    10030300: "origens não identificadas",
}
ORIGEM_PESSOA_FISICA = 10010200
ORIGEM_OUTROS_CANDIDATOS = 10040000

_PARAMETROS_CAMPANHA = {
    "revisao_acima_de": int(LIMITE_REVISAO),
    "campanhas": {str(ano): [i.isoformat(), f.isoformat()] for ano, (i, f) in CAMPANHAS.items()},
}

REGRA_FUNDO = Regra(
    "fundo_recebido",
    1,
    "Receita de Fundo Especial (FEFC) ou Fundo Partidário de um diretório partidário (nacional,"
    " estadual ou municipal), pela prestação de contas mais recente de cada receita no TSE."
    " Acima de R$ 500 mil, segurado para revisão humana.",
    {"revisao_acima_de": int(LIMITE_REVISAO), "fontes": ["Fundo Especial", "Fundo Partidário"]},
)
REGRA_REPASSE = Regra(
    "repasse",
    1,
    "Repasse de partido para candidato (canon.repasse vigente), com o diretório e a fonte do"
    " dinheiro, sem somar níveis. Acima de R$ 500 mil, segurado para revisão humana. Durante a"
    " campanha, só para quem segue o candidato ou o partido.",
    _PARAMETROS_CAMPANHA,
)
REGRA_DOACAO = Regra(
    "doacao",
    1,
    "Doações recebidas por candidato num dia, somadas por origem (pessoas físicas, recursos"
    " próprios, outros candidatos, financiamento coletivo, internet, origem não identificada),"
    " pela prestação de contas mais recente de cada receita. Doador pessoa física nunca é"
    " nomeado: só o total e o número de doações. Acima de R$ 500 mil, segurado para revisão"
    " humana. Durante a campanha, só para quem segue o candidato ou o partido.",
    {**_PARAMETROS_CAMPANHA, "origens": {str(k): v for k, v in ORIGENS_DOACAO.items()}},
)


def visibilidade(ano_eleicao: int, hoje: date) -> str:
    """'seguidores' enquanto durar a campanha da eleição do evento; depois, 'geral'."""
    periodo = CAMPANHAS.get(ano_eleicao)
    if periodo and periodo[0] <= hoje <= periodo[1]:
        return "seguidores"
    return "geral"


def _hoje() -> date:
    return datetime.now(BRT).date()


def _diretorio(esfera: str | None, sigla: str | None, uf: str | None, municipio: str | None) -> str:
    nivel = ESFERAS.get(esfera or "", "")
    lugar = municipio if esfera == "M" and municipio else (uf if esfera in ("F", "M") else None)
    texto = f"diretório {nivel} do {sigla}" if nivel else f"diretório do {sigla}"
    return f"{texto} ({lugar})" if lugar and lugar != "BR" else texto


_FUNDO = f"""
WITH vigente AS (
  SELECT r.*, row_number() OVER (
    PARTITION BY ano_eleicao, sq_prestador, coalesce(sq_receita, -1)
    ORDER BY {PRIORIDADE_PRESTACAO} DESC, dt_prestacao DESC NULLS LAST, id
  ) AS ordem
  FROM canon.tse_partido_receita r
  WHERE removido_em IS NULL AND (upper(ds_fonte) LIKE 'FUNDO ESPECIAL%'
    OR upper(ds_fonte) LIKE 'FUNDO PARTID%')
)
SELECT v.*, o.fetched_at FROM vigente v
LEFT JOIN raw.raw_object o ON o.id = v.raw_object_id
WHERE v.ordem = 1 AND v.ano_eleicao BETWEEN 1 AND 9999
ORDER BY v.id
"""  # noqa: S608 - constantes do módulo


def gerar_fundos(conn: pg8000.native.Connection) -> Iterator[Evento]:
    indices = carregar_indices(conn)
    for row in rows_as_dicts(conn, _FUNDO):
        fonte = (
            "Fundo Especial"
            if row["ds_fonte"].upper().startswith("FUNDO ESPECIAL")
            else ("Fundo Partidário")
        )
        diretorio = _diretorio(row["esfera"], row["sg_partido"], row["sg_uf"], row["nm_municipio"])
        # doador de fundo é órgão público ou partidário (com CNPJ); sem CNPJ, não se nomeia
        doador = row["doador_nome"] if row["doador_cnpj"] else None
        yield Evento(
            chave=f"{row['ano_eleicao']}:{row['sq_prestador']}:{row['sq_receita'] or row['id']}",
            ocorrido_em=momento(
                row["data"] or row["dt_prestacao"] or date(row["ano_eleicao"], 1, 1)
            ),
            titulo=f"{diretorio[:1].upper()}{diretorio[1:]} recebeu {reais(row['valor'])}"
            f" do {fonte}",
            resumo=f"Origem: {row['ds_origem']}." + (f" Doador: {doador}." if doador else ""),
            payload={
                "ano_eleicao": row["ano_eleicao"],
                "partido": row["sg_partido"],
                "esfera": row["esfera"],
                "uf": row["sg_uf"],
                "municipio": row["nm_municipio"],
                "fonte": fonte,
                "origem": row["ds_origem"],
                "doador": doador,
                "prestacao": row["tp_prestacao"],
            },
            alvos=tuple(indices.partido(row["sg_partido"], "recebedor")),
            fonte_url=tse_contas_partidos.URL.format(ano=row["ano_eleicao"]),
            fonte_dado_em=row["fetched_at"],
            valor=row["valor"],
        )


_CANDIDATOS = """
SELECT DISTINCT ON (ano_eleicao, sq_candidato) ano_eleicao, sq_candidato,
  coalesce(nm_urna_candidato, nm_candidato) AS nome, ds_cargo, sg_uf, sg_partido
FROM canon.tse_candidatura ORDER BY ano_eleicao, sq_candidato, nr_turno
"""


def _candidatos(conn: pg8000.native.Connection) -> dict[tuple[int, int], dict[str, Any]]:
    return {(r["ano_eleicao"], r["sq_candidato"]): r for r in rows_as_dicts(conn, _CANDIDATOS)}


def _alvos_candidato(
    indices: Indices, ano: int, sq: int, candidato: dict[str, Any] | None, papel: str
) -> list:
    alvos = indices.pessoa("tse", f"{ano}:{sq}", papel)
    if candidato:
        alvos += indices.partido(candidato["sg_partido"])
    return alvos


_REPASSES = """
SELECT r.*, o.fetched_at FROM canon.repasse r
JOIN canon.tse_receita t ON t.id = r.receita_id
LEFT JOIN raw.raw_object o ON o.id = t.raw_object_id
WHERE r.vigente AND NOT r.removido AND r.ano_eleicao BETWEEN 1 AND 9999
ORDER BY r.receita_id
"""


def gerar_repasses(conn: pg8000.native.Connection, hoje: date | None = None) -> Iterator[Evento]:
    indices = carregar_indices(conn)
    candidatos = _candidatos(conn)
    hoje = hoje or _hoje()
    for row in rows_as_dicts(conn, _REPASSES):
        ano, sq = row["ano_eleicao"], row["sq_candidato"]
        candidato = candidatos.get((ano, sq))
        nome = candidato["nome"] if candidato else f"Candidatura {sq}"
        diretorio = _diretorio(row["esfera"], row["sg_partido"], row["uf_diretorio"],
                               row["municipio_diretorio"])  # fmt: skip
        fonte = FONTES[row["fonte"]]
        yield Evento(
            chave=f"{ano}:{sq}:{row['sq_receita'] or row['receita_id']}",
            ocorrido_em=momento(row["data"] or row["dt_prestacao"] or date(ano, 1, 1)),
            titulo=f"{nome} recebeu {reais(row['valor'])} do {diretorio} ({fonte})",
            resumo=f"Prestação de contas: {row['tp_prestacao']}." if row["tp_prestacao"] else None,
            payload={
                "ano_eleicao": ano,
                "cargo": candidato["ds_cargo"] if candidato else None,
                "uf": candidato["sg_uf"] if candidato else None,
                "partido": row["sg_partido"],
                "esfera": row["esfera"],
                "uf_diretorio": row["uf_diretorio"],
                "fonte": row["fonte"],
                "natureza": row["natureza"],
                "prestacao": row["tp_prestacao"],
            },
            alvos=(
                *indices.pessoa("tse", f"{ano}:{sq}", "candidato"),
                *indices.partido(row["sg_partido"], "doador"),
            ),
            fonte_url=tse_contas_candidatos.URL.format(ano=ano),
            fonte_dado_em=row["fetched_at"],
            valor=row["valor"],
            visibilidade=visibilidade(ano, hoje),
        )


_DOACOES = f"""
WITH vigente AS (
  SELECT r.*, row_number() OVER (
    PARTITION BY ano_eleicao, sq_candidato, coalesce(sq_receita, -1)
    ORDER BY {PRIORIDADE_PRESTACAO} DESC, dt_prestacao DESC NULLS LAST, id
  ) AS ordem
  FROM canon.tse_receita r
  WHERE removido_em IS NULL AND cd_origem = ANY(CAST(:origens AS integer[]))
    AND ano_eleicao BETWEEN 1 AND 9999
)
SELECT v.ano_eleicao, v.sq_candidato, v.cd_origem, v.data,
  CASE WHEN v.cd_origem = {ORIGEM_OUTROS_CANDIDATOS} THEN v.doador_sq_candidato END AS doador_sq,
  CASE WHEN v.cd_origem = {ORIGEM_OUTROS_CANDIDATOS} THEN max(v.doador_nome) END AS doador_nome,
  count(*) AS doacoes, sum(v.valor) AS valor, max(o.fetched_at) AS fetched_at,
  max(v.tp_prestacao) AS prestacao
FROM vigente v
LEFT JOIN raw.raw_object o ON o.id = v.raw_object_id
WHERE v.ordem = 1 AND v.data IS NOT NULL
GROUP BY 1, 2, 3, 4, 5
ORDER BY 1, 2, 3, 4, 5
"""  # noqa: S608 - constantes do módulo


def gerar_doacoes(conn: pg8000.native.Connection, hoje: date | None = None) -> Iterator[Evento]:
    indices = carregar_indices(conn)
    candidatos = _candidatos(conn)
    hoje = hoje or _hoje()
    origens = "{" + ",".join(str(c) for c in ORIGENS_DOACAO) + "}"
    for row in rows_as_dicts(conn, _DOACOES, origens=origens):
        ano, sq, origem = row["ano_eleicao"], row["sq_candidato"], row["cd_origem"]
        candidato = candidatos.get((ano, sq))
        nome = candidato["nome"] if candidato else f"Candidatura {sq}"
        valor: Decimal = row["valor"]
        n = row["doacoes"]
        if origem == ORIGEM_OUTROS_CANDIDATOS and row["doador_nome"]:
            de = f"de {row['doador_nome']} (outro candidato)"
        else:
            de = f"de {ORIGENS_DOACAO[origem]}"
        quantas = "1 doação" if n == 1 else f"{n} doações"
        alvos = _alvos_candidato(indices, ano, sq, candidato, "candidato")
        if row["doador_sq"]:
            alvos += indices.pessoa("tse", f"{ano}:{row['doador_sq']}", "doador")
        yield Evento(
            chave=f"{ano}:{sq}:{row['data']:%Y-%m-%d}:{origem}:{row['doador_sq'] or ''}",
            ocorrido_em=momento(row["data"]),
            titulo=f"{nome} recebeu {reais(valor)} {de} em {row['data']:%d/%m/%Y}",
            resumo=f"{quantas} {de} no dia."
            + (
                " Doadores pessoas físicas não são nomeados."
                if origem == ORIGEM_PESSOA_FISICA
                else ""
            ),
            payload={
                "ano_eleicao": ano,
                "cargo": candidato["ds_cargo"] if candidato else None,
                "uf": candidato["sg_uf"] if candidato else None,
                "partido": candidato["sg_partido"] if candidato else None,
                "origem": ORIGENS_DOACAO[origem],
                "doacoes": n,
                "total": valor,
                "doador_candidato": row["doador_nome"],
                "prestacao": row["prestacao"],
            },
            alvos=tuple(alvos),
            fonte_url=tse_contas_candidatos.URL.format(ano=ano),
            fonte_dado_em=row["fetched_at"],
            valor=valor,
            visibilidade=visibilidade(ano, hoje),
        )


GERADORES = [
    Gerador(REGRA_FUNDO, gerar_fundos),
    Gerador(REGRA_REPASSE, gerar_repasses),
    Gerador(REGRA_DOACAO, gerar_doacoes),
]
