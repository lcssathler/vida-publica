"""Prestação de contas eleitorais de órgãos partidários (TSE): receitas, doador
originário, despesas contratadas e pagamentos com a fonte do recurso."""

import io
import logging
import zipfile
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import Any

import pg8000.native

from ..http import SourceClient
from ..identity import hash_cpf
from ..ports import RawRegistry, RawStorage
from ..snapshot import PgSnapshotTable, SyncStats, sync, with_ids
from .tse_candidaturas import SOURCE
from .tse_contas_candidatos import (
    _date,
    _decimal,
    _documento,
    _esfera,
    _int,
    _text,
    parse_doador_originario,
    read_member,
    row_key,
)

logger = logging.getLogger(__name__)

URL = (
    "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/"
    "prestacao_de_contas_eleitorais_orgaos_partidarios_{ano}.zip"
)


def _orgao(row: dict[str, str]) -> dict[str, Any]:
    cnpj, _ = _documento(row.get("NR_CNPJ_PRESTADOR_CONTA"))
    return {
        "ano_eleicao": int(row["AA_ELEICAO"]),
        "sq_prestador": int(row["SQ_PRESTADOR_CONTAS"]),
        "tp_prestacao": _text(row.get("TP_PRESTACAO_CONTAS")),
        "dt_prestacao": _date(row.get("DT_PRESTACAO_CONTAS")),
        "esfera": _esfera(row.get("CD_ESFERA_PARTIDARIA")),
        "sg_uf": _text(row.get("SG_UF")),
        "cd_municipio": _positivo(_int(row.get("CD_MUNICIPIO"))),
        "nm_municipio": _text(row.get("NM_MUNICIPIO")),
        "cnpj_prestador": cnpj,
        "nr_partido": _int(row.get("NR_PARTIDO")),
        "sg_partido": _text(row.get("SG_PARTIDO")),
    }


def _positivo(value: int | None) -> int | None:
    return value if value is not None and value >= 0 else None


def parse_receita(row: dict[str, str]) -> tuple[dict[str, Any], str | None]:
    cnpj, cpf = _documento(row.get("NR_CPF_CNPJ_DOADOR"))
    values = {
        **_orgao(row),
        "cd_fonte": _int(row.get("CD_FONTE_RECEITA")),
        "ds_fonte": _text(row.get("DS_FONTE_RECEITA")),
        "cd_origem": _positivo(_int(row.get("CD_ORIGEM_RECEITA"))),
        "ds_origem": _text(row.get("DS_ORIGEM_RECEITA")),
        "ds_natureza": _text(row.get("DS_NATUREZA_RECEITA")),
        "ds_especie": _text(row.get("DS_ESPECIE_RECEITA")),
        "doador_cnpj": cnpj,
        "doador_nome": _text(row.get("NM_DOADOR")),
        "doador_nome_rfb": _text(row.get("NM_DOADOR_RFB")),
        "doador_cnae": _text(row.get("DS_CNAE_DOADOR")),
        "doador_esfera": _esfera(row.get("CD_ESFERA_PARTIDARIA_DOADOR")),
        "doador_uf": _text(row.get("SG_UF_DOADOR")),
        "doador_municipio": _text(row.get("NM_MUNICIPIO_DOADOR")),
        "doador_sq_candidato": _positivo(_int(row.get("SQ_CANDIDATO_DOADOR"))),
        "doador_nr_partido": _positivo(_int(row.get("NR_PARTIDO_DOADOR"))),
        "doador_sg_partido": _text(row.get("SG_PARTIDO_DOADOR")),
        "nr_recibo": _text(row.get("NR_RECIBO_DOACAO")),
        "nr_documento": _text(row.get("NR_DOCUMENTO_DOACAO")),
        "sq_receita": _positivo(_int(row.get("SQ_RECEITA"))),
        "data": _date(row.get("DT_RECEITA")),
        "descricao": _text(row.get("DS_RECEITA")),
        "valor": _decimal(row.get("VR_RECEITA")),
    }
    return values, cpf


def parse_despesa(row: dict[str, str]) -> tuple[dict[str, Any], str | None]:
    cnpj, cpf = _documento(row.get("NR_CPF_CNPJ_FORNECEDOR"))
    values = {
        **_orgao(row),
        "sg_ue": _text(row.get("SG_UE")),
        "fornecedor_tipo": _text(row.get("DS_TIPO_FORNECEDOR")),
        "fornecedor_cnae": _text(row.get("DS_CNAE_FORNECEDOR")),
        "fornecedor_cnpj": cnpj,
        "fornecedor_nome": _text(row.get("NM_FORNECEDOR")),
        "fornecedor_nome_rfb": _text(row.get("NM_FORNECEDOR_RFB")),
        "fornecedor_esfera": _esfera(row.get("CD_ESFERA_PART_FORNECEDOR")),
        "fornecedor_uf": _text(row.get("SG_UF_FORNECEDOR")),
        "fornecedor_municipio": _text(row.get("NM_MUNICIPIO_FORNECEDOR")),
        "fornecedor_sq_candidato": _positivo(_int(row.get("SQ_CANDIDATO_FORNECEDOR"))),
        "fornecedor_cargo": _text(row.get("DS_CARGO_FORNECEDOR")),
        "fornecedor_nr_partido": _positivo(_int(row.get("NR_PARTIDO_FORNECEDOR"))),
        "fornecedor_sg_partido": _text(row.get("SG_PARTIDO_FORNECEDOR")),
        "tipo_documento": _text(row.get("DS_TIPO_DOCUMENTO")),
        "nr_documento": _text(row.get("NR_DOCUMENTO")),
        "cd_origem": _positivo(_int(row.get("CD_ORIGEM_DESPESA"))),
        "ds_origem": _text(row.get("DS_ORIGEM_DESPESA")),
        "sq_despesa": _positivo(_int(row.get("SQ_DESPESA"))),
        "data": _date(row.get("DT_DESPESA")),
        "descricao": _text(row.get("DS_DESPESA")),
        "valor": _decimal(row.get("VR_DESPESA_CONTRATADA")),
    }
    return values, cpf


