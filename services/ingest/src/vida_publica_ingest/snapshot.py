"""Sincronização de arquivos que são fotografias completas (cota, CEAPS, contas do TSE).

Cada linha ganha um id estável (hash dos campos mais um índice entre linhas
idênticas). A cada coleta: linhas novas entram, linhas que sumiram ganham
removido_em, linhas que voltaram perdem a marca. Nada é reescrito.
"""

import hashlib
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from typing import Any, Protocol
from uuid import UUID

import pg8000.native

from .adapters.postgres import transaction

BATCH = 500
_IDENTIFIER_CHARS = set("abcdefghijklmnopqrstuvwxyz0123456789_.")


def row_id(scope: str, key: str, occurrence: int) -> str:
    return hashlib.sha256(f"{scope}|{key}|{occurrence}".encode()).hexdigest()


def with_ids(scope: str, rows: Iterable[tuple[str, Any]]) -> Iterator[tuple[str, Any]]:
    """Recebe (chave, item) e devolve (id, item), numerando chaves repetidas."""
    occurrences: dict[str, int] = {}
    for key, item in rows:
        occurrences[key] = occurrences.get(key, 0) + 1
        yield row_id(scope, key, occurrences[key]), item


class SnapshotTable(Protocol):
    def ids(self) -> dict[str, bool]:
        """id -> está marcado como removido."""
        ...

    def insert_many(self, items: list[tuple[str, Any]], *, raw_object_id: UUID | None) -> None: ...

    def mark_removed(self, ids: list[str]) -> None: ...

    def restore(self, ids: list[str]) -> None: ...


@dataclass
class SyncStats:
    linhas: int = 0
    novas: int = 0
    removidas: int = 0
    restauradas: int = 0


def sync(
    table: SnapshotTable,
    rows: Iterable[tuple[str, Any]],
    *,
    raw_object_id: UUID | None,
    on_new: Any = None,
) -> SyncStats:
    """Aplica a fotografia `rows` (id, item) sobre a tabela."""
    stats = SyncStats()
    existentes = table.ids()
    presentes: set[str] = set()
    batch: list[tuple[str, Any]] = []
    for id_, item in rows:
        stats.linhas += 1
        presentes.add(id_)
        if id_ in existentes:
            continue
        if on_new is not None:
            on_new(item)
        batch.append((id_, item))
        if len(batch) >= BATCH:
            table.insert_many(batch, raw_object_id=raw_object_id)
            stats.novas += len(batch)
            batch = []
    table.insert_many(batch, raw_object_id=raw_object_id)
    stats.novas += len(batch)
    removidas = [i for i, removida in existentes.items() if not removida and i not in presentes]
    restauradas = [i for i, removida in existentes.items() if removida and i in presentes]
    table.mark_removed(removidas)
    table.restore(restauradas)
    stats.removidas = len(removidas)
    stats.restauradas = len(restauradas)
    return stats


def _check_identifier(name: str) -> str:
    if not name or set(name) - _IDENTIFIER_CHARS:
        raise ValueError(f"identificador inválido: {name!r}")
    return name


class PgSnapshotTable:
    """Tabela de fotografia no Postgres: id char(64), visto_em, removido_em e um escopo
    (ex.: ano) que delimita a comparação. Ids sensíveis vão para uma tabela em ident."""

    def __init__(
        self,
        conn: pg8000.native.Connection,
        table: str,
        *,
        scope_column: str,
        scope_value: Any,
        ident_table: str | None = None,
        ident_column: str = "cpf_hash",
    ) -> None:
        self._conn = conn
        self._table = _check_identifier(table)
        self._scope_column = _check_identifier(scope_column)
        self._scope_value = scope_value
        self._ident_table = _check_identifier(ident_table) if ident_table else None
        self._ident_column = _check_identifier(ident_column)

    def ids(self) -> dict[str, bool]:
        rows = self._conn.run(
            f"SELECT id, removido_em IS NOT NULL FROM {self._table}"  # noqa: S608 - validado
            f" WHERE {self._scope_column} = :scope",
            scope=self._scope_value,
        )
        return {row[0]: row[1] for row in rows}

    def insert_many(
        self, items: list[tuple[str, tuple[dict[str, Any], str | None]]], *, raw_object_id
    ) -> None:
        """items: (id, (valores da linha, hash sensível ou None))."""
        if not items:
            return
        columns = ["id", *items[0][1][0], "raw_object_id"]
        for column in columns:
            _check_identifier(column)
        placeholders = ", ".join(":" + c for c in columns)
        sql = (
            f"INSERT INTO {self._table} ({', '.join(columns)})"  # noqa: S608 - validado
            f" VALUES ({placeholders}) ON CONFLICT (id) DO NOTHING"
        )
        with transaction(self._conn):
            for id_, (values, sensitive) in items:
                self._conn.run(sql, id=id_, raw_object_id=raw_object_id, **values)
                if sensitive and self._ident_table:
                    self._conn.run(
                        f"INSERT INTO {self._ident_table} (linha_id, {self._ident_column})"  # noqa: S608
                        " VALUES (:id, :hash) ON CONFLICT (linha_id) DO NOTHING",
                        id=id_,
                        hash=sensitive,
                    )

    def mark_removed(self, ids: list[str]) -> None:
        for start in range(0, len(ids), 1000):
            self._conn.run(
                f"UPDATE {self._table} SET removido_em = now()"  # noqa: S608 - validado
                " WHERE id = ANY(:ids) AND removido_em IS NULL",
                ids=ids[start : start + 1000],
            )

    def restore(self, ids: list[str]) -> None:
        for start in range(0, len(ids), 1000):
            self._conn.run(
                f"UPDATE {self._table} SET removido_em = NULL, visto_em = now()"  # noqa: S608
                " WHERE id = ANY(:ids)",
                ids=ids[start : start + 1000],
            )
