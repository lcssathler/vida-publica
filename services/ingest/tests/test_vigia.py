import json
import logging
from contextlib import nullcontext
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from vida_publica_ingest.observabilidade import (
    Alertadores,
    AlertadorHealthchecks,
    FormatoJson,
    _sem_dados_pessoais,
    sem_cpf,
)
from vida_publica_ingest.vigia import AlertaAberto, Situacao, chave_da_fonte, vigiar

AGORA = datetime(2026, 10, 15, 12, 0, tzinfo=UTC)


class RepoFalso:
    def __init__(self, situacoes: list[Situacao]) -> None:
        self.situacoes_ = situacoes
        self.alertas: dict[str, dict[str, Any]] = {}
        self._id = 0

    def transaction(self):
        return nullcontext()

    def situacoes(self) -> list[Situacao]:
        return self.situacoes_

    def abertos(self) -> dict[str, AlertaAberto]:
        return {
            c: AlertaAberto(a["id"], c, a["aviso_em"])
            for c, a in self.alertas.items()
            if a["resolvido_em"] is None
        }

    def abrir(self, chave: str, detalhe: dict[str, Any], agora: datetime) -> None:
        self._id += 1
        self.alertas[chave] = {"id": self._id, "aviso_em": agora, "resolvido_em": None}

    def lembrar(self, alerta_id: int, detalhe: dict[str, Any], agora: datetime) -> None:
        for a in self.alertas.values():
            if a["id"] == alerta_id:
                a["aviso_em"] = agora

    def resolver(self, alerta_id: int, agora: datetime) -> None:
        for a in self.alertas.values():
            if a["id"] == alerta_id:
                a["resolvido_em"] = agora


class AlertadorFalso:
    def __init__(self) -> None:
        self.chamadas: list[tuple[Any, ...]] = []

    def aberto(self, chave: str, detalhe: dict[str, Any], lembrete: bool) -> None:
        self.chamadas.append(("aberto", chave, lembrete))

    def resolvido(self, chave: str, detalhe: dict[str, Any]) -> None:
        self.chamadas.append(("resolvido", chave))

    def situacao(self, nome: str, ok: bool, texto: str) -> None:
        self.chamadas.append(("situacao", nome, ok, texto))


def _situacao(job: str, horas: float | None, prazo_h: int = 6, agora=AGORA) -> Situacao:
    ultimo = None if horas is None else agora - timedelta(hours=horas)
    return Situacao(job, f"Fonte {job}", timedelta(hours=prazo_h), ultimo)


def test_abre_uma_vez_lembra_em_24h_e_fecha_quando_a_coleta_volta():
    repo = RepoFalso([_situacao("camara-votacoes", 7), _situacao("senado-votacoes", 1)])
    avisos = AlertadorFalso()

    r = vigiar(repo, avisos, AGORA)
    assert (r.atrasados, r.no_prazo, r.abertos) == (1, 1, 1)
    assert avisos.chamadas[0] == ("aberto", "fonte:camara-votacoes", False)
    nome, ok, texto = avisos.chamadas[-1][1:]
    assert (nome, ok) == ("fontes", False)
    assert "camara-votacoes: última coleta há 7.0 h (prazo 6.0 h)" in texto

    # Na volta seguinte, o alerta já está aberto: sem novo aviso.
    avisos.chamadas.clear()
    r = vigiar(repo, avisos, AGORA + timedelta(minutes=5))
    assert (r.abertos, r.lembrados) == (0, 0)
    assert [c[0] for c in avisos.chamadas] == ["situacao"]

    # 24 h depois, ainda atrasada: um lembrete.
    um_dia = AGORA + timedelta(hours=24)
    repo.situacoes_ = [
        _situacao("camara-votacoes", 31, agora=um_dia),
        _situacao("senado-votacoes", 1, agora=um_dia),
    ]
    avisos.chamadas.clear()
    r = vigiar(repo, avisos, um_dia)
    assert r.lembrados == 1
    assert avisos.chamadas[0] == ("aberto", "fonte:camara-votacoes", True)

    # A coleta voltou: fecha e avisa; tudo no prazo.
    depois = AGORA + timedelta(hours=25)
    repo.situacoes_ = [
        _situacao("camara-votacoes", 0.1, agora=depois),
        _situacao("senado-votacoes", 1, agora=depois),
    ]
    avisos.chamadas.clear()
    r = vigiar(repo, avisos, depois)
    assert r.resolvidos == 1
    assert avisos.chamadas == [
        ("resolvido", chave_da_fonte("camara-votacoes")),
        ("situacao", "fontes", True, "Todas as fontes dentro do prazo."),
    ]


