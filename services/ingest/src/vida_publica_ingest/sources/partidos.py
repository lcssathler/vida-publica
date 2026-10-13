"""Partidos: identidade, siglas ao longo do tempo e sucessões.

Fontes: candidaturas do TSE (número, sigla e nome por eleição) e a lista de
partidos da Câmara (id usado nas votações e nos deputados).
"""

import logging
from dataclasses import dataclass, field
from itertools import pairwise
from typing import Any

import pg8000.native

from ..adapters.postgres import rows_as_dicts, transaction
from ..http import SourceClient
from ..identity import normalize_name
from ..ports import RawRegistry, RawStorage

logger = logging.getLogger(__name__)

CAMARA_API = "https://dadosabertos.camara.leg.br/api/v2"


def normalize_sigla(sigla: str) -> str:
    """'PC do B', 'PCdoB' e 'PCDOB' viram 'PCDOB'; 'UNIÃO' vira 'UNIAO'."""
    return normalize_name(sigla).replace(" ", "")


@dataclass(frozen=True)
class Sucessao:
    numero_antigo: int
    sigla_antiga: str
    numero_novo: int
    sigla_nova: str
    tipo: str
    ano: int


# Fusões, incorporações e mudanças de número desde 2018, que não se deduzem só
# dos dados (o número ou a sigla mudam). Renomeações com o mesmo número são
# inferidas automaticamente em `infer_renames`.
SUCESSOES_CURADAS = (
    Sucessao(31, "PHS", 19, "PODE", "incorporacao", 2019),
    Sucessao(44, "PRP", 51, "PATRIOTA", "incorporacao", 2019),
    Sucessao(54, "PPL", 65, "PCDOB", "incorporacao", 2019),
    Sucessao(17, "PSL", 44, "UNIAO", "fusao", 2022),
    Sucessao(25, "DEM", 44, "UNIAO", "fusao", 2022),
    Sucessao(14, "PTB", 25, "PRD", "fusao", 2023),
    Sucessao(51, "PATRIOTA", 25, "PRD", "fusao", 2023),
    Sucessao(90, "PROS", 77, "SOLIDARIEDADE", "incorporacao", 2023),
    Sucessao(20, "PSC", 20, "PODE", "incorporacao", 2023),
    Sucessao(19, "PODE", 20, "PODE", "mudanca_numero", 2023),
)


# Número reaproveitado por um partido novo, sem relação com o anterior.
REUSO_SEM_SUCESSAO = {14: {"PTB"}, 25: {"DEM"}, 44: {"PRP"}}


@dataclass
class PartidoObservado:
    numero_tse: int
    sigla: str
    nome: str | None
    primeiro_ano: int
    ultimo_ano: int
    id_camara: int | None = None

    @property
    def chave(self) -> tuple[int, str]:
        return (self.numero_tse, normalize_sigla(self.sigla))


def aggregate(rows: list[dict[str, Any]]) -> dict[tuple[int, str], PartidoObservado]:
    """Junta as linhas (nr_partido, sg_partido, nm_partido, ano) por número e sigla."""
    partidos: dict[tuple[int, str], PartidoObservado] = {}
    for row in rows:
        if row["nr_partido"] is None or not row["sg_partido"]:
            continue
        observado = PartidoObservado(
            numero_tse=row["nr_partido"],
            sigla=row["sg_partido"],
            nome=row["nm_partido"],
            primeiro_ano=row["ano"],
            ultimo_ano=row["ano"],
        )
        atual = partidos.get(observado.chave)
        if atual is None:
            partidos[observado.chave] = observado
            continue
        atual.primeiro_ano = min(atual.primeiro_ano, observado.primeiro_ano)
        if observado.ultimo_ano >= atual.ultimo_ano:
            atual.ultimo_ano = observado.ultimo_ano
            atual.sigla, atual.nome = observado.sigla, observado.nome or atual.nome
    return partidos


def infer_renames(partidos: dict[tuple[int, str], PartidoObservado]) -> list[Sucessao]:
    """Mesmo número, sigla diferente e sem sobreposição no tempo: renomeação.

    Ex.: PRB (10) até 2018 e REPUBLICANOS (10) depois. Números reaproveitados por
    partidos sem relação (PTB → MISSÃO, ambos 14) estão nas sucessões curadas e
    têm precedência.
    """
    curadas = {(s.numero_antigo, s.sigla_antiga) for s in SUCESSOES_CURADAS}
    por_numero: dict[int, list[PartidoObservado]] = {}
    for partido in partidos.values():
        por_numero.setdefault(partido.numero_tse, []).append(partido)
    inferidas = []
    for numero, lista in por_numero.items():
        lista.sort(key=lambda p: (p.primeiro_ano, p.ultimo_ano))
        for antigo, novo in pairwise(lista):
            if antigo.chave in curadas or antigo.ultimo_ano > novo.primeiro_ano:
                continue
            if antigo.chave[1] in REUSO_SEM_SUCESSAO.get(numero, set()):
                continue
            inferidas.append(
                Sucessao(
                    numero, antigo.chave[1], numero, novo.chave[1], "renomeacao", novo.primeiro_ano
                )
            )
    return inferidas


