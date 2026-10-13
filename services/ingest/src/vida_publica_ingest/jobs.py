import logging
from collections.abc import Callable
from datetime import UTC, datetime

from .models import JobRun, JobStatus
from .ports import JobRecorder

logger = logging.getLogger(__name__)


def run_job(name: str, work: Callable[[], None], recorder: JobRecorder) -> JobRun:
    """Executa um job registrando início, fim e erro.

    A falha é registrada e propagada: quem agenda decide se tenta de novo.
    """
    run = JobRun(job=name, started_at=datetime.now(UTC))
    recorder.start(run)
    try:
        work()
    except Exception as error:
        run.status = JobStatus.FAILED
        run.error = f"{type(error).__name__}: {error}"
        run.finished_at = datetime.now(UTC)
        recorder.finish(run)
        logger.exception("job %s falhou", name)
        raise
    run.status = JobStatus.SUCCEEDED
    run.finished_at = datetime.now(UTC)
    recorder.finish(run)
    return run
