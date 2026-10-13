"""Eventos da Câmara (sessões, reuniões, audiências) e a pauta dos deliberativos."""

import hashlib
import json
import logging
from dataclasses import asdict, dataclass
from datetime import date, datetime
from typing import Any

import pg8000.native

from ..adapters.postgres import transaction, upsert_if_changed_sql
from ..http import SourceClient
from ..ports import RawRegistry, RawStorage
from .camara_deputados import API, SOURCE, _next_link

logger = logging.getLogger(__name__)

_DELIBERATIVO = ("deliberativa", "deliberação")


@dataclass(frozen=True)
class CamaraEvento:
    id: int
    inicio: datetime
    fim: datetime | None
    situacao: str | None
    tipo: str | None
    descricao: str | None
    local_externo: str | None
    local_camara: str | None
    url_registro: str | None
    id_orgao: int | None
    sigla_orgao: str | None

    @property
    def deliberativo(self) -> bool:
        tipo = (self.tipo or "").lower()
        return any(marca in tipo for marca in _DELIBERATIVO)


@dataclass(frozen=True)
class EventoOrgao:
    id_orgao: int
    sigla: str | None
    nome: str | None


@dataclass(frozen=True)
class PautaItem:
    ordem: int | None
    topico: str | None
    regime: str | None
    cod_regime: int | None
    titulo: str | None
    proposicao_id: int | None
    proposicao_sigla_tipo: str | None
    proposicao_numero: int | None
    proposicao_ano: int | None
    proposicao_ementa: str | None
    proposicao_relacionada_id: int | None
    relator_id: int | None
    relator_nome: str | None
    texto_parecer: str | None
    situacao_item: str | None
    votacao_id: str | None


