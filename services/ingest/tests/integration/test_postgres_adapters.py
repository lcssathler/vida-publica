import uuid
from datetime import UTC, datetime

import pytest

from vida_publica_ingest.adapters.memory import MemoryRawStorage
from vida_publica_ingest.adapters.postgres import PgJobRecorder, PgRawRegistry, rows_as_dicts
from vida_publica_ingest.jobs import run_job
from vida_publica_ingest.raw import store_raw

pytestmark = pytest.mark.integration


def test_registro_de_coletas_evita_duplicar_conteudo(ingest_conn):
    registry, storage = PgRawRegistry(ingest_conn), MemoryRawStorage()
    content = f"conteudo-{uuid.uuid4()}".encode()
    first = store_raw(
        storage,
        registry,
        source="teste",
        dataset="adaptadores",
        content=content,
        content_type="text/csv",
        fetched_at=datetime(2026, 10, 13, 12, 0, tzinfo=UTC),
    )
    second = store_raw(
        storage,
        registry,
        source="teste",
        dataset="adaptadores",
        content=content,
        content_type="text/csv",
    )
    assert first.is_new and not second.is_new
    assert second.raw.id == first.raw.id
    assert second.raw.fetched_at == first.raw.fetched_at


def test_jobs_sao_registrados_com_resultado(ingest_conn):
    recorder = PgJobRecorder(ingest_conn)
    name = f"teste-{uuid.uuid4()}"
    run_job(name, lambda: None, recorder)
    with pytest.raises(ValueError):
        run_job(name, lambda: (_ for _ in ()).throw(ValueError("quebrou")), recorder)

    rows = rows_as_dicts(
        ingest_conn,
        "SELECT status, error, finished_at IS NOT NULL AS terminou FROM raw.job_run"
        " WHERE job = :job ORDER BY started_at",
        job=name,
    )
    assert [row["status"] for row in rows] == ["succeeded", "failed"]
    assert rows[1]["error"] == "ValueError: quebrou"
    assert all(row["terminou"] for row in rows)
