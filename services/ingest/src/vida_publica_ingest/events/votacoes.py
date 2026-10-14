"""Eventos de votação: voto nominal e voto contra a orientação do partido."""

from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

import pg8000.native

from ..adapters.postgres import rows_as_dicts
from .comum import CAMARA_API, SENADO_API, Indices, carregar_indices, normalizar_sigla, resumir
from .engine import Evento, Gerador, Regra, momento

VOTOS = ("Sim", "Não", "Abstenção", "Obstrução")
ORIENTACOES = ("Sim", "Não")
# Voto secreto: a Câmara publica quem votou com o voto vazio; o Senado, "Votou".
SECRETO = "secreto"

REGRA_VOTO = Regra(
    "voto_nominal",
    1,
    "Voto de cada parlamentar em votação nominal da Câmara ou do Senado: Sim, Não, Abstenção,"
    " Obstrução ou voto secreto. Ausências e presença sem voto ficam para os eventos de"
    " presença; voto contra a orientação do próprio partido vira voto_contra_orientacao.",
    {"votos": [*VOTOS, SECRETO]},
)
REGRA_CONTRA = Regra(
    "voto_contra_orientacao",
    1,
    "Voto na Câmara (Sim, Não, Abstenção ou Obstrução) diferente da orientação Sim ou Não da"
    " bancada do próprio partido: a liderança do partido ou, sem ela, a da federação que o"
    " inclui. Orientação Liberado e orientações de bloco não contam.",
    {"votos": list(VOTOS), "orientacoes": list(ORIENTACOES), "bancadas": ["partido", "federacao"]},
)


@dataclass(frozen=True)
class Orientacao:
    bancada: str
    orientacao: str


def orientacao_do_partido(
    sigla: str | None, orientacoes: list[dict[str, Any]]
) -> Orientacao | None:
    """Orientação da liderança do partido; sem ela, a da federação que o inclui."""
    alvo = normalizar_sigla(sigla)
    if not alvo:
        return None
    federacao = None
    for row in orientacoes:
        bancada = row["sigla_bancada"]
        if row["cod_tipo_lideranca"] == "P" and normalizar_sigla(bancada) == alvo:
            return Orientacao(bancada, row["orientacao"])
        if bancada.startswith("Fdr ") and alvo in {
            normalizar_sigla(p) for p in bancada[4:].split("-")
        }:
            federacao = Orientacao(bancada, row["orientacao"])
    return federacao


def contra(voto: str | None, orientacao: Orientacao | None) -> bool:
    return (
        orientacao is not None
        and orientacao.orientacao in ORIENTACOES
        and voto in VOTOS
        and voto != orientacao.orientacao
    )


def _texto_voto(voto: str) -> str:
    return "em votação secreta" if voto == SECRETO else voto


def _titulo(nome: str, voto: str, ident: str | None, orientacao: Orientacao | None) -> str:
    texto = f"{nome} votou {_texto_voto(voto)}"
    if orientacao is not None:
        texto += f" contra a orientação da bancada {orientacao.bancada} ({orientacao.orientacao})"
    return f"{texto} — {ident}" if ident else texto


_CAMARA = """
SELECT v.id AS votacao_id, v.registrado_em, v.sigla_orgao, v.descricao, v.aprovacao,
  v.proposicao_principal_id, r.fetched_at, vo.id_camara, vo.voto, vo.sigla_partido,
  vo.sigla_uf, vo.registrado_em AS voto_em, d.nome_parlamentar
FROM canon.camara_votacao v
JOIN canon.camara_voto vo ON vo.votacao_id = v.id
LEFT JOIN canon.camara_deputado d ON d.id_camara = vo.id_camara
LEFT JOIN raw.raw_object r ON r.id = v.raw_object_id
WHERE v.nominal AND (vo.voto IS NULL OR vo.voto IN ('Sim', 'Não', 'Abstenção', 'Obstrução'))
ORDER BY v.id, vo.id_camara
"""

_SENADO = """
SELECT v.codigo_sessao_votacao, v.data_sessao, v.id_processo, v.identificacao, v.descricao,
  v.ementa, v.resultado, v.secreta, r.fetched_at, vo.codigo_parlamentar, vo.sigla_voto,
  vo.sigla_partido, vo.uf, s.nome_parlamentar
FROM canon.senado_votacao v
JOIN canon.senado_voto vo ON vo.codigo_sessao_votacao = v.codigo_sessao_votacao
LEFT JOIN canon.senado_senador s ON s.codigo_senado = vo.codigo_parlamentar
LEFT JOIN raw.raw_object r ON r.id = v.raw_object_id
WHERE vo.sigla_voto IN ('Sim', 'Não', 'Abstenção', 'Obstrução', 'Votou')
ORDER BY v.codigo_sessao_votacao, vo.codigo_parlamentar
"""