@dataclass(frozen=True)
class EventoCompleto:
    evento: CamaraEvento
    orgaos: tuple[EventoOrgao, ...]
    pauta: tuple[PautaItem, ...]

    def content_hash(self) -> str:
        payload = json.dumps(asdict(self), default=str, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(payload.encode()).hexdigest()


def _text(value: Any) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text or None


def _int(value: Any) -> int | None:
    text = _text(value)
    return int(text) if text and text.lstrip("-").isdigit() else None


def _datetime(value: Any) -> datetime | None:
    return datetime.fromisoformat(value) if isinstance(value, str) and value else None


def _id_from_uri(uri: Any) -> str | None:
    """Último segmento de uma URI da API ("/votacoes/2551091-35/" -> "2551091-35")."""
    text = _text(uri)
    return text.rstrip("/").rsplit("/", 1)[-1] if text else None


def parse_evento(item: dict[str, Any]) -> tuple[CamaraEvento, list[EventoOrgao]]:
    """Converte um item de /eventos ou o detalhe de /eventos/{id}."""
    orgaos = [
        EventoOrgao(id_orgao=int(o["id"]), sigla=_text(o.get("sigla")), nome=_text(o.get("nome")))
        for o in item.get("orgaos") or []
    ]
    local = item.get("localCamara") or {}
    evento = CamaraEvento(
        id=int(item["id"]),
        inicio=datetime.fromisoformat(item["dataHoraInicio"]),
        fim=_datetime(item.get("dataHoraFim")),
        situacao=_text(item.get("situacao")),
        tipo=_text(item.get("descricaoTipo")),
        descricao=_text(item.get("descricao")),
        local_externo=_text(item.get("localExterno")),
        local_camara=_text(local.get("nome")),
        url_registro=_text(item.get("urlRegistro")),
        id_orgao=orgaos[0].id_orgao if orgaos else None,
        sigla_orgao=orgaos[0].sigla if orgaos else None,
    )
    return evento, orgaos


def parse_pauta(payload: dict[str, Any]) -> list[PautaItem]:
    """Converte /eventos/{id}/pauta, mantendo a ordem publicada."""
    itens = []
    for item in payload["dados"]:
        proposicao = item.get("proposicao_") or {}
        relacionada = item.get("proposicaoRelacionada_") or {}
        relator = item.get("relator") or {}
        itens.append(
            PautaItem(
                ordem=_int(item.get("ordem")),
                topico=_text(item.get("topico")),
                regime=_text(item.get("regime")),
                cod_regime=_int(item.get("codRegime")),
                titulo=_text(item.get("titulo")),
                proposicao_id=_int(proposicao.get("id")),
                proposicao_sigla_tipo=_text(proposicao.get("siglaTipo")),
                proposicao_numero=_int(proposicao.get("numero")),
                proposicao_ano=_int(proposicao.get("ano")),
                proposicao_ementa=_text(proposicao.get("ementa")),
                proposicao_relacionada_id=_int(relacionada.get("id")),
                relator_id=_int(relator.get("id")),
                relator_nome=_text(relator.get("nome")),
                texto_parecer=_text(item.get("textoParecer")),
                situacao_item=_text(item.get("situacaoItem")),
                votacao_id=_id_from_uri(item.get("uriVotacao")),
            )
        )
    return itens


@dataclass
class CollectStats:
    eventos: int = 0
    deliberativos: int = 0
    itens_pauta: int = 0
    alterados: int = 0


class CamaraEventoRepository:
    def __init__(self, conn: pg8000.native.Connection) -> None:
        self._conn = conn

    def upsert(self, completo: EventoCompleto, *, raw_object_id: Any) -> bool:
        values = asdict(completo.evento)
        values["deliberativo"] = completo.evento.deliberativo
        values["raw_object_id"] = raw_object_id
        values["content_hash"] = completo.content_hash()
        sql = upsert_if_changed_sql("canon.camara_evento", list(values), "id")
        id_evento = completo.evento.id
        with transaction(self._conn):
            if not self._conn.run(sql, **values):
                return False
            for table in ("canon.camara_evento_orgao", "canon.camara_pauta_item"):
                self._conn.run(
                    f"DELETE FROM {table} WHERE id_evento = :id",  # noqa: S608 - nome fixo
                    id=id_evento,
                )
            for orgao in completo.orgaos:
                self._conn.run(
                    "INSERT INTO canon.camara_evento_orgao (id_evento, id_orgao, sigla, nome)"
                    " VALUES (:id_evento, :id_orgao, :sigla, :nome) ON CONFLICT DO NOTHING",
                    id_evento=id_evento,
                    **asdict(orgao),
                )
            for posicao, item in enumerate(completo.pauta, start=1):
                values = asdict(item)
                columns = ["id_evento", "posicao", *values]
                self._conn.run(
                    f"INSERT INTO canon.camara_pauta_item ({', '.join(columns)})"  # noqa: S608
                    f" VALUES ({', '.join(':' + c for c in columns)})",
                    id_evento=id_evento,
                    posicao=posicao,
                    **values,
                )
        return True


def collect(
    client: SourceClient,
    storage: RawStorage,
    registry: RawRegistry,
    repository: CamaraEventoRepository,
    *,
    desde: date,
    ate: date,
) -> CollectStats:
    """Coleta os eventos do período e a pauta dos deliberativos."""
    stats = CollectStats()
    url: str | None = f"{API}/eventos"
    params: dict[str, Any] | None = {
        "dataInicio": desde.isoformat(),
        "dataFim": ate.isoformat(),
        "itens": 100,
        "ordem": "ASC",
        "ordenarPor": "dataHoraInicio",
    }
    listados: list[tuple[dict[str, Any], Any]] = []
    while url:
        response, stored = client.fetch_and_store(
            storage, registry, source=SOURCE, dataset="eventos-lista", url=url, params=params
        )
        page = response.json()
        listados.extend((item, stored) for item in page["dados"])
        url, params = _next_link(page), None

    vistos: set[int] = set()
    for item, stored in listados:
        evento, orgaos = parse_evento(item)
        if evento.id in vistos:
            continue
        vistos.add(evento.id)
        pauta: list[PautaItem] = []
        if evento.deliberativo:
            response, stored = client.fetch_and_store(
                storage,
                registry,
                source=SOURCE,
                dataset="evento-pauta",
                url=f"{API}/eventos/{evento.id}/pauta",
            )
            pauta = parse_pauta(response.json())
            stats.deliberativos += 1
            stats.itens_pauta += len(pauta)
        stats.eventos += 1
        completo = EventoCompleto(evento, tuple(orgaos), tuple(pauta))
        if repository.upsert(completo, raw_object_id=stored.raw.id):
            stats.alterados += 1

    logger.info("camara-eventos: %s", stats)
    return stats
