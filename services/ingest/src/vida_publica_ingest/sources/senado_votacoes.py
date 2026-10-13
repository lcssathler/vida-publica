"""Votações nominais do Senado Federal, com o voto ou o motivo da ausência de cada senador."""

import hashlib
import json
import logging
from dataclasses import asdict, dataclass
from datetime import date
from typing import Any

import pg8000.native

from ..adapters.postgres import transaction, upsert_if_changed_sql
from ..http import SourceClient
from ..ports import RawRegistry, RawStorage
from .camara_votacoes import windows
from .senado_senadores import API, SOURCE, _text

logger = logging.getLogger(__name__)

# Códigos que indicam presença na votação; os demais são motivos de ausência.
PRESENTE = {"Sim", "Não", "Abstenção", "Votou", "P-NRV", "NA", "Presidente (art. 51 RISF)"}


@dataclass(frozen=True)
class SenadoVotacao:
    codigo_sessao_votacao: int
    sequencial_votacao: int | None
    codigo_sessao: int
    numero_sessao: int | None
    sigla_tipo_sessao: str | None
    casa_sessao: str | None
    data_sessao: date
    codigo_sessao_legislativa: int | None
    id_processo: int | None
    codigo_materia: int | None
    identificacao: str | None
    sigla: str | None
    numero: str | None
    ano: int | None
    ementa: str | None
    descricao: str | None
    resultado: str | None
    secreta: bool
    total_sim: int | None
    total_nao: int | None
    total_abstencao: int | None
    informe_id: int | None
    informe_texto: str | None


@dataclass(frozen=True)
class SenadoVoto:
    codigo_parlamentar: int
    sigla_voto: str
    descricao_voto: str | None
    sigla_partido: str | None
    uf: str | None

    @property
    def presente(self) -> bool:
        return self.sigla_voto in PRESENTE


@dataclass(frozen=True)
class VotacaoCompleta:
    votacao: SenadoVotacao
    votos: tuple[SenadoVoto, ...]

    def content_hash(self) -> str:
        payload = json.dumps(asdict(self), default=str, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(payload.encode()).hexdigest()


def _int(value: Any) -> int | None:
    text = _text(value)
    return int(text) if text and text.lstrip("-").isdigit() else None


def parse_votacao(item: dict[str, Any]) -> VotacaoCompleta:
    """Converte um item de /votacao. Senadores repetidos ficam com o último voto listado."""
    informe = item.get("informeLegislativo") or {}
    votacao = SenadoVotacao(
        codigo_sessao_votacao=int(item["codigoSessaoVotacao"]),
        sequencial_votacao=_int(item.get("sequencialVotacao")),
        codigo_sessao=int(item["codigoSessao"]),
        numero_sessao=_int(item.get("numeroSessao")),
        sigla_tipo_sessao=_text(item.get("siglaTipoSessao")),
        casa_sessao=_text(item.get("casaSessao")),
        data_sessao=date.fromisoformat(str(item["dataSessao"])[:10]),
        codigo_sessao_legislativa=_int(item.get("codigoSessaoLegislativa")),
        id_processo=_int(item.get("idProcesso")),
        codigo_materia=_int(item.get("codigoMateria")),
        identificacao=_text(item.get("identificacao")),
        sigla=_text(item.get("sigla")),
        numero=_text(item.get("numero")),
        ano=_int(item.get("ano")),
        ementa=_text(item.get("ementa")),
        descricao=_text(item.get("descricaoVotacao")),
        resultado=_text(item.get("resultadoVotacao")),
        secreta=_text(item.get("votacaoSecreta")) == "S",
        total_sim=_int(item.get("totalVotosSim")),
        total_nao=_int(item.get("totalVotosNao")),
        total_abstencao=_int(item.get("totalVotosAbstencao")),
        informe_id=_int(informe.get("id")),
        informe_texto=_text(informe.get("texto")),
    )
    votos: dict[int, SenadoVoto] = {}
    for voto in item.get("votos") or []:
        codigo = int(voto["codigoParlamentar"])
        votos[codigo] = SenadoVoto(
            codigo_parlamentar=codigo,
            sigla_voto=_text(voto.get("siglaVotoParlamentar")) or "",
            descricao_voto=_text(voto.get("descricaoVotoParlamentar")),
            sigla_partido=_text(voto.get("siglaPartidoParlamentar")),
            uf=_text(voto.get("siglaUFParlamentar")),
        )
    return VotacaoCompleta(votacao, tuple(votos.values()))


@dataclass
class CollectStats:
    votacoes: int = 0
    secretas: int = 0
    votos: int = 0
    ausencias: int = 0
    alteradas: int = 0


class SenadoVotacaoRepository:
    def __init__(self, conn: pg8000.native.Connection) -> None:
        self._conn = conn

    def upsert(self, completa: VotacaoCompleta, *, raw_object_id: Any) -> bool:
        values = asdict(completa.votacao)
        values["raw_object_id"] = raw_object_id
        values["content_hash"] = completa.content_hash()
        sql = upsert_if_changed_sql("canon.senado_votacao", list(values), "codigo_sessao_votacao")
        codigo = completa.votacao.codigo_sessao_votacao
        with transaction(self._conn):
            if not self._conn.run(sql, **values):
                return False
            self._conn.run(
                "DELETE FROM canon.senado_voto WHERE codigo_sessao_votacao = :codigo", codigo=codigo
            )
            for voto in completa.votos:
                self._conn.run(
                    "INSERT INTO canon.senado_voto (codigo_sessao_votacao, codigo_parlamentar,"
                    " sigla_voto, descricao_voto, sigla_partido, uf)"
                    " VALUES (:codigo, :codigo_parlamentar, :sigla_voto, :descricao_voto,"
                    " :sigla_partido, :uf)",
                    codigo=codigo,
                    **asdict(voto),
                )
        return True


def collect(
    client: SourceClient,
    storage: RawStorage,
    registry: RawRegistry,
    repository: SenadoVotacaoRepository,
    *,
    desde: date,
    ate: date,
) -> CollectStats:
    """Coleta as votações nominais do período, com votos e ausências."""
    stats = CollectStats()
    for inicio, fim in windows(desde, ate):
        response, stored = client.fetch_and_store(
            storage,
            registry,
            source=SOURCE,
            dataset="votacoes",
            url=f"{API}/votacao",
            params={"dataInicio": inicio.isoformat(), "dataFim": fim.isoformat()},
        )
        for item in response.json():
            completa = parse_votacao(item)
            stats.votacoes += 1
            stats.secretas += completa.votacao.secreta
            stats.votos += len(completa.votos)
            stats.ausencias += sum(not voto.presente for voto in completa.votos)
            if repository.upsert(completa, raw_object_id=stored.raw.id):
                stats.alteradas += 1
    logger.info("senado-votacoes: %s", stats)
    return stats