def test_job_que_nunca_rodou_conta_como_atrasado():
    repo = RepoFalso([_situacao("partidos", None, prazo_h=192)])
    avisos = AlertadorFalso()
    vigiar(repo, avisos, AGORA)
    assert avisos.chamadas[0] == ("aberto", "fonte:partidos", False)
    assert "partidos: última coleta nunca" in avisos.chamadas[-1][3]


def test_falha_de_um_adaptador_nao_para_os_outros(caplog):
    class Quebrado:
        def aberto(self, *args):
            raise RuntimeError("fora do ar")

        def resolvido(self, *args): ...

        def situacao(self, *args): ...

    certo = AlertadorFalso()
    with caplog.at_level(logging.ERROR):
        Alertadores([Quebrado(), certo]).aberto("fonte:x", {}, False)
    assert certo.chamadas == [("aberto", "fonte:x", False)]
    assert "adaptador de alerta falhou" in caplog.text


def test_healthchecks_pinga_sucesso_ou_fail_sem_vazar_a_chave(caplog):
    pedidos: list[httpx.Request] = []

    def responder(pedido: httpx.Request) -> httpx.Response:
        pedidos.append(pedido)
        return httpx.Response(500 if "quebra" in pedido.url.path else 200)

    cliente = httpx.Client(transport=httpx.MockTransport(responder))
    hc = AlertadorHealthchecks("chave-secreta", "https://hc.exemplo/", cliente)
    hc.situacao("fontes", True, "ok")
    hc.situacao("fontes", False, "2 atrasadas")
    assert [str(p.url) for p in pedidos] == [
        "https://hc.exemplo/chave-secreta/fontes?create=1",
        "https://hc.exemplo/chave-secreta/fontes/fail?create=1",
    ]
    assert pedidos[1].content == b"2 atrasadas"
    with caplog.at_level(logging.ERROR):
        hc.situacao("quebra", True, "x")
    assert "ping ao healthchecks.io falhou" in caplog.text
    assert "chave-secreta" not in caplog.text


def test_log_json_uma_linha_com_os_extras():
    registro = logging.makeLogRecord(
        {"name": "x", "levelname": "INFO", "msg": "job %s terminou", "args": ("a",), "job": "a"}
    )
    linha = json.loads(FormatoJson().format(registro))
    assert linha["msg"] == "job a terminou"
    assert linha["nivel"] == "info"
    assert linha["job"] == "a"
    assert linha["ts"].endswith("+00:00")


def test_nada_de_dado_pessoal_vai_ao_sentry():
    assert sem_cpf("doador 123.456.789-09 e 98765432100") == (
        "doador [CPF removido] e [CPF removido]"
    )
    assert sem_cpf("CNPJ 12.345.678/0001-90 e 12345678000190") == (
        "CNPJ 12.345.678/0001-90 e 12345678000190"
    )
    evento = {
        "request": {"url": "x"},
        "user": {"id": "u"},
        "message": "linha com 123.456.789-09",
        "exception": {"values": [{"value": "falhou em 12345678909"}]},
    }
    limpo = _sem_dados_pessoais(evento, {})
    assert "request" not in limpo and "user" not in limpo
    assert limpo["message"] == "linha com [CPF removido]"
    assert limpo["exception"]["values"][0]["value"] == "falhou em [CPF removido]"
