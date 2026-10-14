"""Eventos de candidaturas: troca de partido, situação da candidatura e resultado."""

from collections.abc import Iterator
from datetime import date
from itertools import pairwise
from typing import Any

import pg8000.native

from ..adapters.postgres import rows_as_dicts
from .comum import CAMARA_API, Indices, carregar_indices, normalizar_sigla
from .dinheiro_campanha import CAMPANHAS, _hoje, visibilidade
from .engine import Alvo, Evento, Gerador, Regra, momento

# Cargos federais, o mesmo recorte das contas de campanha.
CARGOS = {1: "Presidente", 2: "Vice-presidente", 5: "Senador", 6: "Deputado Federal",
          9: "1º suplente de senador", 10: "2º suplente de senador"}  # fmt: skip
# Siglas anteriores a 2018 (canon.partido começa em 2018) e o partido que as sucedeu.
SUCESSAO_ANTIGA = {"PMDB": "MDB", "PFL": "DEM", "PTN": "PODE", "PPB": "PP", "PEN": "PATRIOTA",
                   "PTDOB": "AVANTE", "PSDC": "DC", "PAN": "PTB"}  # fmt: skip
SEM_PARTIDO = {"S.PART.", "SPART.", "S/PARTIDO", "SEMPARTIDO"}
RESULTADOS = {
    "ELEITO": "eleito",
    "ELEITO POR QP": "eleito por quociente partidário",
    "ELEITO POR MÉDIA": "eleito por média",
    "2º TURNO": "vai ao 2º turno",
    "SUPLENTE": "suplente",
    "NÃO ELEITO": "não eleito",
}
# Prazo legal do pedido de registro de candidatura (Lei 9.504/1997, art. 11): 15 de agosto.
REGISTRO = (8, 15)

_CAMPANHA = {str(ano): [i.isoformat(), f.isoformat()] for ano, (i, f) in CAMPANHAS.items()}

REGRA_TROCA = Regra(
    "troca_partido",
    1,
    "Mudança de partido. Parlamentares: período de filiação novo no histórico da Câmara."
    " Demais candidatos: candidatura por partido diferente do da eleição anterior. Renomeação,"
    " fusão e incorporação não contam como troca; passagem por 'sem partido' compara o partido"
    " de antes com o de depois. Eventos de candidatura ficam só para quem segue durante a"
    " campanha.",
    {"sucessao_antiga": SUCESSAO_ANTIGA, "campanhas": _CAMPANHA, "arquivar_ausentes": False},
)
REGRA_SITUACAO = Regra(
    "situacao_candidatura",
    1,
    "Candidatura a cargo federal registrada no TSE e cada situação publicada (apto, inapto...);"
    " enquanto o TSE não publica a situação, o evento é o registro, datado no prazo legal de 15"
    " de agosto. Uma situação nova gera evento novo e as anteriores ficam. Só para quem segue"
    " durante a campanha.",
    {"cargos": sorted(CARGOS), "campanhas": _CAMPANHA, "arquivar_ausentes": False},
)
REGRA_RESULTADO = Regra(
    "resultado",
    1,
    "Resultado de candidatura a cargo federal em cada turno, como o TSE o publica (eleito,"
    " eleito por quociente partidário ou por média, segundo turno, suplente, não eleito). Só"
    " para quem segue durante a campanha.",
    {"cargos": sorted(CARGOS), "resultados": RESULTADOS, "campanhas": _CAMPANHA},
)


class Linhagem:
    """Partido e seus sucessores (renomeação, fusão, incorporação) para não confundir com troca."""

    def __init__(self, conn: pg8000.native.Connection, indices: Indices) -> None:
        self._indices = indices
        self._sucessor = dict(conn.run("SELECT id, sucessor_id FROM canon.partido"))

    def partido_id(self, sigla: str | None, partido_id: int | None = None) -> int | None:
        if partido_id is not None:
            return partido_id
        norma = normalizar_sigla(sigla)
        return self._indices.partido_id(SUCESSAO_ANTIGA.get(norma, norma))

    def _cadeia(self, partido_id: int) -> set[int]:
        vistos = {partido_id}
        atual = self._sucessor.get(partido_id)
        while atual is not None and atual not in vistos:
            vistos.add(atual)
            atual = self._sucessor.get(atual)
        return vistos

    def troca(self, de: tuple[str, int | None], para: tuple[str, int | None]) -> bool:
        id_de, id_para = self.partido_id(*de), self.partido_id(*para)
        if id_de is not None and id_para is not None:
            return id_para not in self._cadeia(id_de)
        return normalizar_sigla(de[0]) != normalizar_sigla(para[0])


def sem_partido(sigla: str | None) -> bool:
    return normalizar_sigla(sigla) in SEM_PARTIDO or not normalizar_sigla(sigla)


def _alvos_troca(indices: Indices, pessoa_id: str, de: str, para: str) -> tuple:
    return (
        Alvo("pessoa", pessoa_id, "filiado"),
        *indices.partido(de, "origem"),
        *indices.partido(para, "destino"),
    )


