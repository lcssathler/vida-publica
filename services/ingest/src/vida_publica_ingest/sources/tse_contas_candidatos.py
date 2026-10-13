"""Prestação de contas eleitorais de candidatos (TSE): receitas, doador originário e
despesas contratadas, como fotografia anual."""

import csv
import io
import logging
import re
import zipfile
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

import pg8000.native

from ..http import SourceClient
from ..identity import hash_cpf
from ..ports import RawRegistry, RawStorage
from ..snapshot import PgSnapshotTable, SyncStats, sync, with_ids
from .tse_candidaturas import NULL_MARKERS, SOURCE

logger = logging.getLogger(__name__)

URL = (
    "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/"
    "prestacao_de_contas_eleitorais_candidatos_{ano}.zip"
)
# Cargos federais: Presidente, Senador e Deputado Federal. Os demais entram sob pedido.
CARGOS_FEDERAIS = {1, 5, 6}
_DIGITS = re.compile(r"\D")


def _text(value: str | None) -> str | None:
    text = (value or "").strip()
    return None if text in NULL_MARKERS else text


def _int(value: str | None) -> int | None:
    text = _text(value)
    return int(text) if text and text.lstrip("-").isdigit() else None


def _decimal(value: str | None) -> Decimal:
    text = (_text(value) or "0").replace(".", "").replace(",", ".")
    return Decimal(text)


def _date(value: str | None) -> date | None:
    text = _text(value)
    if not text:
        return None
    day, month, year = text[:10].split("/")
    return date(int(year), int(month), int(day))


def _documento(value: str | None) -> tuple[str | None, str | None]:
    """(CNPJ em claro, CPF em claro) a partir do campo CPF/CNPJ."""
    digits = _DIGITS.sub("", value or "")
    return (digits if len(digits) == 14 else None), (digits if len(digits) == 11 else None)


def _esfera(value: str | None) -> str | None:
    text = _text(value)
    return text[:1] if text and text[:1] in {"N", "F", "M", "Z"} else None


def row_key(row: dict[str, str]) -> str:
    """Todos os campos menos a data/hora de geração do arquivo."""
    return "|".join(
        (row.get(c) or "").strip() for c in row if c not in ("DT_GERACAO", "HH_GERACAO")
    )


def _candidato(row: dict[str, str]) -> dict[str, Any]:
    return {
        "ano_eleicao": int(row["AA_ELEICAO"]),
        "sq_candidato": int(row["SQ_CANDIDATO"]),
        "nr_turno": _int(row.get("ST_TURNO")),
        "sq_prestador": _int(row.get("SQ_PRESTADOR_CONTAS")),
        "tp_prestacao": _text(row.get("TP_PRESTACAO_CONTAS")),
        "dt_prestacao": _date(row.get("DT_PRESTACAO_CONTAS")),
        "sg_uf": _text(row.get("SG_UF")),
        "sg_ue": _text(row.get("SG_UE")),
        "cd_cargo": _int(row.get("CD_CARGO")),
        "ds_cargo": _text(row.get("DS_CARGO")),
        "nr_candidato": _int(row.get("NR_CANDIDATO")),
        "nm_candidato": _text(row.get("NM_CANDIDATO")),
        "nr_partido": _int(row.get("NR_PARTIDO")),
        "sg_partido": _text(row.get("SG_PARTIDO")),
    }


def parse_receita(row: dict[str, str]) -> tuple[dict[str, Any], str | None]:
    cnpj, cpf = _documento(row.get("NR_CPF_CNPJ_DOADOR"))
    values = {
        **_candidato(row),
        "cd_fonte": _int(row.get("CD_FONTE_RECEITA")),
        "ds_fonte": _text(row.get("DS_FONTE_RECEITA")),
        "cd_origem": _int(row.get("CD_ORIGEM_RECEITA")),
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
        "doador_sq_candidato": _int(row.get("SQ_CANDIDATO_DOADOR")),
        "doador_nr_partido": _int(row.get("NR_PARTIDO_DOADOR")),
        "doador_sg_partido": _text(row.get("SG_PARTIDO_DOADOR")),
        "nr_recibo": _text(row.get("NR_RECIBO_DOACAO")),
        "nr_documento": _text(row.get("NR_DOCUMENTO_DOACAO")),
        "sq_receita": _int(row.get("SQ_RECEITA")),
        "data": _date(row.get("DT_RECEITA")),
        "descricao": _text(row.get("DS_RECEITA")),
        "valor": _decimal(row.get("VR_RECEITA")),
        "natureza_estimavel": _text(row.get("DS_NATUREZA_RECURSO_ESTIMAVEL")),
    }
    for negativo in ("doador_sq_candidato", "doador_nr_partido"):
        if values[negativo] is not None and values[negativo] < 0:
            values[negativo] = None
    return values, cpf


