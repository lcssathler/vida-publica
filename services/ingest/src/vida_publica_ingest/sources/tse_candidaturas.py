"""Candidaturas do TSE (portal de dados abertos, arquivos consulta_cand)."""

import csv
import hashlib
import io
import json
import logging
import zipfile
from collections.abc import Iterator
from dataclasses import asdict, dataclass
from datetime import date
from typing import Any
from uuid import UUID

import pg8000.native

from ..adapters.postgres import transaction, upsert_if_changed_sql
from ..http import SourceClient
from ..identity import hash_document
from ..ports import RawRegistry, RawStorage

logger = logging.getLogger(__name__)

SOURCE = "tse"
URL = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_{ano}.zip"
NULL_MARKERS = {"", "#NULO#", "#NULO", "#NE", "#NE#", "-1", "-3", "-4"}
BATCH = 1000


@dataclass(frozen=True)
class TseCandidatura:
    ano_eleicao: int
    sq_candidato: int
    nr_turno: int
    cd_eleicao: int | None
    ds_eleicao: str | None
    dt_eleicao: date | None
    sg_uf: str | None
    sg_ue: str | None
    nm_ue: str | None
    cd_cargo: int | None
    ds_cargo: str | None
    nr_candidato: int | None
    nm_candidato: str
    nm_urna_candidato: str | None
    nm_social_candidato: str | None
    ds_situacao_candidatura: str | None
    nr_partido: int | None
    sg_partido: str | None
    nm_partido: str | None
    nr_federacao: int | None
    sg_federacao: str | None
    nm_federacao: str | None
    sq_coligacao: int | None
    nm_coligacao: str | None
    sg_uf_nascimento: str | None
    dt_nascimento: date | None
    ds_genero: str | None
    ds_grau_instrucao: str | None
    ds_estado_civil: str | None
    ds_cor_raca: str | None
    ds_ocupacao: str | None
    ds_sit_tot_turno: str | None

    def content_hash(self) -> str:
        payload = json.dumps(asdict(self), default=str, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(payload.encode()).hexdigest()


@dataclass(frozen=True)
class Documentos:
    """Documentos em claro, só em memória: viram hash antes de qualquer gravação."""

    cpf: str | None
    titulo: str | None


def _text(value: str | None) -> str | None:
    value = (value or "").strip()
    return None if value in NULL_MARKERS else value


def _int(value: str | None) -> int | None:
    text = _text(value)
    return int(text) if text and text.lstrip("-").isdigit() else None


def _date(value: str | None) -> date | None:
    text = _text(value)
    if not text:
        return None
    day, month, year = text.split("/")
    return date(int(year), int(month), int(day))


def parse_row(row: dict[str, str]) -> tuple[TseCandidatura, Documentos]:
    candidatura = TseCandidatura(
        ano_eleicao=int(row["ANO_ELEICAO"]),
        sq_candidato=int(row["SQ_CANDIDATO"]),
        nr_turno=int(row["NR_TURNO"]),
        cd_eleicao=_int(row.get("CD_ELEICAO")),
        ds_eleicao=_text(row.get("DS_ELEICAO")),
        dt_eleicao=_date(row.get("DT_ELEICAO")),
        sg_uf=_text(row.get("SG_UF")),
        sg_ue=_text(row.get("SG_UE")),
        nm_ue=_text(row.get("NM_UE")),
        cd_cargo=_int(row.get("CD_CARGO")),
        ds_cargo=_text(row.get("DS_CARGO")),
        nr_candidato=_int(row.get("NR_CANDIDATO")),
        nm_candidato=_text(row.get("NM_CANDIDATO")) or "",
        nm_urna_candidato=_text(row.get("NM_URNA_CANDIDATO")),
        nm_social_candidato=_text(row.get("NM_SOCIAL_CANDIDATO")),
        ds_situacao_candidatura=_text(row.get("DS_SITUACAO_CANDIDATURA")),
        nr_partido=_int(row.get("NR_PARTIDO")),
        sg_partido=_text(row.get("SG_PARTIDO")),
        nm_partido=_text(row.get("NM_PARTIDO")),
        nr_federacao=_int(row.get("NR_FEDERACAO")),
        sg_federacao=_text(row.get("SG_FEDERACAO")),
        nm_federacao=_text(row.get("NM_FEDERACAO")),
        sq_coligacao=_int(row.get("SQ_COLIGACAO")),
        nm_coligacao=_text(row.get("NM_COLIGACAO")),
        sg_uf_nascimento=_text(row.get("SG_UF_NASCIMENTO")),
        dt_nascimento=_date(row.get("DT_NASCIMENTO")),
        ds_genero=_text(row.get("DS_GENERO")),
        ds_grau_instrucao=_text(row.get("DS_GRAU_INSTRUCAO")),
        ds_estado_civil=_text(row.get("DS_ESTADO_CIVIL")),
        ds_cor_raca=_text(row.get("DS_COR_RACA")),
        ds_ocupacao=_text(row.get("DS_OCUPACAO")),
        ds_sit_tot_turno=_text(row.get("DS_SIT_TOT_TURNO")),
    )
    documentos = Documentos(
        cpf=_text(row.get("NR_CPF_CANDIDATO")),
        titulo=_text(row.get("NR_TITULO_ELEITORAL_CANDIDATO")),
    )
    return candidatura, documentos


def read_zip(content: bytes, ano: int) -> Iterator[dict[str, str]]:
    """Lê o CSV nacional do zip (o arquivo _BRASIL já inclui a eleição presidencial)."""
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        name = f"consulta_cand_{ano}_BRASIL.csv"
        if name not in archive.namelist():
            raise ValueError(f"{name} não encontrado no arquivo do TSE")
        with archive.open(name) as raw:
            text = io.TextIOWrapper(raw, encoding="latin-1", newline="")
            yield from csv.DictReader(text, delimiter=";")


@dataclass
class CollectStats:
    linhas: int = 0
    alteradas: int = 0
    sem_cpf: int = 0


class TseCandidaturaRepository:
    def __init__(self, conn: pg8000.native.Connection) -> None:
        self._conn = conn

    def upsert_many(
        self,
        items: list[tuple[TseCandidatura, str | None, str | None]],
        *,
        raw_object_id: UUID | None,
    ) -> int:
        """Grava um lote (candidatura, hash do CPF, hash do título). Devolve quantas mudaram."""
        if not items:
            return 0
        columns = [*asdict(items[0][0]), "raw_object_id", "content_hash"]
        sql = upsert_if_changed_sql(
            "canon.tse_candidatura", columns, ("ano_eleicao", "sq_candidato", "nr_turno")
        )
        changed = 0
        with transaction(self._conn):
            for candidatura, cpf_hash, titulo_hash in items:
                values: dict[str, Any] = asdict(candidatura)
                values["raw_object_id"] = raw_object_id
                values["content_hash"] = candidatura.content_hash()
                changed += len(self._conn.run(sql, **values))
                self._conn.run(
                    "INSERT INTO ident.tse_candidatura"
                    " (ano_eleicao, sq_candidato, cpf_hash, titulo_hash)"
                    " VALUES (:ano, :sq, :cpf, :titulo) ON CONFLICT (ano_eleicao, sq_candidato)"
                    " DO UPDATE SET cpf_hash = EXCLUDED.cpf_hash,"
                    " titulo_hash = EXCLUDED.titulo_hash",
                    ano=candidatura.ano_eleicao,
                    sq=candidatura.sq_candidato,
                    cpf=cpf_hash,
                    titulo=titulo_hash,
                )
        return changed


def collect(
    client: SourceClient,
    storage: RawStorage,
    registry: RawRegistry,
    repository: TseCandidaturaRepository,
    *,
    cpf_hash_key: str,
    anos: list[int],
) -> CollectStats:
    """Baixa o arquivo de candidaturas de cada ano, guarda o bruto e grava o que mudou."""
    stats = CollectStats()
    for ano in anos:
        response, stored = client.fetch_and_store(
            storage, registry, source=SOURCE, dataset="consulta-cand", url=URL.format(ano=ano)
        )
        batch: list[tuple[TseCandidatura, str | None, str | None]] = []
        for row in read_zip(response.content, ano):
            candidatura, documentos = parse_row(row)
            cpf_hash = hash_document(documentos.cpf, cpf_hash_key, length=11)
            titulo_hash = hash_document(documentos.titulo, cpf_hash_key, length=12)
            stats.linhas += 1
            stats.sem_cpf += cpf_hash is None
            batch.append((candidatura, cpf_hash, titulo_hash))
            if len(batch) >= BATCH:
                stats.alteradas += repository.upsert_many(batch, raw_object_id=stored.raw.id)
                batch = []
        stats.alteradas += repository.upsert_many(batch, raw_object_id=stored.raw.id)
        logger.info("tse-candidaturas %s: %s", ano, stats)
    return stats