def _trocas_filiacao(
    conn: pg8000.native.Connection, indices: Indices, linhagem: Linhagem
) -> Iterator[Evento]:
    rows = rows_as_dicts(
        conn,
        "SELECT f.pessoa_id::text AS pessoa_id, f.sigla, f.partido_id, f.desde, f.fonte,"
        " v.id_fonte AS id_camara,"
        " coalesce(d.nome_parlamentar, p.nome_exibicao, p.nome_civil) AS nome"
        " FROM canon.filiacao f JOIN canon.pessoa p ON p.id = f.pessoa_id"
        " LEFT JOIN LATERAL (SELECT min(id_fonte) AS id_fonte FROM canon.pessoa_vinculo"
        "  WHERE fonte = 'camara' AND pessoa_id = f.pessoa_id) v ON true"
        " LEFT JOIN canon.camara_deputado d ON d.id_camara::text = v.id_fonte"
        " ORDER BY f.pessoa_id, f.desde",
    )
    anterior: dict[str, Any] | None = None
    for row in rows:
        if anterior is not None and anterior["pessoa_id"] != row["pessoa_id"]:
            anterior = None
        if sem_partido(row["sigla"]):
            continue  # compara o partido de antes com o de depois
        if anterior is not None and linhagem.troca(
            (anterior["sigla"], anterior["partido_id"]), (row["sigla"], row["partido_id"])
        ):
            yield Evento(
                chave=f"{row['fonte']}:{row['pessoa_id']}:{row['desde']:%Y-%m-%d}",
                ocorrido_em=momento(row["desde"]),
                titulo=f"{row['nome'] or 'Parlamentar'}: muda do {anterior['sigla']}"
                f" para o {row['sigla']}",
                resumo=f"Filiação ao {anterior['sigla']} desde {anterior['desde']:%d/%m/%Y};"
                f" ao {row['sigla']} desde {row['desde']:%d/%m/%Y}.",
                payload={
                    "fonte": row["fonte"],
                    "de": anterior["sigla"],
                    "para": row["sigla"],
                    "desde": row["desde"],
                },
                alvos=_alvos_troca(indices, row["pessoa_id"], anterior["sigla"], row["sigla"]),
                fonte_url=f"{CAMARA_API}/deputados/{row['id_camara']}/historico",
            )
        anterior = row


_CANDIDATURAS = """
SELECT DISTINCT ON (c.ano_eleicao, c.sq_candidato) c.ano_eleicao, c.sq_candidato, c.cd_cargo,
  c.ds_cargo, c.sg_uf, c.sg_partido, coalesce(c.nm_urna_candidato, c.nm_candidato) AS nome,
  c.ds_situacao_candidatura, c.dt_eleicao, v.pessoa_id::text AS pessoa_id, r.fetched_at
FROM canon.tse_candidatura c
LEFT JOIN canon.pessoa_vinculo v
  ON v.fonte = 'tse' AND v.id_fonte = c.ano_eleicao || ':' || c.sq_candidato
LEFT JOIN raw.raw_object r ON r.id = c.raw_object_id
WHERE c.ano_eleicao BETWEEN 1 AND 9999
ORDER BY c.ano_eleicao, c.sq_candidato, c.nr_turno
"""


def _cargo(row: dict[str, Any]) -> str:
    return CARGOS.get(row["cd_cargo"]) or (row["ds_cargo"] or "").title()


def _fonte(ano: int) -> str:
    return f"https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_{ano}.zip"


def _trocas_tse(
    conn: pg8000.native.Connection, indices: Indices, linhagem: Linhagem, hoje: date
) -> Iterator[Evento]:
    """Candidatos sem histórico de filiação: partido diferente do da eleição anterior."""
    com_filiacao = {r[0] for r in conn.run("SELECT DISTINCT pessoa_id::text FROM canon.filiacao")}
    por_pessoa: dict[str, list[dict[str, Any]]] = {}
    for row in rows_as_dicts(conn, _CANDIDATURAS):
        if row["pessoa_id"] and row["pessoa_id"] not in com_filiacao:
            por_pessoa.setdefault(row["pessoa_id"], []).append(row)
    for pessoa_id, candidaturas in por_pessoa.items():
        candidaturas.sort(key=lambda r: r["ano_eleicao"])
        for antes, depois in pairwise(candidaturas):
            if depois["cd_cargo"] not in CARGOS or antes["ano_eleicao"] == depois["ano_eleicao"]:
                continue
            if not linhagem.troca((antes["sg_partido"], None), (depois["sg_partido"], None)):
                continue
            ano = depois["ano_eleicao"]
            yield Evento(
                chave=f"tse:{pessoa_id}:{ano}",
                ocorrido_em=momento(date(ano, *REGISTRO)),
                titulo=f"{depois['nome']}: concorre em {ano} pelo {depois['sg_partido']};"
                f" em {antes['ano_eleicao']}, pelo {antes['sg_partido']}",
                payload={
                    "fonte": "tse",
                    "de": antes["sg_partido"],
                    "para": depois["sg_partido"],
                    "ano_anterior": antes["ano_eleicao"],
                    "ano_eleicao": ano,
                    "data_aproximada": True,
                },
                alvos=_alvos_troca(indices, pessoa_id, antes["sg_partido"], depois["sg_partido"]),
                fonte_url=_fonte(ano),
                fonte_dado_em=depois["fetched_at"],
                visibilidade=visibilidade(ano, hoje),
            )


