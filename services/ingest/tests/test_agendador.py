from datetime import UTC, datetime, timedelta

from vida_publica_ingest.adapters.s3 import s3_client_kwargs
from vida_publica_ingest.agendador import TAREFAS, Tarefa, agendar, comando, vencidas
from vida_publica_ingest.config import Settings

AGORA = datetime(2026, 10, 15, 12, 0, tzinfo=UTC)


def _t(nome: str, minutos: int) -> Tarefa:
    return Tarefa(nome, (nome,), timedelta(minutes=minutos), (nome,))


def test_vencidas_na_ordem_da_lista():
    tarefas = [_t("a", 15), _t("b", 60), _t("c", 10)]
    ultimas = {"a": AGORA - timedelta(minutes=20), "b": AGORA - timedelta(minutes=30), "c": None}
    assert [t.nome for t in vencidas(tarefas, ultimas, AGORA)] == ["a", "c"]


def test_coletas_antes_do_motor_e_janela_no_comando():
    assert TAREFAS[-1].nome == "eventos"
    assert len(TAREFAS[-1].jobs) == 15
    votacoes = next(t for t in TAREFAS if t.nome == "camara-votacoes")
    assert comando(votacoes, AGORA)[-3:] == ["camara-votacoes", "--desde", "2026-10-12"]


class Conexao:
    def __init__(self, linhas):
        self.linhas = linhas

    def run(self, sql, **_):
        self.columns = [{"name": "job"}, {"name": "fim"}]
        return self.linhas

    def close(self):
        pass


def test_agenda_a_partir_do_banco_e_nao_repete_dentro_do_intervalo(monkeypatch, tmp_path):
    monkeypatch.setattr("vida_publica_ingest.agendador.SINAL_DE_VIDA", tmp_path / "vivo")
    tarefas = [_t("coleta", 15), _t("eventos", 10)]
    # coleta rodou há 5 min; eventos há 30 min.
    linhas = [["coleta", AGORA - timedelta(minutes=5)], ["eventos", AGORA - timedelta(minutes=30)]]
    feitas: list[str] = []
    relogio = iter([AGORA + timedelta(minutes=m) for m in range(0, 200)])
    agendar(
        lambda: Conexao(linhas),
        tarefas,
        executar=lambda t, _agora: feitas.append(t.nome) or True,
        relogio=lambda: next(relogio),
        pausa=0,
        voltas=3,
    )
    assert feitas == ["eventos"]
    assert (tmp_path / "vivo").exists()


def test_s3_sem_segredo_usa_credenciais_da_maquina():
    aws = s3_client_kwargs(Settings(s3_endpoint="", s3_secret_key=""))
    assert "endpoint_url" not in aws and "aws_secret_access_key" not in aws
    local = s3_client_kwargs(Settings(s3_secret_key="segredo"))  # noqa: S106 - valor de teste
    assert local["endpoint_url"] == "http://localhost:9000"
    assert local["aws_secret_access_key"] == "segredo"  # noqa: S105 - valor de teste
