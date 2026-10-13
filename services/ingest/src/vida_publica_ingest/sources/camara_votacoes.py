"""Votações da Câmara dos Deputados: votações, votos nominais e orientações de bancada."""

import hashlib
import json
import logging
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta
from typing import Any

import pg8000.native

from ..adapters.postgres import transaction, upsert_if_changed_sql
from ..http import SourceClient
from ..ports import RawRegistry, RawStorage
from .camara_deputados import API, SOURCE, _next_link

logger = logging.getLogger(__name__)

# A API recusa intervalos maiores que 3 meses; coletamos em janelas menores.
MAX_WINDOW_DAYS = 80


@dataclass(frozen=True)
class CamaraVotacao:
    id: str
    data: date
    registrado_em: datetime
    id_orgao: int | None
    sigla_orgao: str | None
    id_evento: int | None
    descricao: str | None
    aprovacao: bool | None
    abertura_descricao: str | None
    abertura_em: datetime | None
    proposicao_principal_id: int | None


@dataclass(frozen=True)
class VotacaoProposicao:
    proposicao_id: int
    papel: str
    sigla_tipo: str | None
    numero: int | None
    ano: int | None
    ementa: str | None


@dataclass(frozen=True)
class Voto:
    id_camara: int
    voto: str | None  # None em votação secreta: a Câmara publica quem votou, não o voto
    sigla_partido: str | None
    sigla_uf: str | None
    registrado_em: datetime | None


@dataclass(frozen=True)
class Orientacao:
    sigla_bancada: str
    orientacao: str
    cod_tipo_lideranca: str | None
    cod_partido_bloco: int | None


