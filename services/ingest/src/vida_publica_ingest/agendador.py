"""Agendador das coletas e do motor de eventos (vp-ingest agendar).

Cada tarefa é um comando do próprio vp-ingest com um intervalo, tirado da
frequência de coleta de cada fonte (referência técnica). A cada volta, roda em
sequência, na ordem da lista, as tarefas vencidas: coletas antes do motor. Cada
comando roda num processo próprio (uma falha não derruba o agendador) e fica
registrado em raw.job_run como sempre; ao começar, o agendador lê de lá a
última execução bem-sucedida de cada tarefa, para não refazer tudo depois de
reiniciar. O vigia (raw.fonte_prazo) alerta se alguma parar.
"""

import logging
import subprocess
import sys
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from tempfile import gettempdir

import pg8000.native

from .adapters.postgres import rows_as_dicts

logger = logging.getLogger(__name__)

SINAL_DE_VIDA = Path(gettempdir()) / "agendador-vivo"

TIPOS_EVENTO = (
    "voto_nominal",
    "voto_contra_orientacao",
    "pauta",
    "tramitacao",
    "mudanca_regime",
    "proposta_parada",
    "presenca",
    "ausencia",
    "despesa_mensal",
    "fundo_recebido",
    "repasse",
    "doacao",
    "troca_partido",
    "situacao_candidatura",
    "resultado",
)


@dataclass(frozen=True)
class Tarefa:
    nome: str
    # Argumentos do vp-ingest; "{desde}" vira a data de JANELA_DIAS atrás.
    argumentos: tuple[str, ...]
    intervalo: timedelta
    # Jobs que a tarefa grava em raw.job_run (para saber a última execução).
    jobs: tuple[str, ...]


JANELA_DIAS = 3
H = timedelta(hours=1)
M = timedelta(minutes=1)

TAREFAS: tuple[Tarefa, ...] = (
    Tarefa("agenda-pauta", ("agenda-pauta", "--desde", "{desde}"), 30 * M,
           ("camara-eventos", "senado-agenda")),
    Tarefa("camara-votacoes", ("camara-votacoes", "--desde", "{desde}"), 15 * M,
           ("camara-votacoes",)),
    Tarefa("senado-votacoes", ("senado-votacoes", "--desde", "{desde}"), 15 * M,
           ("senado-votacoes",)),
    Tarefa("proposicoes", ("proposicoes",), H, ("proposicoes",)),
    Tarefa("presenca", ("presenca", "--desde", "{desde}"), 24 * H, ("camara-presenca",)),
    Tarefa("camara-deputados", ("camara-deputados",), 24 * H, ("camara-deputados",)),
    Tarefa("senado-senadores", ("senado-senadores",), 24 * H, ("senado-senadores",)),
    Tarefa("cota-camara", ("cota-camara",), 24 * H, ("cota-camara",)),
    Tarefa("ceaps-senado", ("ceaps-senado",), 24 * H, ("ceaps-senado",)),
    Tarefa("tse-candidaturas", ("tse-candidaturas", "--ano", "2026"), 6 * H,
           ("tse-candidaturas",)),
    Tarefa("tse-contas-candidatos", ("tse-contas-candidatos",), 6 * H,
           ("tse-contas-candidatos",)),
    Tarefa("tse-contas-partidos", ("tse-contas-partidos",), 6 * H, ("tse-contas-partidos",)),
    Tarefa("repasses", ("repasses",), 6 * H, ("repasses",)),
    Tarefa("partidos", ("partidos",), 7 * 24 * H, ("partidos",)),
    Tarefa("camara-historico", ("camara-historico",), 7 * 24 * H, ("camara-historico",)),
    Tarefa("resolver-pessoas", ("resolver-pessoas",), 24 * H, ("resolver-pessoas",)),
    Tarefa("mandatos-filiacoes", ("mandatos-filiacoes",), 24 * H, ("mandatos-filiacoes",)),
    Tarefa("eventos", ("eventos",), 10 * M, tuple(f"eventos-{t}" for t in TIPOS_EVENTO)),
)  # fmt: skip


def vencidas(
    tarefas: Sequence[Tarefa], ultimas: dict[str, datetime | None], agora: datetime
) -> list[Tarefa]:
    """Tarefas cuja última execução (a mais antiga entre os jobs dela) passou do intervalo."""
    return [t for t in tarefas if (u := ultimas.get(t.nome)) is None or agora - u >= t.intervalo]


def ultimas_do_banco(
    conn: pg8000.native.Connection, tarefas: Sequence[Tarefa]
) -> dict[str, datetime | None]:
    """Última execução bem-sucedida de cada tarefa (a mais antiga entre os jobs dela)."""
    rows = rows_as_dicts(
        conn,
        "SELECT job, max(finished_at) AS fim FROM raw.job_run"
        " WHERE status = 'succeeded' GROUP BY job",
    )
    por_job = {r["job"]: r["fim"] for r in rows}
    ultimas: dict[str, datetime | None] = {}
    for t in tarefas:
        fins = [por_job.get(j) for j in t.jobs]
        ultimas[t.nome] = None if any(f is None for f in fins) else min(fins)  # type: ignore[type-var]
    return ultimas


def comando(tarefa: Tarefa, agora: datetime) -> list[str]:
    desde = (agora - timedelta(days=JANELA_DIAS)).date().isoformat()
    return [sys.executable, "-m", "vida_publica_ingest.cli"] + [
        a.replace("{desde}", desde) for a in tarefa.argumentos
    ]


def rodar(tarefa: Tarefa, agora: datetime, limite: timedelta = 3 * H) -> bool:
    inicio = time.monotonic()
    try:
        resultado = subprocess.run(  # noqa: S603 - comando montado da lista fixa
            comando(tarefa, agora), timeout=limite.total_seconds(), check=False
        )
        ok = resultado.returncode == 0
    except subprocess.TimeoutExpired:
        ok = False
    logger.log(
        logging.INFO if ok else logging.ERROR,
        "tarefa %s %s",
        tarefa.nome,
        "terminou" if ok else "falhou",
        extra={"tarefa": tarefa.nome, "ok": ok, "duracao_s": round(time.monotonic() - inicio, 1)},
    )
    return ok


def agendar(
    conectar: Callable[[], pg8000.native.Connection],
    tarefas: Sequence[Tarefa] = TAREFAS,
    executar: Callable[[Tarefa, datetime], bool] = rodar,
    relogio: Callable[[], datetime] = lambda: datetime.now(UTC),
    pausa: float = 60,
    voltas: int | None = None,
) -> None:
    conn = conectar()
    try:
        ultimas = ultimas_do_banco(conn, tarefas)
    finally:
        conn.close()
    volta = 0
    while voltas is None or volta < voltas:
        volta += 1
        SINAL_DE_VIDA.write_text(relogio().isoformat())
        for tarefa in vencidas(tarefas, ultimas, relogio()):
            agora = relogio()
            # Falhou ou não: tenta de novo só no próximo intervalo (o vigia
            # alerta se a fonte ficar sem coleta bem-sucedida além do prazo).
            executar(tarefa, agora)
            ultimas[tarefa.nome] = agora
            SINAL_DE_VIDA.write_text(relogio().isoformat())
        if voltas is None or volta < voltas:
            time.sleep(pausa)
