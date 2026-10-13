"""Histórico dos deputados (posses, saídas, licenças, trocas de partido) e legislaturas."""

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import pg8000.native

from ..adapters.postgres import transaction
from ..http import SourceClient
from ..ports import RawRegistry, RawStorage
from .camara_deputados import API, SOURCE

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EventoHistorico:
    id_camara: int
    data_hora: datetime
    id_legislatura: int
    sigla_partido: str | None
    sigla_uf: str | None
    situacao: str
    condicao_eleitoral: str | None
    descricao_status: str


def parse_historico(payload: dict[str, Any]) -> list[EventoHistorico]:
    """Eventos reais do histórico. Linhas sem situação são marcadores internos da
    Câmara (ex.: "Nome no início da legislatura") e são descartadas."""
    eventos = []
    for item in payload["dados"]:
        if not item.get("situacao"):
            continue
        eventos.append(
            EventoHistorico(
                id_camara=int(item["id"]),
                data_hora=datetime.fromisoformat(item["dataHora"]),
                id_legislatura=int(item["idLegislatura"]),
                sigla_partido=item.get("siglaPartido") or None,
                sigla_uf=item.get("siglaUf") or None,
                situacao=item["situacao"],
                condicao_eleitoral=item.get("condicaoEleitoral") or None,
                descricao_status=(item.get("descricaoStatus") or "").strip() or item["situacao"],
            )
        )
    return eventos


@dataclass
class CollectStats:
    legislaturas: int = 0
    deputados: int = 0
    eventos: int = 0
    eventos_novos: int = 0


class CamaraHistoricoRepository:
    def __init__(self, conn: pg8000.native.Connection) -> None:
        self._conn = conn

    def ids_deputados(self) -> list[int]:
        return [
            row[0]
            for row in self._conn.run(
                "SELECT id_camara FROM canon.camara_deputado ORDER BY id_camara"
            )
        ]

    def save_legislaturas(self, legislaturas: list[dict[str, Any]]) -> None:
        with transaction(self._conn):
            for leg in legislaturas:
                self._conn.run(
                    "INSERT INTO canon.legislatura (id, inicio, fim) VALUES (:id, :inicio, :fim)"
                    " ON CONFLICT (id) DO UPDATE SET inicio = EXCLUDED.inicio, fim = EXCLUDED.fim",
                    id=int(leg["id"]),
                    inicio=datetime.fromisoformat(leg["dataInicio"]).date(),
                    fim=datetime.fromisoformat(leg["dataFim"]).date(),
                )

    def save_eventos(self, eventos: list[EventoHistorico]) -> int:
        novos = 0
        with transaction(self._conn):
            for evento in eventos:
                novos += len(
                    self._conn.run(
                        "INSERT INTO canon.camara_historico (id_camara, data_hora, id_legislatura,"
                        " sigla_partido, sigla_uf, situacao, condicao_eleitoral, descricao_status)"
                        " VALUES (:id_camara, :data_hora, :id_legislatura, :sigla_partido,"
                        " :sigla_uf, :situacao, :condicao_eleitoral, :descricao_status)"
                        " ON CONFLICT DO NOTHING RETURNING 1",
                        **evento.__dict__,
                    )
                )
        return novos


def collect(
    client: SourceClient,
    storage: RawStorage,
    registry: RawRegistry,
    repository: CamaraHistoricoRepository,
) -> CollectStats:
    stats = CollectStats()
    response, _ = client.fetch_and_store(
        storage,
        registry,
        source=SOURCE,
        dataset="legislaturas",
        url=f"{API}/legislaturas",
        params={"itens": 100},
    )
    legislaturas = response.json()["dados"]
    repository.save_legislaturas(legislaturas)
    stats.legislaturas = len(legislaturas)

    for id_camara in repository.ids_deputados():
        response, _ = client.fetch_and_store(
            storage,
            registry,
            source=SOURCE,
            dataset="deputados-historico",
            url=f"{API}/deputados/{id_camara}/historico",
        )
        eventos = parse_historico(response.json())
        stats.deputados += 1
        stats.eventos += len(eventos)
        stats.eventos_novos += repository.save_eventos(eventos)

    logger.info("camara-historico: %s", stats)
    return stats
