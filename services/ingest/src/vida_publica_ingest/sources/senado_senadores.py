"""Senadores do Senado Federal (API de dados abertos)."""

import hashlib
import json
import logging
from dataclasses import asdict, dataclass
from datetime import date
from typing import Any
from uuid import UUID

import pg8000.native

from ..adapters.postgres import transaction, upsert_if_changed_sql
from ..http import SourceClient
from ..ports import RawRegistry, RawStorage

logger = logging.getLogger(__name__)

API = "https://legis.senado.leg.br/dadosabertos"
SOURCE = "senado"
_SEXO = {"Masculino": "M", "Feminino": "F"}


@dataclass(frozen=True)
class SenadoSenador:
    codigo_senado: int
    nome_parlamentar: str
    nome_completo: str | None
    sexo: str | None
    data_nascimento: date | None
    naturalidade: str | None
    uf_naturalidade: str | None
    sigla_partido: str | None
    uf_parlamentar: str | None
    email: str | None
    url_foto: str | None
    url_pagina: str | None
    em_exercicio: bool

    def content_hash(self) -> str:
        payload = json.dumps(asdict(self), default=str, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(payload.encode()).hexdigest()


def _text(value: Any) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text or None


def _as_list(value: Any) -> list[Any]:
    """A API devolve objeto quando há um item e lista quando há vários."""
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def participations(item: dict[str, Any], legislatura: int) -> set[str]:
    """Participações (Titular, 1º Suplente...) de um parlamentar numa legislatura."""
    found = set()
    for mandato in _as_list((item.get("Mandatos") or {}).get("Mandato")):
        legs = {
            int((mandato.get(chave) or {}).get("NumeroLegislatura", 0))
            for chave in ("PrimeiraLegislaturaDoMandato", "SegundaLegislaturaDoMandato")
        }
        if legislatura in legs:
            found.add(_text(mandato.get("DescricaoParticipacao")) or "Desconhecida")
    return found


def parse_senador(payload: dict[str, Any], *, em_exercicio: bool) -> SenadoSenador:
    """Converte o detalhe de /senador/{codigo}."""
    parlamentar = payload["DetalheParlamentar"]["Parlamentar"]
    ident = parlamentar.get("IdentificacaoParlamentar") or {}
    basicos = parlamentar.get("DadosBasicosParlamentar") or {}
    nascimento = _text(basicos.get("DataNascimento"))
    return SenadoSenador(
        codigo_senado=int(ident["CodigoParlamentar"]),
        nome_parlamentar=_text(ident.get("NomeParlamentar")) or "",
        nome_completo=_text(ident.get("NomeCompletoParlamentar")),
        sexo=_SEXO.get(ident.get("SexoParlamentar", "")),
        data_nascimento=date.fromisoformat(nascimento[:10]) if nascimento else None,
        naturalidade=_text(basicos.get("Naturalidade")),
        uf_naturalidade=_text(basicos.get("UfNaturalidade")),
        sigla_partido=_text(ident.get("SiglaPartidoParlamentar")),
        uf_parlamentar=_text(ident.get("UfParlamentar")),
        email=_text(ident.get("EmailParlamentar")),
        url_foto=_text(ident.get("UrlFotoParlamentar")),
        url_pagina=_text(ident.get("UrlPaginaParlamentar")),
        em_exercicio=em_exercicio,
    )


@dataclass
class CollectStats:
    na_legislatura: int = 0
    em_exercicio: int = 0
    detalhes: int = 0
    alterados: int = 0
    sem_nascimento: int = 0


class SenadoSenadorRepository:
    def __init__(self, conn: pg8000.native.Connection) -> None:
        self._conn = conn

    def upsert(
        self,
        senador: SenadoSenador,
        *,
        participacoes: dict[int, set[str]],
        raw_object_id: UUID | None,
    ) -> bool:
        values = asdict(senador)
        values["raw_object_id"] = raw_object_id
        values["content_hash"] = senador.content_hash()
        sql = upsert_if_changed_sql("canon.senado_senador", list(values), "codigo_senado")
        with transaction(self._conn):
            changed = self._conn.run(sql, **values)
            for legislatura, descricoes in sorted(participacoes.items()):
                for descricao in sorted(descricoes):
                    self._conn.run(
                        "INSERT INTO canon.senado_senador_legislatura"
                        " (codigo_senado, id_legislatura, participacao)"
                        " VALUES (:codigo, :leg, :part) ON CONFLICT DO NOTHING",
                        codigo=senador.codigo_senado,
                        leg=legislatura,
                        part=descricao,
                    )
        return bool(changed)


def collect(
    client: SourceClient,
    storage: RawStorage,
    registry: RawRegistry,
    repository: SenadoSenadorRepository,
    *,
    legislaturas: list[int],
) -> CollectStats:
    """Coleta quem tem mandato nas legislaturas indicadas e marca quem está em exercício."""
    stats = CollectStats()

    response, _ = client.fetch_and_store(
        storage,
        registry,
        source=SOURCE,
        dataset="senadores-atual",
        url=f"{API}/senador/lista/atual",
    )
    atuais = {
        int(item["IdentificacaoParlamentar"]["CodigoParlamentar"])
        for item in _as_list(
            response.json()["ListaParlamentarEmExercicio"]["Parlamentares"]["Parlamentar"]
        )
    }
    stats.em_exercicio = len(atuais)

    membership: dict[int, dict[int, set[str]]] = {codigo: {} for codigo in atuais}
    for legislatura in legislaturas:
        response, _ = client.fetch_and_store(
            storage,
            registry,
            source=SOURCE,
            dataset="senadores-legislatura",
            url=f"{API}/senador/lista/legislatura/{legislatura}",
        )
        lista = response.json()["ListaParlamentarLegislatura"]["Parlamentares"]["Parlamentar"]
        for item in _as_list(lista):
            codigo = int(item["IdentificacaoParlamentar"]["CodigoParlamentar"])
            membership.setdefault(codigo, {})[legislatura] = participations(item, legislatura)
    stats.na_legislatura = len(membership)

    for codigo, participacoes in sorted(membership.items()):
        response, stored = client.fetch_and_store(
            storage,
            registry,
            source=SOURCE,
            dataset="senador-detalhe",
            url=f"{API}/senador/{codigo}",
        )
        senador = parse_senador(response.json(), em_exercicio=codigo in atuais)
        stats.detalhes += 1
        stats.sem_nascimento += senador.data_nascimento is None
        if repository.upsert(senador, participacoes=participacoes, raw_object_id=stored.raw.id):
            stats.alterados += 1

    logger.info("senado-senadores: %s", stats)
    return stats
