"""Vigia de dados desatualizados.

Cada job tem um prazo máximo sem coleta bem-sucedida (raw.fonte_prazo, a
partir de raw.job_run). Estourou, abre um alerta (raw.alerta) e avisa; a coleta
voltou, o alerta fecha e avisa. Um alerta aberto é lembrado a cada 24 h, não a
cada volta. A cada volta, o vigia manda o sinal de vida do conjunto "fontes"
(tudo no prazo ou não), que também mostra que o próprio vigia está rodando.
O motor de eventos entra como os jobs eventos-<tipo>.
"""

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from tempfile import gettempdir
from typing import Any

import pg8000.native

from .adapters.postgres import rows_as_dicts, transaction
from .observabilidade import Alertador

logger = logging.getLogger(__name__)

LEMBRETE = timedelta(hours=24)
SINAL_DE_VIDA = Path(gettempdir()) / "vigia-vivo"


@dataclass(frozen=True)
class Prazo:
    job: str
    prazo: timedelta
    descricao: str


@dataclass(frozen=True)
class Situacao:
    job: str
    descricao: str
    prazo: timedelta
    ultimo_sucesso: datetime | None

    def atrasado(self, agora: datetime) -> bool:
        return self.ultimo_sucesso is None or agora - self.ultimo_sucesso > self.prazo

    def detalhe(self, agora: datetime) -> dict[str, Any]:
        return {
            "job": self.job,
            "descricao": self.descricao,
            "prazo_horas": round(self.prazo.total_seconds() / 3600, 1),
            "ultimo_sucesso": self.ultimo_sucesso.isoformat() if self.ultimo_sucesso else None,
            "horas_sem_coleta": (
                round((agora - self.ultimo_sucesso).total_seconds() / 3600, 1)
                if self.ultimo_sucesso
                else None
            ),
        }


@dataclass(frozen=True)
class AlertaAberto:
    id: int
    chave: str
    aviso_em: datetime


@dataclass
class Resultado:
    no_prazo: int = 0
    atrasados: int = 0
    abertos: int = 0
    lembrados: int = 0
    resolvidos: int = 0


class VigiaRepository:
    def __init__(self, conn: pg8000.native.Connection) -> None:
        self._conn = conn

    def transaction(self):
        return transaction(self._conn)

    def situacoes(self) -> list[Situacao]:
        rows = rows_as_dicts(
            self._conn,
            "SELECT p.job, p.descricao, p.prazo,"
            " (SELECT max(r.finished_at) FROM raw.job_run r"
            "   WHERE r.job = p.job AND r.status = 'succeeded') AS ultimo"
            " FROM raw.fonte_prazo p WHERE p.ativo ORDER BY p.job",
        )
        return [Situacao(r["job"], r["descricao"], r["prazo"], r["ultimo"]) for r in rows]

    def abertos(self) -> dict[str, AlertaAberto]:
        # Um vigia por vez (dois rodando abririam o mesmo alerta duas vezes).
        self._conn.run("SELECT pg_advisory_xact_lock(hashtext('vp-vigia'))")
        rows = rows_as_dicts(
            self._conn,
            "SELECT id, chave, aviso_em FROM raw.alerta WHERE resolvido_em IS NULL FOR UPDATE",
        )
        return {r["chave"]: AlertaAberto(r["id"], r["chave"], r["aviso_em"]) for r in rows}

    def abrir(self, chave: str, detalhe: dict[str, Any], agora: datetime) -> None:
        self._conn.run(
            "INSERT INTO raw.alerta (chave, aberto_em, aviso_em, detalhe)"
            " VALUES (:chave, :agora, :agora, CAST(:detalhe AS jsonb))",
            chave=chave,
            agora=agora,
            detalhe=_json(detalhe),
        )

    def lembrar(self, alerta_id: int, detalhe: dict[str, Any], agora: datetime) -> None:
        self._conn.run(
            "UPDATE raw.alerta SET aviso_em = :agora, detalhe = CAST(:detalhe AS jsonb)"
            " WHERE id = :id",
            id=alerta_id,
            agora=agora,
            detalhe=_json(detalhe),
        )

    def resolver(self, alerta_id: int, agora: datetime) -> None:
        self._conn.run(
            "UPDATE raw.alerta SET resolvido_em = :agora WHERE id = :id",
            id=alerta_id,
            agora=agora,
        )


def _json(valor: dict[str, Any]) -> str:
    import json

    return json.dumps(valor, ensure_ascii=False)


def chave_da_fonte(job: str) -> str:
    return f"fonte:{job}"


def vigiar(repo: VigiaRepository, alertador: Alertador, agora: datetime | None = None) -> Resultado:
    """Uma volta: confere cada prazo, abre, lembra e fecha alertas, manda o sinal de vida."""
    agora = agora or datetime.now(UTC)
    resultado = Resultado()
    avisos: list[Callable[[], None]] = []
    atrasados: list[Situacao] = []
    with repo.transaction():
        abertos = repo.abertos()
        for situacao in repo.situacoes():
            chave = chave_da_fonte(situacao.job)
            detalhe = situacao.detalhe(agora)
            alerta = abertos.get(chave)
            if situacao.atrasado(agora):
                resultado.atrasados += 1
                atrasados.append(situacao)
                if alerta is None:
                    repo.abrir(chave, detalhe, agora)
                    resultado.abertos += 1
                    avisos.append(lambda c=chave, d=detalhe: alertador.aberto(c, d, False))
                elif agora - alerta.aviso_em >= LEMBRETE:
                    repo.lembrar(alerta.id, detalhe, agora)
                    resultado.lembrados += 1
                    avisos.append(lambda c=chave, d=detalhe: alertador.aberto(c, d, True))
            else:
                resultado.no_prazo += 1
                if alerta is not None:
                    repo.resolver(alerta.id, agora)
                    resultado.resolvidos += 1
                    avisos.append(lambda c=chave, d=detalhe: alertador.resolvido(c, d))
    # Avisa depois de gravar: um aviso que falha não desfaz o estado.
    for aviso in avisos:
        aviso()
    alertador.situacao("fontes", not atrasados, _texto(atrasados, agora))
    logger.info("vigia", extra={"resultado": vars(resultado)})
    return resultado


def _texto(atrasados: list[Situacao], agora: datetime) -> str:
    if not atrasados:
        return "Todas as fontes dentro do prazo."
    linhas = [f"{len(atrasados)} fonte(s) sem coleta bem-sucedida dentro do prazo:"]
    for s in atrasados:
        d = s.detalhe(agora)
        quando = f"há {d['horas_sem_coleta']} h" if s.ultimo_sucesso else "nunca"
        linhas.append(f"- {s.job}: última coleta {quando} (prazo {d['prazo_horas']} h)")
    return "\n".join(linhas)


def continuo(
    conectar: Callable[[], pg8000.native.Connection],
    alertador: Alertador,
    intervalo: int,
    parar: Callable[[], bool] = lambda: False,
) -> None:
    """Uma volta por intervalo; erro numa volta vai para o log e a próxima tenta de novo."""
    while not parar():
        SINAL_DE_VIDA.write_text(datetime.now(UTC).isoformat())
        try:
            conn = conectar()
            try:
                vigiar(VigiaRepository(conn), alertador)
            finally:
                conn.close()
        except Exception:
            logger.exception("volta do vigia falhou")
        time.sleep(intervalo)