def _votos_camara(
    conn: pg8000.native.Connection, indices: Indices
) -> Iterator[tuple[bool, Evento]]:
    orientacoes: dict[str, list[dict[str, Any]]] = {}
    for row in rows_as_dicts(conn, "SELECT * FROM canon.camara_orientacao"):
        orientacoes.setdefault(row["votacao_id"], []).append(row)
    for row in rows_as_dicts(conn, _CAMARA):
        voto = row["voto"] or SECRETO
        orientacao = orientacao_do_partido(
            row["sigla_partido"], orientacoes.get(row["votacao_id"], [])
        )
        e_contra = contra(row["voto"], orientacao)
        proposicao = indices.proposicao("camara", row["proposicao_principal_id"])
        proposicao_id, ident = proposicao or (None, None)
        nome = row["nome_parlamentar"] or f"Deputado {row['id_camara']}"
        yield (
            e_contra,
            Evento(
                chave=f"camara:{row['votacao_id']}:{row['id_camara']}",
                ocorrido_em=momento(row["voto_em"] or row["registrado_em"]),
                titulo=_titulo(nome, voto, ident, orientacao if e_contra else None),
                resumo=resumir(row["descricao"]),
                payload={
                    "casa": "camara",
                    "votacao_id": row["votacao_id"],
                    "orgao": row["sigla_orgao"],
                    "voto": voto,
                    "partido": row["sigla_partido"],
                    "uf": row["sigla_uf"],
                    "proposicao": ident,
                    "aprovada": row["aprovacao"],
                    "orientacao": None
                    if orientacao is None
                    else {"bancada": orientacao.bancada, "orientacao": orientacao.orientacao},
                },
                alvos=(
                    *indices.pessoa("camara", row["id_camara"], "votante"),
                    *indices.partido(row["sigla_partido"]),
                    *indices.alvos_proposicao(proposicao_id),
                ),
                fonte_url=f"{CAMARA_API}/votacoes/{row['votacao_id']}/votos",
                fonte_dado_em=row["fetched_at"],
            ),
        )


def _votos_senado(conn: pg8000.native.Connection, indices: Indices) -> Iterator[Evento]:
    for row in rows_as_dicts(conn, _SENADO):
        voto = SECRETO if row["sigla_voto"] == "Votou" else row["sigla_voto"]
        proposicao = indices.proposicao("senado", row["id_processo"])
        proposicao_id, ident = proposicao or (None, row["identificacao"])
        nome = row["nome_parlamentar"] or f"Senador {row['codigo_parlamentar']}"
        data = row["data_sessao"]
        yield Evento(
            chave=f"senado:{row['codigo_sessao_votacao']}:{row['codigo_parlamentar']}",
            ocorrido_em=momento(data),
            titulo=_titulo(nome, voto, ident, None),
            resumo=resumir(row["descricao"] or row["ementa"]),
            payload={
                "casa": "senado",
                "votacao_id": row["codigo_sessao_votacao"],
                "voto": voto,
                "partido": row["sigla_partido"],
                "uf": row["uf"],
                "proposicao": ident,
                "resultado": row["resultado"],
                "secreta": row["secreta"],
            },
            alvos=(
                *indices.pessoa("senado", row["codigo_parlamentar"], "votante"),
                *indices.partido(row["sigla_partido"]),
                *indices.alvos_proposicao(proposicao_id),
            ),
            fonte_url=f"{SENADO_API}/votacao?dataInicio={data:%Y-%m-%d}&dataFim={data:%Y-%m-%d}",
            fonte_dado_em=row["fetched_at"],
        )


def gerar_votos(conn: pg8000.native.Connection) -> Iterator[Evento]:
    indices = carregar_indices(conn)
    yield from (evento for e_contra, evento in _votos_camara(conn, indices) if not e_contra)
    yield from _votos_senado(conn, indices)


def gerar_contra(conn: pg8000.native.Connection) -> Iterator[Evento]:
    indices = carregar_indices(conn)
    yield from (evento for e_contra, evento in _votos_camara(conn, indices) if e_contra)


GERADORES = [Gerador(REGRA_VOTO, gerar_votos), Gerador(REGRA_CONTRA, gerar_contra)]
