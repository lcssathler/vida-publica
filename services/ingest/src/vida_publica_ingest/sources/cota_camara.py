"""Cota parlamentar da Câmara (CEAP): arquivo anual, comparado todo dia com o banco."""

import csv
import hashlib
import io
import logging
import re
import zipfile
from collections.abc import Iterator
from dataclasses import asdict, dataclass
from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

import pg8000.native

from ..adapters.postgres import transaction
from ..http import SourceClient
from ..identity import hash_cpf
from ..ports import RawRegistry, RawStorage
from .camara_deputados import SOURCE

logger = logging.getLogger(__name__)

URL = "https://www.camara.leg.br/cotas/Ano-{ano}.csv.zip"
BATCH = 1000
_DIGITS = re.compile(r"\D")


@dataclass(frozen=True)
class Despesa:
    id: str
    ano: int
    mes: int
    id_camara: int | None
    nu_deputado_id: int | None
    nome_parlamentar: str
    sigla_uf: str | None
    sigla_partido: str | None
    id_legislatura: int | None
    num_subcota: int
    descricao: str | None
    num_especificacao: int | None
    descricao_especificacao: str | None
    fornecedor: str | None
    fornecedor_cnpj: str | None
    numero_documento: str | None
    tipo_documento: int | None
    emitido_em: date | None
    valor_documento: Decimal | None
    valor_glosa: Decimal | None
    valor_liquido: Decimal
    parcela: int | None
    passageiro: str | None
    trecho: str | None
    lote: int | None
    ressarcimento: int | None
    restituicao_paga_em: date | None
    valor_restituicao: Decimal | None
    ide_documento: int | None
    url_documento: str | None


def _text(value: str | None) -> str | None:
    text = (value or "").strip()
    return text or None


def _int(value: str | None) -> int | None:
    text = _text(value)
    return int(text) if text and text.lstrip("-").isdigit() else None


def _decimal(value: str | None) -> Decimal | None:
    text = _text(value)
    return Decimal(text.replace(",", ".")) if text else None


def _date(value: str | None) -> date | None:
    text = _text(value)
    return date.fromisoformat(text[:10]) if text else None


# Campos que identificam uma linha no arquivo; linhas idênticas ganham um índice.
_KEY_FIELDS = (
    "ideDocumento",
    "nuDeputadoId",
    "numSubCota",
    "numEspecificacaoSubCota",
    "txtCNPJCPF",
    "txtNumero",
    "datEmissao",
    "vlrDocumento",
    "vlrGlosa",
    "vlrLiquido",
    "numMes",
    "numAno",
    "numParcela",
    "txtPassageiro",
    "txtTrecho",
    "numLote",
    "numRessarcimento",
)


def row_key(row: dict[str, str]) -> str:
    return "|".join((row.get(campo) or "").strip() for campo in _KEY_FIELDS)


def row_id(ano_arquivo: int, key: str, occurrence: int) -> str:
    return hashlib.sha256(f"{ano_arquivo}|{key}|{occurrence}".encode()).hexdigest()


def parse_row(row: dict[str, str], *, id: str) -> tuple[Despesa, str | None]:
    """Converte uma linha. Devolve a despesa e o CPF do fornecedor pessoa física
    em claro (11 dígitos), que vira hash antes de qualquer gravação."""
    documento = _DIGITS.sub("", row.get("txtCNPJCPF") or "")
    despesa = Despesa(
        id=id,
        ano=int(row["numAno"]),
        mes=int(row["numMes"]),
        id_camara=_int(row.get("ideCadastro")),
        nu_deputado_id=_int(row.get("nuDeputadoId")),
        nome_parlamentar=_text(row.get("txNomeParlamentar")) or "",
        sigla_uf=_text(row.get("sgUF")),
        sigla_partido=_text(row.get("sgPartido")),
        id_legislatura=_int(row.get("codLegislatura")),
        num_subcota=int(row["numSubCota"]),
        descricao=_text(row.get("txtDescricao")),
        num_especificacao=_int(row.get("numEspecificacaoSubCota")),
        descricao_especificacao=_text(row.get("txtDescricaoEspecificacao")),
        fornecedor=_text(row.get("txtFornecedor")),
        fornecedor_cnpj=documento if len(documento) == 14 else None,
        numero_documento=_text(row.get("txtNumero")),
        tipo_documento=_int(row.get("indTipoDocumento")),
        emitido_em=_date(row.get("datEmissao")),
        valor_documento=_decimal(row.get("vlrDocumento")),
        valor_glosa=_decimal(row.get("vlrGlosa")),
        valor_liquido=_decimal(row.get("vlrLiquido")) or Decimal(0),
        parcela=_int(row.get("numParcela")),
        passageiro=_text(row.get("txtPassageiro")),
        trecho=_text(row.get("txtTrecho")),
        lote=_int(row.get("numLote")),
        ressarcimento=_int(row.get("numRessarcimento")),
        restituicao_paga_em=_date(row.get("datPagamentoRestituicao")),
        valor_restituicao=_decimal(row.get("vlrRestituicao")),
        ide_documento=_int(row.get("ideDocumento")),
        url_documento=_text(row.get("urlDocumento")),
    )
    return despesa, documento if len(documento) == 11 else None