def gerar_trocas(conn: pg8000.native.Connection, hoje: date | None = None) -> Iterator[Evento]:
    indices = carregar_indices(conn)
    linhagem = Linhagem(conn, indices)
    yield from _trocas_filiacao(conn, indices, linhagem)
    yield from _trocas_tse(conn, indices, linhagem, hoje or _hoje())


def _alvos_candidatura(indices: Indices, row: dict[str, Any]) -> tuple:
    alvos = indices.pessoa("tse", f"{row['ano_eleicao']}:{row['sq_candidato']}", "candidato")
    return (*alvos, *indices.partido(row["sg_partido"]))


def gerar_situacoes(conn: pg8000.native.Connection, hoje: date | None = None) -> Iterator[Evento]:
    indices = carregar_indices(conn)
    hoje = hoje or _hoje()
    for row in rows_as_dicts(conn, _CANDIDATURAS):
        if row["cd_cargo"] not in CARGOS:
            continue
        ano, situacao = row["ano_eleicao"], row["ds_situacao_candidatura"]
        titulo = f"{row['nome']}: candidatura a {_cargo(row)} ({row['sg_uf']}) pelo"
        titulo += f" {row['sg_partido']} em {ano}"
        yield Evento(
            chave=f"{ano}:{row['sq_candidato']}:{situacao or 'registrada'}",
            ocorrido_em=momento(
                row["dt_eleicao"] if situacao and row["dt_eleicao"] else date(ano, *REGISTRO)
            ),
            titulo=titulo + (f", situação: {situacao.lower()}" if situacao else ""),
            payload={
                "ano_eleicao": ano,
                "cargo": _cargo(row),
                "uf": row["sg_uf"],
                "partido": row["sg_partido"],
                "situacao": situacao,
                "data_aproximada": True,
            },
            alvos=_alvos_candidatura(indices, row),
            fonte_url=_fonte(ano),
            fonte_dado_em=row["fetched_at"],
            visibilidade=visibilidade(ano, hoje),
        )


_RESULTADOS = """
SELECT c.ano_eleicao, c.sq_candidato, c.nr_turno, c.cd_cargo, c.ds_cargo, c.sg_uf,
  c.sg_partido, coalesce(c.nm_urna_candidato, c.nm_candidato) AS nome, c.ds_sit_tot_turno,
  c.dt_eleicao, r.fetched_at
FROM canon.tse_candidatura c
LEFT JOIN raw.raw_object r ON r.id = c.raw_object_id
WHERE c.ds_sit_tot_turno = ANY(CAST(:resultados AS text[])) AND c.dt_eleicao IS NOT NULL
  AND c.ano_eleicao BETWEEN 1 AND 9999
ORDER BY c.ano_eleicao, c.sq_candidato, c.nr_turno
"""


def gerar_resultados(conn: pg8000.native.Connection, hoje: date | None = None) -> Iterator[Evento]:
    indices = carregar_indices(conn)
    hoje = hoje or _hoje()
    resultados = "{" + ",".join(f'"{r}"' for r in RESULTADOS) + "}"
    for row in rows_as_dicts(conn, _RESULTADOS, resultados=resultados):
        if row["cd_cargo"] not in CARGOS:
            continue
        ano, turno = row["ano_eleicao"], row["nr_turno"]
        resultado = RESULTADOS[row["ds_sit_tot_turno"]]
        yield Evento(
            chave=f"{ano}:{row['sq_candidato']}:{turno}",
            ocorrido_em=momento(row["dt_eleicao"]),
            titulo=f"{row['nome']}: {resultado} para {_cargo(row)} ({row['sg_uf']}) em {ano}"
            + (f", {turno}º turno" if turno > 1 else ""),
            payload={
                "ano_eleicao": ano,
                "turno": turno,
                "cargo": _cargo(row),
                "uf": row["sg_uf"],
                "partido": row["sg_partido"],
                "resultado": row["ds_sit_tot_turno"],
            },
            alvos=_alvos_candidatura(indices, row),
            fonte_url=_fonte(ano),
            fonte_dado_em=row["fetched_at"],
            visibilidade=visibilidade(ano, hoje),
        )


GERADORES = [
    Gerador(REGRA_TROCA, gerar_trocas),
    Gerador(REGRA_SITUACAO, gerar_situacoes),
    Gerador(REGRA_RESULTADO, gerar_resultados),
]