@dataclass
class BuildStats:
    partidos: int = 0
    com_id_camara: int = 0
    sucessoes: int = 0
    sucessoes_inferidas: list[str] = field(default_factory=list)


class PartidoRepository:
    def __init__(self, conn: pg8000.native.Connection) -> None:
        self._conn = conn

    def tse_rows(self) -> list[dict[str, Any]]:
        return rows_as_dicts(
            self._conn,
            "SELECT nr_partido, sg_partido, max(nm_partido) AS nm_partido,"
            " ano_eleicao::int AS ano FROM canon.tse_candidatura"
            " GROUP BY nr_partido, sg_partido, ano_eleicao",
        )

    def save(self, partidos: list[PartidoObservado], sucessoes: list[tuple[Sucessao, bool]]) -> int:
        with transaction(self._conn):
            for partido in partidos:
                self._conn.run(
                    "INSERT INTO canon.partido (numero_tse, sigla, sigla_normalizada, nome,"
                    " primeiro_ano, ultimo_ano, id_camara) VALUES (:numero, :sigla, :norm, :nome,"
                    " :primeiro, :ultimo, :id_camara) ON CONFLICT (numero_tse, sigla_normalizada)"
                    " DO UPDATE SET sigla = EXCLUDED.sigla, nome = EXCLUDED.nome,"
                    " primeiro_ano = EXCLUDED.primeiro_ano, ultimo_ano = EXCLUDED.ultimo_ano,"
                    " id_camara = EXCLUDED.id_camara, atualizado_em = now()",
                    numero=partido.numero_tse,
                    sigla=partido.sigla,
                    norm=normalize_sigla(partido.sigla),
                    nome=partido.nome,
                    primeiro=partido.primeiro_ano,
                    ultimo=partido.ultimo_ano,
                    id_camara=partido.id_camara,
                )
            aplicadas = 0
            for sucessao, inferida in sucessoes:
                aplicadas += len(
                    self._conn.run(
                        "UPDATE canon.partido antigo SET sucessor_id = novo.id,"
                        " tipo_sucessao = :tipo, ano_sucessao = :ano,"
                        " sucessao_inferida = :inferida"
                        " FROM canon.partido novo"
                        " WHERE antigo.numero_tse = :na AND antigo.sigla_normalizada = :sa"
                        " AND novo.numero_tse = :nn AND novo.sigla_normalizada = :sn"
                        " RETURNING antigo.id",
                        tipo=sucessao.tipo,
                        ano=sucessao.ano,
                        inferida=inferida,
                        na=sucessao.numero_antigo,
                        sa=normalize_sigla(sucessao.sigla_antiga),
                        nn=sucessao.numero_novo,
                        sn=normalize_sigla(sucessao.sigla_nova),
                    )
                )
        return aplicadas


def build(
    client: SourceClient,
    storage: RawStorage,
    registry: RawRegistry,
    repository: PartidoRepository,
) -> BuildStats:
    """Reconstrói canon.partido a partir das candidaturas e da lista da Câmara."""
    response, _ = client.fetch_and_store(
        storage,
        registry,
        source="camara",
        dataset="partidos",
        url=f"{CAMARA_API}/partidos",
        params={"itens": 100, "ordem": "ASC", "ordenarPor": "sigla"},
    )
    camara = {normalize_sigla(p["sigla"]): int(p["id"]) for p in response.json()["dados"]}

    partidos = aggregate(repository.tse_rows())
    ultimo_ano = max((p.ultimo_ano for p in partidos.values()), default=0)
    for partido in partidos.values():
        if partido.ultimo_ano == ultimo_ano:
            partido.id_camara = camara.get(normalize_sigla(partido.sigla))

    inferidas = infer_renames(partidos)
    sucessoes = [(s, False) for s in SUCESSOES_CURADAS] + [(s, True) for s in inferidas]
    stats = BuildStats(
        partidos=len(partidos),
        com_id_camara=sum(p.id_camara is not None for p in partidos.values()),
        sucessoes_inferidas=[f"{s.sigla_antiga}→{s.sigla_nova}" for s in inferidas],
    )
    stats.sucessoes = repository.save(list(partidos.values()), sucessoes)
    logger.info("partidos: %s", stats)
    return stats
