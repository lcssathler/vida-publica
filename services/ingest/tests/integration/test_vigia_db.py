"""Vigia contra o banco: prazos de raw.fonte_prazo, último sucesso em raw.job_run
e alertas em raw.alerta, com o usuário do worker."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from vida_publica_ingest.vigia import VigiaRepository, vigiar

from .test_banco_permissoes import _connect, _denied

pytestmark = pytest.mark.integration


class Avisos:
    def __init__(self) -> None:
        self.chamadas: list[tuple] = []

    def aberto(self, chave, detalhe, lembrete):
        self.chamadas.append(("aberto", chave, lembrete, detalhe))

    def resolvido(self, chave, detalhe):
        self.chamadas.append(("resolvido", chave))

    def situacao(self, nome, ok, texto):
        self.chamadas.append(("situacao", nome, ok))


@pytest.fixture
def job():
    """Um job fictício com prazo de 2 h; apagado no fim (com o dono do banco)."""
    nome = f"teste-vigia-{uuid.uuid4().hex[:8]}"
    dono = _connect("owner")
    dono.run(
        "INSERT INTO raw.fonte_prazo (job, prazo, descricao) VALUES (:j, '2 hours', 'teste')",
        j=nome,
    )
    yield nome
    dono.run("DELETE FROM raw.alerta WHERE chave = :c", c=f"fonte:{nome}")
    dono.run("DELETE FROM raw.job_run WHERE job = :j", j=nome)
    dono.run("DELETE FROM raw.fonte_prazo WHERE job = :j", j=nome)
    dono.close()


def _execucao(conn, job: str, fim: datetime, status: str = "succeeded") -> None:
    conn.run(
        "INSERT INTO raw.job_run (job, status, started_at, finished_at, error)"
        " VALUES (:j, :s, :i, :f, :e)",
        j=job,
        s=status,
        i=fim - timedelta(minutes=1),
        f=fim,
        e=None if status == "succeeded" else "falhou",
    )


def _meus(avisos: Avisos, job: str) -> list[tuple]:
    return [c[:3] for c in avisos.chamadas if len(c) > 1 and c[1] == f"fonte:{job}"]


def test_fonte_parada_abre_alerta_e_coleta_nova_fecha(ingest_conn, job):
    agora = datetime.now(UTC)
    _execucao(ingest_conn, job, agora - timedelta(hours=3))
    # Falha recente não conta como coleta bem-sucedida.
    _execucao(ingest_conn, job, agora - timedelta(minutes=5), status="failed")
    repo = VigiaRepository(ingest_conn)

    avisos = Avisos()
    vigiar(repo, avisos, agora)
    assert _meus(avisos, job) == [("aberto", f"fonte:{job}", False)]
    detalhe = next(c[3] for c in avisos.chamadas if c[:2] == ("aberto", f"fonte:{job}"))
    assert detalhe["horas_sem_coleta"] == 3.0
    [[n]] = ingest_conn.run(
        "SELECT count(*) FROM raw.alerta WHERE chave = :c AND resolvido_em IS NULL",
        c=f"fonte:{job}",
    )
    assert n == 1

    avisos = Avisos()
    vigiar(repo, avisos, agora + timedelta(minutes=5))
    assert _meus(avisos, job) == []

    _execucao(ingest_conn, job, agora + timedelta(minutes=9))
    avisos = Avisos()
    vigiar(repo, avisos, agora + timedelta(minutes=10))
    assert _meus(avisos, job) == [("resolvido", f"fonte:{job}")]
    [[aberto, resolvido]] = ingest_conn.run(
        "SELECT aberto_em, resolvido_em FROM raw.alerta WHERE chave = :c", c=f"fonte:{job}"
    )
    assert resolvido - aberto == timedelta(minutes=10)


def test_api_nao_ve_os_alertas_e_o_admin_le():
    api = _connect("api")
    admin = _connect("admin")
    try:
        assert _denied(api, "SELECT count(*) FROM raw.alerta")
        admin.run("SELECT count(*) FROM raw.alerta")
        admin.run("SELECT count(*) FROM raw.fonte_prazo")
        assert _denied(admin, "UPDATE raw.fonte_prazo SET ativo = false")
    finally:
        api.close()
        admin.close()