def read_zip(content: bytes, ano: int) -> Iterator[dict[str, str]]:
    """Lê Ano-{ano}.csv do zip (UTF-8 com BOM, separador ';')."""
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        name = f"Ano-{ano}.csv"
        if name not in archive.namelist():
            raise ValueError(f"{name} não encontrado no arquivo da Câmara")
        with archive.open(name) as raw:
            text = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
            yield from csv.DictReader(text, delimiter=";")


def parse_file(content: bytes, ano: int) -> Iterator[tuple[Despesa, str | None]]:
    """Linhas do arquivo com id estável: hash dos campos-chave mais o índice entre iguais."""
    occurrences: dict[str, int] = {}
    for row in read_zip(content, ano):
        key = row_key(row)
        occurrences[key] = occurrences.get(key, 0) + 1
        yield parse_row(row, id=row_id(ano, key, occurrences[key]))


@dataclass
class CollectStats:
    linhas: int = 0
    novas: int = 0
    removidas: int = 0
    restauradas: int = 0
    fornecedores_pf: int = 0
    sem_deputado: int = 0


class CamaraDespesaRepository:
    def __init__(self, conn: pg8000.native.Connection) -> None:
        self._conn = conn

    def ids_do_ano(self, ano: int) -> dict[str, bool]:
        """id -> está marcado como removido."""
        rows = self._conn.run(
            "SELECT id, removido_em IS NOT NULL FROM canon.camara_despesa WHERE ano = :ano", ano=ano
        )
        return {row[0]: row[1] for row in rows}

    def insert_many(
        self, items: list[tuple[Despesa, str | None]], *, raw_object_id: UUID | None
    ) -> None:
        if not items:
            return
        columns = [*asdict(items[0][0]), "raw_object_id"]
        sql = (
            f"INSERT INTO canon.camara_despesa ({', '.join(columns)})"  # noqa: S608 - nomes fixos
            f" VALUES ({', '.join(':' + c for c in columns)}) ON CONFLICT (id) DO NOTHING"
        )
        with transaction(self._conn):
            for despesa, cpf_hash in items:
                values: dict[str, Any] = asdict(despesa)
                values["raw_object_id"] = raw_object_id
                self._conn.run(sql, **values)
                if cpf_hash:
                    self._conn.run(
                        "INSERT INTO ident.camara_despesa_fornecedor (despesa_id, cpf_hash)"
                        " VALUES (:id, :cpf) ON CONFLICT (despesa_id) DO NOTHING",
                        id=despesa.id,
                        cpf=cpf_hash,
                    )

    def mark_removed(self, ids: list[str]) -> None:
        for start in range(0, len(ids), BATCH):
            self._conn.run(
                "UPDATE canon.camara_despesa SET removido_em = now()"
                " WHERE id = ANY(:ids) AND removido_em IS NULL",
                ids=ids[start : start + BATCH],
            )

    def restore(self, ids: list[str]) -> None:
        for start in range(0, len(ids), BATCH):
            self._conn.run(
                "UPDATE canon.camara_despesa SET removido_em = NULL, visto_em = now()"
                " WHERE id = ANY(:ids)",
                ids=ids[start : start + BATCH],
            )


def collect(
    client: SourceClient,
    storage: RawStorage,
    registry: RawRegistry,
    repository: CamaraDespesaRepository,
    *,
    cpf_hash_key: str,
    anos: list[int],
) -> CollectStats:
    """Baixa o arquivo de cada ano e aplica a diferença: novas entram, ausentes
    ganham removido_em, as que voltaram perdem a marca."""
    stats = CollectStats()
    for ano in anos:
        response, stored = client.fetch_and_store(
            storage, registry, source=SOURCE, dataset="cota-parlamentar", url=URL.format(ano=ano)
        )
        existentes = repository.ids_do_ano(ano)
        presentes: set[str] = set()
        batch: list[tuple[Despesa, str | None]] = []
        for despesa, cpf in parse_file(response.content, ano):
            stats.linhas += 1
            presentes.add(despesa.id)
            if despesa.id in existentes:
                continue
            cpf_hash = hash_cpf(cpf, cpf_hash_key)
            stats.fornecedores_pf += cpf_hash is not None
            stats.sem_deputado += despesa.id_camara is None
            batch.append((despesa, cpf_hash))
            if len(batch) >= BATCH:
                repository.insert_many(batch, raw_object_id=stored.raw.id)
                stats.novas += len(batch)
                batch = []
        repository.insert_many(batch, raw_object_id=stored.raw.id)
        stats.novas += len(batch)

        removidas = [i for i, removida in existentes.items() if not removida and i not in presentes]
        restauradas = [i for i, removida in existentes.items() if removida and i in presentes]
        repository.mark_removed(removidas)
        repository.restore(restauradas)
        stats.removidas += len(removidas)
        stats.restauradas += len(restauradas)
        logger.info("cota-camara %s: %s", ano, stats)
    return stats