@dataclass(frozen=True)
class VotacaoCompleta:
    votacao: CamaraVotacao
    proposicoes: tuple[VotacaoProposicao, ...]
    votos: tuple[Voto, ...]
    orientacoes: tuple[Orientacao, ...]

    @property
    def nominal(self) -> bool:
        return bool(self.votos)

    def content_hash(self) -> str:
        """Cobre a votação e os filhos: qualquer voto ou orientação novos mudam o hash."""
        payload = json.dumps(asdict(self), default=str, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(payload.encode()).hexdigest()


def _text(value: Any) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text or None


def _datetime(value: Any) -> datetime | None:
    return datetime.fromisoformat(value) if isinstance(value, str) and value else None


def _int(value: Any) -> int | None:
    return int(value) if value not in (None, "") else None


def _bool(value: Any) -> bool | None:
    return None if value is None else bool(int(value))


def parse_votacao(payload: dict[str, Any]) -> tuple[CamaraVotacao, list[VotacaoProposicao]]:
    """Converte o detalhe de /votacoes/{id}. A proposição principal é a primeira afetada."""
    dados = payload["dados"]
    proposicoes = []
    for papel, chave in (("afetada", "proposicoesAfetadas"), ("objeto", "objetosPossiveis")):
        for item in dados.get(chave) or []:
            proposicoes.append(
                VotacaoProposicao(
                    proposicao_id=int(item["id"]),
                    papel=papel,
                    sigla_tipo=_text(item.get("siglaTipo")),
                    numero=_int(item.get("numero")),
                    ano=_int(item.get("ano")),
                    ementa=_text(item.get("ementa")),
                )
            )
    afetadas = [p.proposicao_id for p in proposicoes if p.papel == "afetada"]
    votacao = CamaraVotacao(
        id=str(dados["id"]),
        data=date.fromisoformat(dados["data"][:10]),
        registrado_em=datetime.fromisoformat(dados["dataHoraRegistro"]),
        id_orgao=_int(dados.get("idOrgao")),
        sigla_orgao=_text(dados.get("siglaOrgao")),
        id_evento=_int(dados.get("idEvento")),
        descricao=_text(dados.get("descricao")),
        aprovacao=_bool(dados.get("aprovacao")),
        abertura_descricao=_text(dados.get("descUltimaAberturaVotacao")),
        abertura_em=_datetime(dados.get("dataHoraUltimaAberturaVotacao")),
        proposicao_principal_id=afetadas[0] if afetadas else None,
    )
    return votacao, proposicoes


def parse_votos(payload: dict[str, Any]) -> list[Voto]:
    """Converte /votacoes/{id}/votos. Lista vazia em votações simbólicas; em votação
    secreta a lista traz quem votou com o voto em branco."""
    votos = []
    for item in payload["dados"]:
        deputado = item.get("deputado_") or {}
        votos.append(
            Voto(
                id_camara=int(deputado["id"]),
                voto=_text(item.get("tipoVoto")),
                sigla_partido=_text(deputado.get("siglaPartido")),
                sigla_uf=_text(deputado.get("siglaUf")),
                registrado_em=_datetime(item.get("dataRegistroVoto")),
            )
        )
    return votos


def parse_orientacoes(payload: dict[str, Any]) -> list[Orientacao]:
    """Converte /votacoes/{id}/orientacoes. Bancadas repetidas ficam com a última."""
    por_bancada: dict[str, Orientacao] = {}
    for item in payload["dados"]:
        sigla = _text(item.get("siglaPartidoBloco"))
        orientacao = _text(item.get("orientacaoVoto"))
        if not sigla or not orientacao:
            continue
        por_bancada[sigla] = Orientacao(
            sigla_bancada=sigla,
            orientacao=orientacao,
            cod_tipo_lideranca=_text(item.get("codTipoLideranca")),
            cod_partido_bloco=_int(item.get("codPartidoBloco")),
        )
    return list(por_bancada.values())


def windows(desde: date, ate: date, size: int = MAX_WINDOW_DAYS) -> list[tuple[date, date]]:
    """Divide [desde, ate] em janelas aceitas pela API."""
    if ate < desde:
        raise ValueError(f"intervalo inválido: {desde} > {ate}")
    result = []
    inicio = desde
    while inicio <= ate:
        fim = min(inicio + timedelta(days=size - 1), ate)
        result.append((inicio, fim))
        inicio = fim + timedelta(days=1)
    return result


@dataclass
class CollectStats:
    listadas: int = 0
    detalhadas: int = 0
    nominais: int = 0
    alteradas: int = 0


class CamaraVotacaoRepository:
    def __init__(self, conn: pg8000.native.Connection) -> None:
        self._conn = conn

    def upsert(self, completa: VotacaoCompleta, *, raw_object_id: Any) -> bool:
        """Grava a votação e substitui votos, orientações e proposições se algo mudou."""
        values = asdict(completa.votacao)
        values["nominal"] = completa.nominal
        values["raw_object_id"] = raw_object_id
        values["content_hash"] = completa.content_hash()
        sql = upsert_if_changed_sql("canon.camara_votacao", list(values), "id")
        votacao_id = completa.votacao.id
        with transaction(self._conn):
            changed = bool(self._conn.run(sql, **values))
            if not changed:
                return False
            for table in (
                "canon.camara_voto",
                "canon.camara_orientacao",
                "canon.camara_votacao_proposicao",
            ):
                self._conn.run(
                    f"DELETE FROM {table} WHERE votacao_id = :id",  # noqa: S608 - nome fixo
                    id=votacao_id,
                )
            for prop in completa.proposicoes:
                self._conn.run(
                    "INSERT INTO canon.camara_votacao_proposicao"
                    " (votacao_id, proposicao_id, papel, sigla_tipo, numero, ano, ementa)"
                    " VALUES (:votacao_id, :proposicao_id, :papel, :sigla_tipo, :numero, :ano,"
                    " :ementa) ON CONFLICT DO NOTHING",
                    votacao_id=votacao_id,
                    **asdict(prop),
                )
            for voto in completa.votos:
                self._conn.run(
                    "INSERT INTO canon.camara_voto"
                    " (votacao_id, id_camara, voto, sigla_partido, sigla_uf, registrado_em)"
                    " VALUES (:votacao_id, :id_camara, :voto, :sigla_partido, :sigla_uf,"
                    " :registrado_em) ON CONFLICT (votacao_id, id_camara) DO UPDATE SET"
                    " voto = EXCLUDED.voto, registrado_em = EXCLUDED.registrado_em",
                    votacao_id=votacao_id,
                    **asdict(voto),
                )
            for orientacao in completa.orientacoes:
                self._conn.run(
                    "INSERT INTO canon.camara_orientacao"
                    " (votacao_id, sigla_bancada, orientacao, cod_tipo_lideranca,"
                    " cod_partido_bloco) VALUES (:votacao_id, :sigla_bancada, :orientacao,"
                    " :cod_tipo_lideranca, :cod_partido_bloco)",
                    votacao_id=votacao_id,
                    **asdict(orientacao),
                )
        return True


def _fetch_json(client: SourceClient, storage, registry, *, dataset: str, url: str, params=None):
    response, stored = client.fetch_and_store(
        storage, registry, source=SOURCE, dataset=dataset, url=url, params=params
    )
    return response.json(), stored


def collect(
    client: SourceClient,
    storage: RawStorage,
    registry: RawRegistry,
    repository: CamaraVotacaoRepository,
    *,
    desde: date,
    ate: date,
) -> CollectStats:
    """Coleta as votações registradas entre as datas, com votos e orientações."""
    stats = CollectStats()
    ids: list[str] = []
    for inicio, fim in windows(desde, ate):
        url: str | None = f"{API}/votacoes"
        params: dict[str, Any] | None = {
            "dataInicio": inicio.isoformat(),
            "dataFim": fim.isoformat(),
            "itens": 100,
            "ordem": "ASC",
            "ordenarPor": "dataHoraRegistro",
        }
        while url:
            page, _ = _fetch_json(
                client, storage, registry, dataset="votacoes-lista", url=url, params=params
            )
            ids.extend(str(item["id"]) for item in page["dados"])
            url, params = _next_link(page), None
    stats.listadas = len(ids)

    for votacao_id in dict.fromkeys(ids):
        detalhe, stored = _fetch_json(
            client, storage, registry, dataset="votacao-detalhe", url=f"{API}/votacoes/{votacao_id}"
        )
        votos_payload, _ = _fetch_json(
            client,
            storage,
            registry,
            dataset="votacao-votos",
            url=f"{API}/votacoes/{votacao_id}/votos",
        )
        orientacoes_payload, _ = _fetch_json(
            client,
            storage,
            registry,
            dataset="votacao-orientacoes",
            url=f"{API}/votacoes/{votacao_id}/orientacoes",
        )
        votacao, proposicoes = parse_votacao(detalhe)
        completa = VotacaoCompleta(
            votacao=votacao,
            proposicoes=tuple(proposicoes),
            votos=tuple(parse_votos(votos_payload)),
            orientacoes=tuple(parse_orientacoes(orientacoes_payload)),
        )
        stats.detalhadas += 1
        stats.nominais += completa.nominal
        if repository.upsert(completa, raw_object_id=stored.raw.id):
            stats.alteradas += 1

    logger.info("camara-votacoes: %s", stats)
    return stats
