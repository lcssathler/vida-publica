"""CEAPS: despesas dos senadores, arquivo anual do Senado comparado com o banco."""

import csv
import io
import logging
import re
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

import pg8000.native

from ..http import SourceClient
from ..identity import hash_cpf, normalize_name
from ..ports import RawRegistry, RawStorage
from ..snapshot import PgSnapshotTable, SyncStats, sync, with_ids
from .senado_senadores import SOURCE

logger = logging.getLogger(__name__)

URL = "https://www.senado.gov.br/transparencia/LAI/verba/despesa_ceaps_{ano}.csv"
_DIGITS = re.compile(r"\D")


def _text(value: str | None) -> str | None:
    text = (value or "").strip()
    return text or None


def _decimal(value: str | None) -> Decimal:
    text = (value or "0").strip().replace(".", "").replace(",", ".")
    return Decimal(text or "0")


def _date(value: str | None) -> date | None:
    text = _text(value)
    if not text:
        return None
    day, month, year = text[:10].split("/")
    return date(int(year), int(month), int(day))


def read_csv(content: bytes) -> Iterator[dict[str, str]]:
    """Lê o CSV (latin-1, ';'), pulando a primeira linha ("ULTIMA ATUALIZACAO")."""
    text = content.decode("latin-1")
    first_break = text.find("\n")
    body = text[first_break + 1 :] if text.startswith('"ULTIMA ATUALIZACAO"') else text
    yield from csv.DictReader(io.StringIO(body, newline=""), delimiter=";")


def row_key(row: dict[str, str]) -> str:
    return "|".join((row.get(c) or "").strip() for c in row)


def parse_row(
    row: dict[str, str], *, codigo_senado: int | None
) -> tuple[dict[str, Any], str | None]:
    """Valores da linha e o CPF do fornecedor pessoa física em claro (vira hash antes de gravar)."""
    documento = _DIGITS.sub("", row.get("CNPJ_CPF") or "")
    values = {
        "ano": int(row["ANO"]),
        "mes": int(row["MES"]),
        "codigo_senado": codigo_senado,
        "nome_senador": _text(row.get("SENADOR")) or "",
        "tipo_despesa": _text(row.get("TIPO_DESPESA")),
        "fornecedor": _text(row.get("FORNECEDOR")),
        "fornecedor_cnpj": documento if len(documento) == 14 else None,
        "documento": _text(row.get("DOCUMENTO")),
        "data": _date(row.get("DATA")),
        "detalhamento": _text(row.get("DETALHAMENTO")),
        "valor": _decimal(row.get("VALOR_REEMBOLSADO")),
        "cod_documento": int(row["COD_DOCUMENTO"])
        if (row.get("COD_DOCUMENTO") or "").isdigit()
        else None,
    }
    return values, documento if len(documento) == 11 else None


@dataclass
class CollectStats(SyncStats):
    sem_senador: int = 0
    fornecedores_pf: int = 0


class Senadores:
    """Casa o nome do arquivo com canon.senado_senador: nome parlamentar, depois nome
    completo, depois nome completo começando pelo nome do arquivo ("WEVERTON ROCHA" ->
    "Weverton Rocha Marques de Sousa"). Em exercício tem prioridade."""

    def __init__(self, rows: list[tuple[str, str | None, int]]) -> None:
        self._parlamentar: dict[str, int] = {}
        self._completo: dict[str, int] = {}
        for nome, completo, codigo in rows:
            self._parlamentar.setdefault(normalize_name(nome), codigo)
            if completo:
                self._completo.setdefault(normalize_name(completo), codigo)

    def codigo(self, nome: str | None) -> int | None:
        chave = normalize_name(nome)
        if not chave:
            return None
        encontrado = self._parlamentar.get(chave) or self._completo.get(chave)
        if encontrado is not None:
            return encontrado
        prefixo = [c for n, c in self._completo.items() if n.startswith(chave + " ")]
        return prefixo[0] if len(set(prefixo)) == 1 else None


def senadores_por_nome(conn: pg8000.native.Connection) -> Senadores:
    return Senadores(
        conn.run(
            "SELECT nome_parlamentar, nome_completo, codigo_senado FROM canon.senado_senador"
            " ORDER BY em_exercicio DESC, codigo_senado"
        )
    )


def collect(
    client: SourceClient,
    storage: RawStorage,
    registry: RawRegistry,
    conn: pg8000.native.Connection,
    *,
    cpf_hash_key: str,
    anos: list[int],
) -> CollectStats:
    total = CollectStats()
    nomes = senadores_por_nome(conn)
    for ano in anos:
        # O servidor do Senado responde 406 ao Accept: application/json padrão.
        response, stored = client.fetch_and_store(
            storage,
            registry,
            source=SOURCE,
            dataset="ceaps",
            url=URL.format(ano=ano),
            headers={"Accept": "*/*"},
        )

        def rows() -> Iterator[tuple[str, tuple[dict[str, Any], str | None]]]:
            for row in read_csv(response.content):  # noqa: B023 - consumido dentro do laço
                codigo = nomes.codigo(row.get("SENADOR"))
                values, cpf = parse_row(row, codigo_senado=codigo)
                yield row_key(row), (values, hash_cpf(cpf, cpf_hash_key))

        def on_new(item: tuple[dict[str, Any], str | None]) -> None:
            total.sem_senador += item[0]["codigo_senado"] is None
            total.fornecedores_pf += item[1] is not None

        table = PgSnapshotTable(
            conn,
            "canon.senado_despesa",
            scope_column="ano",
            scope_value=ano,
            ident_table="ident.senado_despesa_fornecedor",
        )
        stats = sync(
            table, with_ids(f"ceaps:{ano}", rows()), raw_object_id=stored.raw.id, on_new=on_new
        )
        for campo in ("linhas", "novas", "removidas", "restauradas"):
            setattr(total, campo, getattr(total, campo) + getattr(stats, campo))
        logger.info("ceaps-senado %s: %s", ano, stats)
    logger.info("ceaps-senado: %s", total)
    return total