def parse_pagamento(row: dict[str, str]) -> tuple[dict[str, Any], str | None]:
    values = {
        "ano_eleicao": int(row["AA_ELEICAO"]),
        "sq_prestador": int(row["SQ_PRESTADOR_CONTAS"]),
        "tp_prestacao": _text(row.get("TP_PRESTACAO_CONTAS")),
        "sg_uf": _text(row.get("SG_UF")),
        "tipo_documento": _text(row.get("DS_TIPO_DOCUMENTO")),
        "nr_documento": _text(row.get("NR_DOCUMENTO")),
        "cd_fonte": _int(row.get("CD_FONTE_DESPESA")),
        "ds_fonte": _text(row.get("DS_FONTE_DESPESA")),
        "cd_origem": _positivo(_int(row.get("CD_ORIGEM_DESPESA"))),
        "ds_origem": _text(row.get("DS_ORIGEM_DESPESA")),
        "ds_natureza": _text(row.get("DS_NATUREZA_DESPESA")),
        "ds_especie": _text(row.get("DS_ESPECIE_RECURSO")),
        "sq_despesa": _positivo(_int(row.get("SQ_DESPESA"))),
        "sq_parcelamento": _positivo(_int(row.get("SQ_PARCELAMENTO_DESPESA"))),
        "data": _date(row.get("DT_PAGTO_DESPESA")),
        "descricao": _text(row.get("DS_DESPESA")),
        "valor": _decimal(row.get("VR_PAGTO_DESPESA")),
    }
    return values, None


@dataclass
class CollectStats:
    receitas: SyncStats | None = None
    doadores_originarios: SyncStats | None = None
    despesas: SyncStats | None = None
    pagamentos: SyncStats | None = None
    repasses_a_candidatos: int = 0


def _sync_member(
    conn: pg8000.native.Connection,
    archive: zipfile.ZipFile,
    *,
    member: str,
    table: str,
    ident_table: str | None,
    ano: int,
    parse: Callable[[dict[str, str]], tuple[dict[str, Any], str | None]],
    cpf_hash_key: str,
    raw_object_id: Any,
    on_new: Callable[[Any], None] | None = None,
) -> SyncStats:
    def rows() -> Iterator[tuple[str, tuple[dict[str, Any], str | None]]]:
        for row in read_member(archive, member):
            values, cpf = parse(row)
            yield row_key(row), (values, hash_cpf(cpf, cpf_hash_key) if cpf else None)

    snapshot = PgSnapshotTable(
        conn, table, scope_column="ano_eleicao", scope_value=ano, ident_table=ident_table
    )
    stats = sync(
        snapshot, with_ids(f"{table}:{ano}", rows()), raw_object_id=raw_object_id, on_new=on_new
    )
    logger.info("%s %s: %s", table, ano, stats)
    return stats


def collect(
    client: SourceClient,
    storage: RawStorage,
    registry: RawRegistry,
    conn: pg8000.native.Connection,
    *,
    cpf_hash_key: str,
    anos: list[int],
) -> CollectStats:
    stats = CollectStats()

    def conta_repasse(item: Any) -> None:
        if item[0].get("fornecedor_sq_candidato") is not None:
            stats.repasses_a_candidatos += 1

    for ano in anos:
        response, stored = client.fetch_and_store(
            storage,
            registry,
            source=SOURCE,
            dataset="prestacao-contas-orgaos-partidarios",
            url=URL.format(ano=ano),
            headers={"Accept": "*/*"},
        )
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            comum = {"conn": conn, "archive": archive, "ano": ano, "cpf_hash_key": cpf_hash_key}
            stats.receitas = _sync_member(
                member=f"receitas_orgaos_partidarios_{ano}_BRASIL.csv",
                table="canon.tse_partido_receita",
                ident_table="ident.tse_partido_receita_doador",
                parse=parse_receita,
                raw_object_id=stored.raw.id,
                **comum,
            )
            stats.doadores_originarios = _sync_member(
                member=f"receitas_orgaos_partidarios_doador_originario_{ano}_BRASIL.csv",
                table="canon.tse_partido_receita_doador_originario",
                ident_table="ident.tse_partido_receita_doador_originario_doador",
                parse=parse_doador_originario,
                raw_object_id=stored.raw.id,
                **comum,
            )
            stats.despesas = _sync_member(
                member=f"despesas_contratadas_orgaos_partidarios_{ano}_BRASIL.csv",
                table="canon.tse_partido_despesa",
                ident_table="ident.tse_partido_despesa_fornecedor",
                parse=parse_despesa,
                raw_object_id=stored.raw.id,
                on_new=conta_repasse,
                **comum,
            )
            stats.pagamentos = _sync_member(
                member=f"despesas_pagas_orgaos_partidarios_{ano}_BRASIL.csv",
                table="canon.tse_partido_pagamento",
                ident_table=None,
                parse=parse_pagamento,
                raw_object_id=stored.raw.id,
                **comum,
            )
    logger.info("tse-contas-partidos: %s", stats)
    return stats
