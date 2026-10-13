"""Presença de deputados: por evento (API) e, opcionalmente, por dia com justificativa
(serviço legado SitCamaraWS, em XML)."""

import logging
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from uuid import UUID

import pg8000.native

from ..adapters.postgres import rows_as_dicts, transaction
from ..http import SourceClient
from ..ports import RawRegistry, RawStorage
from .camara_deputados import API, SOURCE

logger = logging.getLogger(__name__)

LEGADO = "https://www.camara.leg.br/SitCamaraWS"


def parse_presentes(payload: dict[str, Any]) -> list[int]:
    """Ids dos deputados presentes em /eventos/{id}/deputados."""
    return sorted({int(item["id"]) for item in payload["dados"]})


@dataclass(frozen=True)
class PresencaDia:
    matricula: int
    nome: str
    frequencia: str
    justificativa: str | None
    presenca_externa: bool
    sessoes: int
    sessoes_presente: int


def _clean(value: str | None) -> str | None:
    text = (value or "").strip()
    return text or None


def parse_presencas_dia(xml: bytes) -> tuple[date | None, list[PresencaDia]]:
    """Converte ListarPresencasDia. Dia sem sessão vem como <dia /> vazio."""
    root = ET.fromstring(xml)  # noqa: S314 - XML da fonte oficial, sem entidades externas
    data_texto = _clean(root.findtext("data"))
    if not data_texto:
        return None, []
    dia = datetime.strptime(data_texto[:10], "%d/%m/%Y").date()
    presencas = []
    for item in root.iter("parlamentar"):
        sessoes = [s for s in item.iter("sessaoDia")]
        presencas.append(
            PresencaDia(
                matricula=int(item.findtext("carteiraParlamentar") or 0),
                nome=_clean(item.findtext("nomeParlamentar")) or "",
                frequencia=_clean(item.findtext("descricaoFrequenciaDia")) or "",
                justificativa=_clean(item.findtext("justificativa")),
                presenca_externa=(item.findtext("presencaExterna") or "0").strip() == "1",
                sessoes=len(sessoes),
                sessoes_presente=sum(
                    (s.findtext("frequencia") or "").strip() == "Presença" for s in sessoes
                ),
            )
        )
    return dia, presencas


def parse_matriculas(xml: bytes) -> dict[int, int]:
    """Matrícula -> id da Câmara, a partir de ObterDeputados (deputados em exercício)."""
    root = ET.fromstring(xml)  # noqa: S314 - XML da fonte oficial, sem entidades externas
    return {
        int(d.findtext("matricula")): int(d.findtext("ideCadastro"))
        for d in root.iter("deputado")
        if (d.findtext("matricula") or "").isdigit() and (d.findtext("ideCadastro") or "").isdigit()
    }


@dataclass
class CollectStats:
    eventos: int = 0
    presencas: int = 0
    presencas_novas: int = 0
    dias_legado: int = 0
    registros_legado: int = 0
    sem_matricula: int = 0