def parse_doador_originario(row: dict[str, str]) -> tuple[dict[str, Any], str | None]:
    cnpj, cpf = _documento(row.get("NR_CPF_CNPJ_DOADOR_ORIGINARIO"))
    values = {
        "ano_eleicao": int(row["AA_ELEICAO"]),
        "sq_prestador": int(row["SQ_PRESTADOR_CONTAS"]),
        "sq_receita": _int(row.get("SQ_RECEITA")),
        "tp_prestacao": _text(row.get("TP_PRESTACAO_CONTAS")),
        "sg_uf": _text(row.get("SG_UF")),
        "doador_cnpj": cnpj,
        "doador_nome": _text(row.get("NM_DOADOR_ORIGINARIO")),
        "doador_nome_rfb": _text(row.get("NM_DOADOR_ORIGINARIO_RFB")),
        "tipo": (_text(row.get("TP_DOADOR_ORIGINARIO")) or "")[:1] or None,
        "doador_cnae": _text(row.get("DS_CNAE_DOADOR_ORIGINARIO")),
        "data": _date(row.get("DT_RECEITA")),
        "descricao": _text(row.get("DS_RECEITA")),
        "valor": _decimal(row.get("VR_RECEITA")),
    }
    if values["sq_receita"] is not None and values["sq_receita"] < 0:
        values["sq_receita"] = None
    return values, cpf


def parse_despesa(row: dict[str, str]) -> tuple[dict[str, Any], str | None]:
    cnpj, cpf = _documento(row.get("NR_CPF_CNPJ_FORNECEDOR"))
    values = {
        **_candidato(row),
        "fornecedor_tipo": _text(row.get("DS_TIPO_FORNECEDOR")),
        "fornecedor_cnae": _text(row.get("DS_CNAE_FORNECEDOR")),
        "fornecedor_cnpj": cnpj,
        "fornecedor_nome": _text(row.get("NM_FORNECEDOR")),
        "fornecedor_nome_rfb": _text(row.get("NM_FORNECEDOR_RFB")),
        "fornecedor_esfera": _esfera(row.get("CD_ESFERA_PART_FORNECEDOR")),
        "fornecedor_uf": _text(row.get("SG_UF_FORNECEDOR")),
        "fornecedor_municipio": _text(row.get("NM_MUNICIPIO_FORNECEDOR")),
        "fornecedor_sq_candidato": _int(row.get("SQ_CANDIDATO_FORNECEDOR")),
        "fornecedor_nr_partido": _int(row.get("NR_PARTIDO_FORNECEDOR")),
        "fornecedor_sg_partido": _text(row.get("SG_PARTIDO_FORNECEDOR")),
        "tipo_documento": _text(row.get("DS_TIPO_DOCUMENTO")),
        "nr_documento": _text(row.get("NR_DOCUMENTO")),
        "cd_origem": _int(row.get("CD_ORIGEM_DESPESA")),
        "ds_origem": _text(row.get("DS_ORIGEM_DESPESA")),
        "sq_despesa": _int(row.get("SQ_DESPESA")),
        "data": _date(row.get("DT_DESPESA")),
        "descricao": _text(row.get("DS_DESPESA")),
        "valor": _decimal(row.get("VR_DESPESA_CONTRATADA")),
    }
    for negativo in ("fornecedor_sq_candidato", "fornecedor_nr_partido", "cd_origem", "sq_despesa"):
        if values[negativo] is not None and values[negativo] < 0:
            values[negativo] = None
    return values, cpf


