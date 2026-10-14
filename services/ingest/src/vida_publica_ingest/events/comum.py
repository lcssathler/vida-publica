"""Consultas e textos compartilhados pelos geradores de eventos."""

import unicodedata
from dataclasses import dataclass, field

import pg8000.native

from ..adapters.postgres import rows_as_dicts
from .engine import Alvo

CAMARA_API = "https://dadosabertos.camara.leg.br/api/v2"
SENADO_API = "https://legis.senado.leg.br/dadosabertos"

# Siglas que a fonte escreve diferente de canon.partido.
_ALIAS_PARTIDO = {"PODEMOS": "PODE"}
_SEM_PARTIDO = {"S/PARTIDO", "SPARTIDO", "SEMPARTIDO", ""}

_RESUMO_MAX = 500


def normalizar_sigla(sigla: str | None) -> str:
    texto = unicodedata.normalize("NFKD", sigla or "")
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = texto.upper().replace(" ", "")
    return _ALIAS_PARTIDO.get(texto, texto)


def resumir(texto: str | None, limite: int = _RESUMO_MAX) -> str | None:
    """Texto da fonte em uma linha, cortado no limite sem partir palavra."""
    limpo = " ".join((texto or "").split())
    if not limpo:
        return None
    if len(limpo) <= limite:
        return limpo
    corte = limpo[: limite - 1].rsplit(" ", 1)[0]
    return corte + "…"


@dataclass
class Indices:
    """Mapas de ids das fontes para os ids canônicos usados nos alvos."""

    pessoas: dict[tuple[str, str], str] = field(default_factory=dict)
    partidos: dict[str, int] = field(default_factory=dict)
    proposicoes: dict[tuple[str, str], tuple[str, str]] = field(default_factory=dict)
    temas: dict[str, list[str]] = field(default_factory=dict)

    def pessoa(self, fonte: str, id_fonte: object, papel: str) -> list[Alvo]:
        pessoa_id = self.pessoas.get((fonte, str(id_fonte)))
        return [Alvo("pessoa", pessoa_id, papel)] if pessoa_id else []

    def partido_id(self, sigla: str | None) -> int | None:
        norma = normalizar_sigla(sigla)
        return None if norma in _SEM_PARTIDO else self.partidos.get(norma)

    def partido(self, sigla: str | None, papel: str = "") -> list[Alvo]:
        partido_id = self.partido_id(sigla)
        return [Alvo("partido", str(partido_id), papel)] if partido_id else []

    def proposicao(self, casa: str, id_fonte: object) -> tuple[str, str] | None:
        """(id canônico, identificação) da proposição, se coletada."""
        if id_fonte is None:
            return None
        return self.proposicoes.get((casa, str(id_fonte)))

    def alvos_proposicao(self, proposicao_id: str | None) -> list[Alvo]:
        if proposicao_id is None:
            return []
        return [Alvo("proposicao", proposicao_id)] + [
            Alvo("assunto", tema) for tema in self.temas.get(proposicao_id, [])
        ]


def carregar_indices(conn: pg8000.native.Connection) -> Indices:
    indices = Indices()
    for row in conn.run("SELECT fonte, id_fonte, pessoa_id::text FROM canon.pessoa_vinculo"):
        indices.pessoas[(row[0], row[1])] = row[2]
    # sigla mais recente vence: o número 14 já foi do PTB e hoje é do Missão
    for sigla, partido_id in conn.run(
        "SELECT DISTINCT ON (sigla_normalizada) sigla_normalizada, id FROM canon.partido"
        " ORDER BY sigla_normalizada, ultimo_ano DESC NULLS LAST, id DESC"
    ):
        indices.partidos[sigla] = partido_id
    for row in rows_as_dicts(
        conn, "SELECT id::text AS id, casa, id_fonte, identificacao FROM canon.proposicao"
    ):
        indices.proposicoes[(row["casa"], row["id_fonte"])] = (row["id"], row["identificacao"])
    for proposicao_id, tema in conn.run(
        "SELECT proposicao_id::text, tema FROM canon.proposicao_tema ORDER BY 1, relevancia, 2"
    ):
        indices.temas.setdefault(proposicao_id, []).append(tema)
    return indices
