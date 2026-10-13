import json
from datetime import date
from pathlib import Path

import httpx

from vida_publica_ingest.adapters.memory import MemoryRawRegistry, MemoryRawStorage
from vida_publica_ingest.config import Settings
from vida_publica_ingest.http import SourceClient
from vida_publica_ingest.sources.senado_votacoes import collect, parse_votacao

FIXTURES = Path(__file__).parent / "fixtures" / "senado"


def _votacao(codigo: int = 9900001) -> dict:
    payload = json.loads((FIXTURES / "votacao.json").read_text(encoding="utf-8"))
    payload["codigoSessaoVotacao"] = codigo
    return payload


def test_parse_votacao_com_votos_e_ausencias():
    completa = parse_votacao(_votacao())
    votacao = completa.votacao
    assert votacao.codigo_sessao_votacao == 9900001
    assert votacao.data_sessao == date(2026, 9, 1)
    assert votacao.identificacao == "PL 123/2026"
    assert votacao.id_processo == 9900900
    assert (votacao.total_sim, votacao.total_nao, votacao.secreta) == (2, 1, False)
    assert votacao.informe_texto.startswith("(Sessão Deliberativa")
    assert [(v.codigo_parlamentar, v.sigla_voto, v.presente) for v in completa.votos] == [
        (990001, "Sim", True),
        (990002, "Não", True),
        (990003, "AP", False),
        (990004, "P-NRV", True),
    ]
    assert completa.votos[2].descricao_voto == "Atividade parlamentar"


def test_votacao_secreta_e_totais_ausentes():
    payload = _votacao()
    payload["votacaoSecreta"] = "S"
    payload["totalVotosSim"] = None
    payload["votos"] = [dict(payload["votos"][0], siglaVotoParlamentar="Votou")]
    completa = parse_votacao(payload)
    assert completa.votacao.secreta and completa.votacao.total_sim is None
    assert completa.votos[0].sigla_voto == "Votou" and completa.votos[0].presente


def test_hash_muda_com_o_voto():
    base = parse_votacao(_votacao())
    payload = _votacao()
    payload["votos"][0]["siglaVotoParlamentar"] = "Não"
    assert base.content_hash() == parse_votacao(_votacao()).content_hash()
    assert base.content_hash() != parse_votacao(payload).content_hash()


class FakeRepository:
    def __init__(self):
        self.saved = {}

    def upsert(self, completa, *, raw_object_id):
        self.saved[completa.votacao.codigo_sessao_votacao] = completa
        return True


def test_collect_por_janela():
    chamadas = []

    def handler(request: httpx.Request) -> httpx.Response:
        chamadas.append((request.url.params["dataInicio"], request.url.params["dataFim"]))
        return httpx.Response(200, json=[_votacao(9900001), _votacao(9900002)])

    repository = FakeRepository()
    with SourceClient(Settings(), transport=httpx.MockTransport(handler)) as client:
        stats = collect(
            client,
            MemoryRawStorage(),
            MemoryRawRegistry(),
            repository,
            desde=date(2026, 1, 1),
            ate=date(2026, 4, 30),
        )

    assert chamadas == [("2026-01-01", "2026-03-21"), ("2026-03-22", "2026-04-30")]
    assert (stats.votacoes, stats.votos, stats.ausencias, stats.alteradas) == (4, 16, 4, 4)
    assert set(repository.saved) == {9900001, 9900002}
