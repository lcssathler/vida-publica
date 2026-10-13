"""Adaptadores Postgres (driver pg8000, Python puro)."""

from typing import Any

import pg8000.native

from ..config import Settings
from ..models import JobRun, RawObject


def connect(settings: Settings) -> pg8000.native.Connection:
    return pg8000.native.Connection(
        user=settings.db_user,
        password=settings.db_password.get_secret_value(),
        host=settings.db_host,
        port=settings.db_port,
        database=settings.db_name,
        application_name="vp-ingest",
    )


def rows_as_dicts(conn: pg8000.native.Connection, sql: str, **params: Any) -> list[dict[str, Any]]:
    """Executa uma consulta e devolve as linhas como dicionários."""
    rows = conn.run(sql, **params)
    columns = [column["name"] for column in conn.columns or []]
    return [dict(zip(columns, row, strict=True)) for row in rows]


class PgRawRegistry:
    def __init__(self, conn: pg8000.native.Connection) -> None:
        self._conn = conn

    def find(self, source: str, dataset: str, sha256: str) -> RawObject | None:
        rows = rows_as_dicts(
            self._conn,
            "SELECT id, source, dataset, sha256, key, size_bytes, content_type, fetched_at"
            " FROM raw.raw_object WHERE source = :source AND dataset = :dataset"
            " AND sha256 = :sha256",
            source=source,
            dataset=dataset,
            sha256=sha256,
        )
        return RawObject(**rows[0]) if rows else None

    def add(self, raw: RawObject) -> None:
        self._conn.run(
            "INSERT INTO raw.raw_object"
            " (id, source, dataset, sha256, key, size_bytes, content_type, fetched_at)"
            " VALUES (:id, :source, :dataset, :sha256, :key, :size_bytes, :content_type,"
            " :fetched_at)",
            id=raw.id,
            source=raw.source,
            dataset=raw.dataset,
            sha256=raw.sha256,
            key=raw.key,
            size_bytes=raw.size_bytes,
            content_type=raw.content_type,
            fetched_at=raw.fetched_at,
        )


class PgJobRecorder:
    def __init__(self, conn: pg8000.native.Connection) -> None:
        self._conn = conn

    def start(self, run: JobRun) -> None:
        self._conn.run(
            "INSERT INTO raw.job_run (id, job, status, started_at)"
            " VALUES (:id, :job, :status, :started_at)",
            id=run.id,
            job=run.job,
            status=run.status.value,
            started_at=run.started_at,
        )

    def finish(self, run: JobRun) -> None:
        self._conn.run(
            "UPDATE raw.job_run SET status = :status, finished_at = :finished_at,"
            " error = :error WHERE id = :id",
            id=run.id,
            status=run.status.value,
            finished_at=run.finished_at,
            error=run.error,
        )
