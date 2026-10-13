import pytest

from vida_publica_ingest.adapters.memory import MemoryJobRecorder
from vida_publica_ingest.jobs import run_job
from vida_publica_ingest.models import JobStatus


def test_job_bem_sucedido_e_registrado():
    recorder = MemoryJobRecorder()
    run = run_job("teste", lambda: None, recorder)
    assert run.status is JobStatus.SUCCEEDED
    assert run.finished_at is not None
    assert recorder.runs == [run]


def test_job_com_falha_registra_erro_e_propaga():
    recorder = MemoryJobRecorder()

    def falha() -> None:
        raise RuntimeError("fonte fora do ar")

    with pytest.raises(RuntimeError):
        run_job("teste", falha, recorder)
    run = recorder.runs[0]
    assert run.status is JobStatus.FAILED
    assert run.error == "RuntimeError: fonte fora do ar"