class CamaraPresencaRepository:
    def __init__(self, conn: pg8000.native.Connection) -> None:
        self._conn = conn

    def eventos_deliberativos(self, desde: date, ate: date) -> list[int]:
        rows = self._conn.run(
            "SELECT id FROM canon.camara_evento WHERE deliberativo AND inicio::date BETWEEN"
            " :desde AND :ate AND situacao NOT ILIKE 'Cancelada%' ORDER BY inicio, id",
            desde=desde,
            ate=ate,
        )
        return [row[0] for row in rows]

    def dias_de_plenario(self, desde: date, ate: date) -> list[date]:
        rows = self._conn.run(
            "SELECT DISTINCT inicio::date FROM canon.camara_evento WHERE sigla_orgao = 'PLEN'"
            " AND deliberativo AND inicio::date BETWEEN :desde AND :ate ORDER BY 1",
            desde=desde,
            ate=ate,
        )
        return [row[0] for row in rows]

    def nomes_parlamentares(self) -> dict[str, int]:
        """Nome parlamentar -> id, só para nomes únicos (reserva para matrícula ausente)."""
        rows = rows_as_dicts(
            self._conn,
            "SELECT lower(nome_parlamentar) AS nome, min(id_camara) AS id, count(*) AS n"
            " FROM canon.camara_deputado GROUP BY 1 HAVING count(*) = 1",
        )
        return {row["nome"]: row["id"] for row in rows}

    def save_presentes(self, id_evento: int, ids: list[int]) -> int:
        novos = 0
        with transaction(self._conn):
            for id_camara in ids:
                novos += len(
                    self._conn.run(
                        "INSERT INTO canon.camara_presenca (id_evento, id_camara)"
                        " VALUES (:evento, :deputado) ON CONFLICT DO NOTHING RETURNING 1",
                        evento=id_evento,
                        deputado=id_camara,
                    )
                )
        return novos

    def save_dia(
        self, dia: date, registros: list[tuple[int, PresencaDia]], *, raw_object_id: UUID | None
    ) -> None:
        with transaction(self._conn):
            for id_camara, p in registros:
                self._conn.run(
                    "INSERT INTO canon.camara_presenca_dia (data, id_camara, frequencia,"
                    " justificativa, presenca_externa, sessoes, sessoes_presente, raw_object_id)"
                    " VALUES (:data, :id, :freq, :just, :ext, :sessoes, :presente, :raw)"
                    " ON CONFLICT (data, id_camara) DO UPDATE SET frequencia = EXCLUDED.frequencia,"
                    " justificativa = EXCLUDED.justificativa,"
                    " presenca_externa = EXCLUDED.presenca_externa, sessoes = EXCLUDED.sessoes,"
                    " sessoes_presente = EXCLUDED.sessoes_presente,"
                    " raw_object_id = EXCLUDED.raw_object_id, atualizado_em = now()",
                    data=dia,
                    id=id_camara,
                    freq=p.frequencia,
                    just=p.justificativa,
                    ext=p.presenca_externa,
                    sessoes=p.sessoes,
                    presente=p.sessoes_presente,
                    raw=raw_object_id,
                )


def _nome_base(nome: str) -> str:
    """ "Acácio Favacho-MDB/AP" -> "acácio favacho"."""
    return nome.rsplit("-", 1)[0].strip().lower() if "-" in nome else nome.strip().lower()


def collect(
    client: SourceClient,
    storage: RawStorage,
    registry: RawRegistry,
    repository: CamaraPresencaRepository,
    *,
    desde: date,
    ate: date,
    legado: bool = False,
) -> CollectStats:
    """Presença por evento deliberativo já coletado; com `legado`, também a
    frequência diária do Plenário com justificativas."""
    stats = CollectStats()
    for id_evento in repository.eventos_deliberativos(desde, ate):
        response, _ = client.fetch_and_store(
            storage,
            registry,
            source=SOURCE,
            dataset="evento-presentes",
            url=f"{API}/eventos/{id_evento}/deputados",
        )
        presentes = parse_presentes(response.json())
        stats.eventos += 1
        stats.presencas += len(presentes)
        stats.presencas_novas += repository.save_presentes(id_evento, presentes)

    if legado:
        dias = repository.dias_de_plenario(desde, ate)
        if dias:
            response, _ = client.fetch_and_store(
                storage,
                registry,
                source=SOURCE,
                dataset="legado-deputados",
                url=f"{LEGADO}/Deputados.asmx/ObterDeputados",
            )
            matriculas = parse_matriculas(response.content)
            nomes = repository.nomes_parlamentares()
        for dia in dias:
            response, stored = client.fetch_and_store(
                storage,
                registry,
                source=SOURCE,
                dataset="legado-presencas-dia",
                url=f"{LEGADO}/SessoesReunioes.asmx/ListarPresencasDia",
                params={
                    "data": dia.strftime("%d/%m/%Y"),
                    "numMatriculaParlamentar": "",
                    "siglaPartido": "",
                    "siglaUF": "",
                },
            )
            data_xml, presencas = parse_presencas_dia(response.content)
            if data_xml is None:
                continue
            registros = []
            for p in presencas:
                id_camara = matriculas.get(p.matricula) or nomes.get(_nome_base(p.nome))
                if id_camara is None:
                    stats.sem_matricula += 1
                    continue
                registros.append((id_camara, p))
            repository.save_dia(data_xml, registros, raw_object_id=stored.raw.id)
            stats.dias_legado += 1
            stats.registros_legado += len(registros)

    logger.info("camara-presenca: %s", stats)
    return stats
