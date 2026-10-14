"""Consultas e textos compartilhados pelos geradores de eventos."""

import unicodedata
from dataclasses import dataclass, field
from decimal import Decimal

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


def reais(valor: Decimal) -> str:
    """Valor em reais no formato brasileiro: R$ 1.234,56."""
    texto = f"{valor:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return f"R$ {texto}"


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
    materias: dict[str, tuple[str, str]] = field(default_factory=dict)
    autores_por_proposicao: dict[str, list[str]] = field(default_factory=dict)

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

    def materia(self, codigo_materia: object) -> tuple[str, str] | None:
        """Proposição do Senado pelo código da matéria (pautas antigas não citam o processo)."""
        return None if codigo_materia is None else self.materias.get(str(codigo_materia))

    def autores(self, proposicao_id: str | None) -> list[Alvo]:
        """Parlamentares autores (só os que a casa identifica por id próprio)."""
        return [
            Alvo("pessoa", pessoa_id, "autor")
            for pessoa_id in self.autores_por_proposicao.get(proposicao_id or "", [])
        ]

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
        conn,
        "SELECT id::text AS id, casa, id_fonte, identificacao, codigo_materia"
        " FROM canon.proposicao ORDER BY atualizado_em, id",
    ):
        par = (row["id"], row["identificacao"])
        indices.proposicoes[(row["casa"], row["id_fonte"])] = par
        if row["casa"] == "senado" and row["codigo_materia"] is not None:
            indices.materias[str(row["codigo_materia"])] = par
    # Câmara: "Deputado(a)" com id da Câmara; Senado: "SENADOR" com código do Senado.
    # Deputados autores de matérias no Senado vêm com código interno do Senado: ficam de fora.
    for proposicao_id, casa, id_fonte in conn.run(
        "SELECT a.proposicao_id::text, p.casa, a.id_fonte FROM canon.proposicao_autor a"
        " JOIN canon.proposicao p ON p.id = a.proposicao_id"
        " WHERE a.id_fonte IS NOT NULL AND ((p.casa = 'camara' AND a.tipo = 'Deputado(a)')"
        " OR (p.casa = 'senado' AND a.tipo = 'SENADOR')) ORDER BY 1, a.ordem"
    ):
        pessoa_id = indices.pessoas.get((casa, id_fonte))
        if pessoa_id:
            indices.autores_por_proposicao.setdefault(proposicao_id, []).append(pessoa_id)
    for proposicao_id, tema in conn.run(
        "SELECT proposicao_id::text, tema FROM canon.proposicao_tema ORDER BY 1, relevancia, 2"
    ):
        indices.temas.setdefault(proposicao_id, []).append(tema)
    return indices
