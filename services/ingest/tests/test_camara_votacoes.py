import json
from datetime import date, datetime
from pathlib import Path

import httpx
import pytest

from vida_publica_ingest.adapters.memory import MemoryRawRegistry, MemoryRawStorage
from vida_publica_ingest.config import Settings
from vida_publica_ingest.http import SourceClient
from vida_publica_ingest.sources.camara_votacoes import (
    VotacaoCompleta,
    collect,
    parse_orientacoes,
    parse_votacao,
    parse_votos,
    windows,
)

FIXTURES = Path(__file__).parent / "fixtures" / "camara"


def _detalhe(votacao_id: str = "9900001-7") -> dict:
    payload = json.loads((FIXTURES / "votacao_detalhe.json").read_text(encoding="utf-8"))
    payload["dados"]["id"] = votacao_id
    return payload


def _voto(id_camara: int, voto: str) -> dict:
    return {
        "tipoVoto": voto,
        "dataRegistroVoto": "2026-06-10T14:46:15",
        "deputado_": {"id": id_camara, "siglaPartido": "XYZ", "siglaUf": "MG"},
    }


VOTOS = {"dados": [_voto(900001, "Sim"), _voto(900002, "Sim"), _voto(900003, "Não")]}
ORIENTACOES = {
    "dados": [
        {
            "orientacaoVoto": "Sim",
            "codTipoLideranca": "P",
            "siglaPartidoBloco": "XYZ",
            "codPartidoBloco": 37000,
        },
        {
            "orientacaoVoto": "Não",
            "codTipoLideranca": "B",
            "siglaPartidoBloco": "Maioria",
            "codPartidoBloco": None,
        },
        {
            "orientacaoVoto": "",
            "codTipoLideranca": "P",
            "siglaPartidoBloco": "ABC",
            "codPartidoBloco": 37001,
        },
    ]
}


def test_parse_votacao_e_proposicoes():
    votacao, proposicoes = parse_votacao(_detalhe())
    assert votacao.id == "9900001-7"
    assert votacao.data == date(2026, 6, 10)
    assert votacao.registrado_em == datetime(2026, 6, 10, 14, 46, 15)
    assert votacao.sigla_orgao == "PLEN"
    assert votacao.aprovacao is True
    assert votacao.proposicao_principal_id == 9900001
    assert [(p.proposicao_id, p.papel, p.sigla_tipo) for p in proposicoes] == [
        (9900001, "afetada", "PL"),
        (9900003, "objeto", "PPP"),
    ]


def test_parse_votacao_sem_resultado_nem_afetadas():
    payload = _detalhe()
    payload["dados"]["aprovacao"] = None
    payload["dados"]["proposicoesAfetadas"] = []
    votacao, _ = parse_votacao(payload)
    assert votacao.aprovacao is None
    assert votacao.proposicao_principal_id is None


def test_parse_votos_e_orientacoes():
    votos = parse_votos(VOTOS)
    assert [(v.id_camara, v.voto, v.sigla_uf) for v in votos] == [
        (900001, "Sim", "MG"),
        (900002, "Sim", "MG"),
        (900003, "Não", "MG"),
    ]
    orientacoes = parse_orientacoes(ORIENTACOES)
    assert [(o.sigla_bancada, o.orientacao, o.cod_tipo_lideranca) for o in orientacoes] == [
        ("XYZ", "Sim", "P"),
        ("Maioria", "Não", "B"),
    ]


def test_hash_muda_quando_um_voto_muda():
    votacao, proposicoes = parse_votacao(_detalhe())
    base = VotacaoCompleta(votacao, tuple(proposicoes), tuple(parse_votos(VOTOS)), ())
    outro = VotacaoCompleta(
        votacao, tuple(proposicoes), tuple(parse_votos({"dados": VOTOS["dados"][:2]})), ()
    )
    assert base.nominal and base.content_hash() != outro.content_hash()
    assert not VotacaoCompleta(votacao, (), (), ()).nominal


def test_windows_respeita_o_limite_da_api():
    assert windows(date(2026, 1, 1), date(2026, 1, 10), size=4) == [
        (date(2026, 1, 1), date(2026, 1, 4)),
        (date(2026, 1, 5), date(2026, 1, 8)),
        (date(2026, 1, 9), date(2026, 1, 10)),
    ]
    assert windows(date(2026, 1, 1), date(2026, 1, 1)) == [(date(2026, 1, 1), date(2026, 1, 1))]
    with pytest.raises(ValueError, match="inválido"):
        windows(date(2026, 1, 2), date(2026, 1, 1))


class FakeRepository:
    def __init__(self):
        self.saved = {}

    def upsert(self, completa, *, raw_object_id):
        self.saved[completa.votacao.id] = completa
        return True


def test_collect_lista_detalha_e_grava():
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/votacoes"):
            assert request.url.params["dataInicio"] == "2026-06-01"
            assert request.url.params["dataFim"] == "2026-06-30"
            return httpx.Response(
                200,
                json={
                    "dados": [{"id": "9900001-7"}, {"id": "9900002-1"}, {"id": "9900001-7"}],
                    "links": [{"rel": "self", "href": str(request.url)}],
                },
            )
        if path.endswith("/votos"):
            nominal = "9900001-7" in path
            return httpx.Response(200, json=VOTOS if nominal else {"dados": []})
        if path.endswith("/orientacoes"):
            return httpx.Response(200, json=ORIENTACOES)
        return httpx.Response(200, json=_detalhe(path.rsplit("/", 1)[1]))

    repository = FakeRepository()
    with SourceClient(Settings(), transport=httpx.MockTransport(handler)) as client:
        stats = collect(
            client,
            MemoryRawStorage(),
            MemoryRawRegistry(),
            repository,
            desde=date(2026, 6, 1),
            ate=date(2026, 6, 30),
        )

    assert (stats.listadas, stats.detalhadas, stats.nominais, stats.alteradas) == (3, 2, 1, 2)
    nominal = repository.saved["9900001-7"]
    simbolica = repository.saved["9900002-1"]
    assert nominal.nominal and len(nominal.votos) == 3
    assert not simbolica.nominal and len(simbolica.orientacoes) == 2
