import logging
from collections.abc import Callable
from datetime import UTC, datetime

from .models import JobRun, JobStatus
from .observabilidade import transacao_do_job
from .ports import JobRecorder

logger = logging.getLogger(__name__)


def run_job(name: str, work: Callable[[], None], recorder: JobRecorder) -> JobRun:
    """Executa um job registrando início, fim e erro.

    A falha é registrada e propagada: quem agenda decide se tenta de novo.
    """
    run = JobRun(job=name, started_at=datetime.now(UTC))
    recorder.start(run)
    with transacao_do_job(name):
        try:
            work()
        except Exception as error:
            run.status = JobStatus.FAILED
            run.error = f"{type(error).__name__}: {error}"
            run.finished_at = datetime.now(UTC)
            recorder.finish(run)
            # Com o Sentry ligado, o erro registrado aqui vira um evento lá.
            logger.exception("job %s falhou", name, extra={"job": name, "job_run": str(run.id)})
            raise
    run.status = JobStatus.SUCCEEDED
    run.finished_at = datetime.now(UTC)
    recorder.finish(run)
    duracao = (run.finished_at - run.started_at).total_seconds()
    logger.info(
        "job %s terminou",
        name,
        extra={"job": name, "job_run": str(run.id), "duracao_s": round(duracao, 3)},
    )
    return run
