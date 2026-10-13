import json
from datetime import date, datetime
from pathlib import Path

import httpx
import pytest

from vida_publica_ingest.adapters.memory import MemoryRawRegistry, MemoryRawStorage
from vida_publica_ingest.config import Settings
from vida_publica_ingest.http import SourceClient
from vida_publica_ingest.sources.senado_agenda import (
    collect,
    month_starts,
    parse_reunioes,
    parse_sessoes,
)

FIXTURES = Path(__file__).parent / "fixtures" / "senado"


def _plenario() -> dict:
    return json.loads((FIXTURES / "agenda_plenario.json").read_text(encoding="utf-8"))


def _comissoes() -> dict:
    return json.loads((FIXTURES / "agenda_comissoes.json").read_text(encoding="utf-8"))


def test_parse_sessoes_com_pauta():
    deliberativa, nao_deliberativa = parse_sessoes(_plenario())
    sessao = deliberativa.sessao
    assert sessao.codigo == 9900001
    assert sessao.data == date(2026, 9, 3)
    assert sessao.tipo == "SESSÃO DELIBERATIVA ORDINÁRIA"
    assert (sessao.realizada, sessao.pauta_confirmada, sessao.legislatura) == (True, True, 57)
    assert [(i.codigo_materia, i.sigla, i.ano, i.tipo_pauta) for i in deliberativa.pauta] == [
        (990001, "PL", 2026, "E"),
        (990002, "RQS", 2026, "P"),
    ]
    assert deliberativa.pauta[0].casa_iniciadora == "CD"
    assert nao_deliberativa.sessao.realizada is False
    assert nao_deliberativa.pauta == ()


def test_parse_sessao_unica_como_objeto():
    payload = _plenario()
    payload["AgendaPlenario"]["Sessoes"]["Sessao"] = payload["AgendaPlenario"]["Sessoes"]["Sessao"][
        0
    ]
    assert len(parse_sessoes(payload)) == 1
    assert parse_sessoes({"AgendaPlenario": {"Sessoes": None}}) == []


def test_parse_reunioes_com_itens():
    [completa] = parse_reunioes(_comissoes())
    reuniao = completa.reuniao
    assert reuniao.codigo == 9900500
    assert reuniao.inicio == datetime(2026, 9, 1, 15, 0)
    assert (reuniao.sigla_colegiado, reuniao.realizada, reuniao.secreta) == (
        "CMMPV 999/2026",
        True,
        False,
    )
    assert reuniao.url_pauta == "https://exemplo.invalid/pauta-cheia"
    [item] = completa.itens
    assert (item.parte, item.deliberativa, item.ordem) == (1, True, 1)
    assert (item.id_processo, item.codigo_materia, item.identificacao) == (
        9900900,
        990003,
        "MPV 999/2026",
    )
    assert (item.relator_codigo, item.relator_nome, item.relator_casa) == (
        990777,
        "Deputado Carlos Exemplo",
        "CD",
    )
    assert item.resultado == "Sem deliberação"


def test_month_starts():
    assert month_starts(date(2026, 9, 20), date(2026, 11, 5)) == [
        date(2026, 9, 20),
        date(2026, 10, 1),
        date(2026, 11, 1),
    ]
    assert month_starts(date(2026, 9, 1), date(2026, 9, 30)) == [date(2026, 9, 1)]
    with pytest.raises(ValueError, match="inválido"):
        month_starts(date(2026, 9, 2), date(2026, 9, 1))


class FakeRepository:
    def __init__(self):
        self.sessoes = {}
        self.reunioes = {}

    def upsert_sessao(self, completa, *, raw_object_id):
        self.sessoes[completa.sessao.codigo] = completa
        return True

    def upsert_reuniao(self, completa, *, raw_object_id):
        self.reunioes[completa.reuniao.codigo] = completa
        return True


def test_collect_plenario_por_mes_e_comissoes_por_periodo():
    pedidos = []

    def handler(request: httpx.Request) -> httpx.Response:
        pedidos.append(request.url.path)
        if "/plenario/agenda/mes/" in request.url.path:
            return httpx.Response(200, json=_plenario())
        return httpx.Response(200, json=_comissoes())

    repository = FakeRepository()
    with SourceClient(Settings(), transport=httpx.MockTransport(handler)) as client:
        stats = collect(
            client,
            MemoryRawStorage(),
            MemoryRawRegistry(),
            repository,
            desde=date(2026, 9, 1),
            ate=date(2026, 10, 13),
        )

    assert pedidos == [
        "/dadosabertos/plenario/agenda/mes/20260901",
        "/dadosabertos/plenario/agenda/mes/20261001",
        "/dadosabertos/comissao/agenda/20260901/20261013",
    ]
    assert (stats.sessoes, stats.itens_pauta, stats.reunioes, stats.itens_reuniao) == (2, 2, 1, 1)
    assert stats.alteradas == 3