def read_member(archive: zipfile.ZipFile, name: str) -> Iterator[dict[str, str]]:
    if name not in archive.namelist():
        raise ValueError(f"{name} não encontrado no arquivo do TSE")
    with archive.open(name) as raw:
        text = io.TextIOWrapper(raw, encoding="latin-1", newline="")
        yield from csv.DictReader(text, delimiter=";")


@dataclass
class CollectStats:
    receitas: SyncStats | None = None
    doadores_originarios: SyncStats | None = None
    despesas: SyncStats | None = None
    doadores_pf: int = 0
    fornecedores_pf: int = 0


def _sync_member(
    conn: pg8000.native.Connection,
    archive: zipfile.ZipFile,
    *,
    member: str,
    table: str,
    ident_table: str,
    ano: int,
    parse: Callable[[dict[str, str]], tuple[dict[str, Any], str | None]],
    keep: Callable[[dict[str, str]], bool],
    cpf_hash_key: str,
    raw_object_id: Any,
    on_new: Callable[[Any], None] | None = None,
) -> SyncStats:
    def rows() -> Iterator[tuple[str, tuple[dict[str, Any], str | None]]]:
        for row in read_member(archive, member):
            if not keep(row):
                continue
            values, cpf = parse(row)
            yield row_key(row), (values, hash_cpf(cpf, cpf_hash_key))

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
    cargos: set[int] | None = None,
) -> CollectStats:
    """Baixa o zip de cada ano e sincroniza receitas, doadores originários e despesas
    dos cargos pedidos (padrão: federais)."""
    stats = CollectStats()
    cargos = cargos if cargos is not None else CARGOS_FEDERAIS

    def cargo_ok(row: dict[str, str]) -> bool:
        return not cargos or _int(row.get("CD_CARGO")) in cargos

    def conta_pf(campo: str) -> Callable[[Any], None]:
        def inner(item: Any) -> None:
            if item[1]:
                setattr(stats, campo, getattr(stats, campo) + 1)

        return inner

    for ano in anos:
        response, stored = client.fetch_and_store(
            storage,
            registry,
            source=SOURCE,
            dataset="prestacao-contas-candidatos",
            url=URL.format(ano=ano),
            headers={"Accept": "*/*"},
        )
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            prestadores: set[str] = set()

            def receita_ok(row: dict[str, str]) -> bool:
                if not cargo_ok(row):
                    return False
                prestadores.add(row["SQ_PRESTADOR_CONTAS"])  # noqa: B023 - uso imediato
                return True

            stats.receitas = _sync_member(
                conn,
                archive,
                member=f"receitas_candidatos_{ano}_BRASIL.csv",
                table="canon.tse_receita",
                ident_table="ident.tse_receita_doador",
                ano=ano,
                parse=parse_receita,
                keep=receita_ok,
                cpf_hash_key=cpf_hash_key,
                raw_object_id=stored.raw.id,
                on_new=conta_pf("doadores_pf"),
            )
            stats.doadores_originarios = _sync_member(
                conn,
                archive,
                member=f"receitas_candidatos_doador_originario_{ano}_BRASIL.csv",
                table="canon.tse_receita_doador_originario",
                ident_table="ident.tse_receita_doador_originario_doador",
                ano=ano,
                parse=parse_doador_originario,
                keep=lambda row: not cargos or row["SQ_PRESTADOR_CONTAS"] in prestadores,  # noqa: B023
                cpf_hash_key=cpf_hash_key,
                raw_object_id=stored.raw.id,
            )
            stats.despesas = _sync_member(
                conn,
                archive,
                member=f"despesas_contratadas_candidatos_{ano}_BRASIL.csv",
                table="canon.tse_despesa",
                ident_table="ident.tse_despesa_fornecedor",
                ano=ano,
                parse=parse_despesa,
                keep=cargo_ok,
                cpf_hash_key=cpf_hash_key,
                raw_object_id=stored.raw.id,
                on_new=conta_pf("fornecedores_pf"),
            )
    logger.info("tse-contas-candidatos: %s", stats)
    return stats
