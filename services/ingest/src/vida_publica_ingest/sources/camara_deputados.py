"""Deputados federais da Câmara dos Deputados (API de dados abertos v2)."""

import hashlib
import json
import logging
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any
from uuid import UUID

import pg8000.native

from ..adapters.postgres import transaction, upsert_if_changed_sql
from ..http import SourceClient
from ..identity import hash_cpf
from ..ports import RawRegistry, RawStorage

logger = logging.getLogger(__name__)

API = "https://dadosabertos.camara.leg.br/api/v2"
SOURCE = "camara"


@dataclass(frozen=True)
class CamaraDeputado:
    id_camara: int
    nome_parlamentar: str
    nome_civil: str | None
    nome_eleitoral: str | None
    sexo: str | None
    data_nascimento: date | None
    data_falecimento: date | None
    uf_nascimento: str | None
    municipio_nascimento: str | None
    escolaridade: str | None
    sigla_partido: str | None
    sigla_uf: str | None
    id_legislatura: int | None
    situacao: str | None
    condicao_eleitoral: str | None
    status_desde: date | None
    url_foto: str | None
    email: str | None
    redes_sociais: tuple[str, ...] = field(default_factory=tuple)

    def content_hash(self) -> str:
        """Hash do conteúdo público, para detectar mudanças entre coletas."""
        payload = json.dumps(asdict(self), default=str, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(payload.encode()).hexdigest()


def _date(value: Any) -> date | None:
    return date.fromisoformat(value[:10]) if isinstance(value, str) and value else None


def _text(value: Any) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text or None


def parse_deputado(payload: dict[str, Any]) -> tuple[CamaraDeputado, str | None]:
    """Converte o detalhe de /deputados/{id}. Devolve o deputado e o CPF em claro,
    que deve virar hash imediatamente e nunca ser guardado."""
    dados = payload["dados"]
    status = dados.get("ultimoStatus") or {}
    sexo = _text(dados.get("sexo"))
    deputado = CamaraDeputado(
        id_camara=int(dados["id"]),
        nome_parlamentar=_text(status.get("nome")) or _text(dados.get("nomeCivil")) or "",
        nome_civil=_text(dados.get("nomeCivil")),
        nome_eleitoral=_text(status.get("nomeEleitoral")),
        sexo=sexo if sexo in {"M", "F"} else None,
        data_nascimento=_date(dados.get("dataNascimento")),
        data_falecimento=_date(dados.get("dataFalecimento")),
        uf_nascimento=_text(dados.get("ufNascimento")),
        municipio_nascimento=_text(dados.get("municipioNascimento")),
        escolaridade=_text(dados.get("escolaridade")),
        sigla_partido=_text(status.get("siglaPartido")),
        sigla_uf=_text(status.get("siglaUf")),
        id_legislatura=status.get("idLegislatura"),
        situacao=_text(status.get("situacao")),
        condicao_eleitoral=_text(status.get("condicaoEleitoral")),
        status_desde=_date(status.get("data")),
        url_foto=_text(status.get("urlFoto")),
        email=_text(status.get("email")),
        redes_sociais=tuple(dados.get("redeSocial") or ()),
    )
    return deputado, _text(dados.get("cpf"))


def _next_link(payload: dict[str, Any]) -> str | None:
    return next((link["href"] for link in payload.get("links", []) if link["rel"] == "next"), None)


@dataclass
class CollectStats:
    listados: int = 0
    detalhes: int = 0
    alterados: int = 0
    sem_cpf: int = 0


class CamaraDeputadoRepository:
    def __init__(self, conn: pg8000.native.Connection) -> None:
        self._conn = conn

    def upsert(
        self,
        deputado: CamaraDeputado,
        *,
        cpf_hash: str | None,
        legislaturas: set[int],
        raw_object_id: UUID | None,
    ) -> bool:
        """Grava o deputado. Devolve True se era novo ou mudou desde a última coleta."""
        values = asdict(deputado)
        values["redes_sociais"] = list(deputado.redes_sociais)
        values["raw_object_id"] = raw_object_id
        values["content_hash"] = deputado.content_hash()
        sql = upsert_if_changed_sql("canon.camara_deputado", list(values), "id_camara")
        with transaction(self._conn):
            changed = self._conn.run(sql, **values)
            self._conn.run(
                "INSERT INTO ident.camara_deputado (id_camara, cpf_hash) VALUES (:id, :cpf)"
                " ON CONFLICT (id_camara) DO UPDATE SET cpf_hash = EXCLUDED.cpf_hash",
                id=deputado.id_camara,
                cpf=cpf_hash,
            )
            for legislatura in sorted(legislaturas):
                self._conn.run(
                    "INSERT INTO canon.camara_deputado_legislatura (id_camara, id_legislatura)"
                    " VALUES (:id, :leg) ON CONFLICT DO NOTHING",
                    id=deputado.id_camara,
                    leg=legislatura,
                )
        return bool(changed)


def collect(
    client: SourceClient,
    storage: RawStorage,
    registry: RawRegistry,
    repository: CamaraDeputadoRepository,
    *,
    cpf_hash_key: str,
    legislaturas: list[int],
) -> CollectStats:
    """Coleta os deputados das legislaturas indicadas e grava os que mudaram."""
    stats = CollectStats()
    membership: dict[int, set[int]] = {}

    for legislatura in legislaturas:
        url: str | None = f"{API}/deputados"
        params: dict[str, Any] | None = {
            "idLegislatura": legislatura,
            "itens": 100,
            "ordem": "ASC",
            "ordenarPor": "id",
        }
        while url:
            response, _ = client.fetch_and_store(
                storage, registry, source=SOURCE, dataset="deputados-lista", url=url, params=params
            )
            page = response.json()
            for item in page["dados"]:
                membership.setdefault(int(item["id"]), set()).add(legislatura)
                stats.listados += 1
            url, params = _next_link(page), None

    for id_camara, legs in sorted(membership.items()):
        response, stored = client.fetch_and_store(
            storage,
            registry,
            source=SOURCE,
            dataset="deputados-detalhe",
            url=f"{API}/deputados/{id_camara}",
        )
        deputado, cpf = parse_deputado(response.json())
        cpf_hash = hash_cpf(cpf, cpf_hash_key)
        stats.detalhes += 1
        stats.sem_cpf += cpf_hash is None
        if repository.upsert(
            deputado, cpf_hash=cpf_hash, legislaturas=legs, raw_object_id=stored.raw.id
        ):
            stats.alterados += 1

    logger.info("camara-deputados: %s", stats)
    return stats
