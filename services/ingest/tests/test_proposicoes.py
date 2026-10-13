import json
from datetime import date, datetime
from pathlib import Path

import httpx

from vida_publica_ingest.adapters.memory import MemoryRawRegistry, MemoryRawStorage
from vida_publica_ingest.config import Settings
from vida_publica_ingest.http import SourceClient
from vida_publica_ingest.sources.proposicoes import collect, parse_camara, parse_senado

FIXTURES = Path(__file__).parent / "fixtures"


def _detalhe_camara(id_camara: int = 9900001) -> dict:
    payload = json.loads((FIXTURES / "camara" / "proposicao_detalhe.json").read_text("utf-8"))
    payload["dados"]["id"] = id_camara
    return payload


TRAMITACOES = {
    "dados": [
        {
            "dataHora": "2025-03-01T10:00",
            "sequencia": 1,
            "siglaOrgao": "MESA",
            "uriUltimoRelator": None,
            "regime": ".",
            "descricaoTramitacao": "Apresentação de Proposição",
            "codTipoTramitacao": "100",
            "descricaoSituacao": None,
            "codSituacao": None,
            "despacho": "Apresentação do PL.",
            "url": "https://exemplo.invalid/t1",
        },
        {
            "dataHora": "2026-09-03T17:29",
            "sequencia": 3,
            "siglaOrgao": "PLEN",
            "uriUltimoRelator": "https://dadosabertos.camara.leg.br/api/v2/deputados/900001",
            "regime": "Urgência (Art. 155, RICD)",
            "descricaoTramitacao": "Aprovação de Proposição (Plenário)",
            "codTipoTramitacao": "1235",
            "descricaoSituacao": "Aguardando Envio ao Senado Federal",
            "codSituacao": 1293,
            "despacho": "Aprovada a Redação Final.",
            "url": None,
        },
    ]
}
TEMAS = {
    "dados": [
        {"codTema": 68, "tema": "Direito Constitucional", "relevancia": 0},
        {"codTema": 76, "tema": "Direito e Justiça", "relevancia": 0},
        {"codTema": 76, "tema": "Direito e Justiça", "relevancia": 1},
    ]
}
AUTORES = {
    "dados": [
        {
            "uri": "https://dadosabertos.camara.leg.br/api/v2/deputados/900001",
            "nome": "Maria Exemplo",
            "codTipo": 10000,
            "tipo": "Deputado(a)",
            "ordemAssinatura": 1,
            "proponente": 1,
        },
        {
            "uri": None,
            "nome": "Comissão de Exemplo",
            "codTipo": 20000,
            "tipo": "Órgão do Poder Legislativo",
            "ordemAssinatura": 2,
            "proponente": 0,
        },
    ]
}


def _processo(id_processo: int = 9900900) -> dict:
    payload = json.loads((FIXTURES / "senado" / "processo.json").read_text("utf-8"))
    payload["id"] = id_processo
    return payload


def test_parse_camara():
    completa = parse_camara(_detalhe_camara(), TRAMITACOES, TEMAS, AUTORES)
    p = completa.proposicao
    assert (p.casa, p.id_fonte, p.identificacao) == ("camara", "9900001", "PL 123/2025")
    assert p.apresentada_em == date(2025, 3, 1)
    assert (p.situacao, p.situacao_em, p.sigla_orgao) == (
        "Aguardando Envio ao Senado Federal",
        date(2026, 9, 3),
        "PLEN",
    )
    assert p.regime == "Urgência (Art. 155, RICD)"
    assert [(t.id_fonte, t.sequencia, t.relator_id_fonte) for t in completa.tramitacoes] == [
        ("1", 1, None),
        ("3", 3, "900001"),
    ]
    assert completa.tramitacoes[1].data_hora == datetime(2026, 9, 3, 17, 29)
    assert sorted(t.tema for t in completa.temas) == ["Direito Constitucional", "Direito e Justiça"]
    assert [(a.ordem, a.nome, a.id_fonte, a.proponente) for a in completa.autores] == [
        (1, "Maria Exemplo", "900001", True),
        (2, "Comissão de Exemplo", None, False),
    ]


def test_parse_senado():
    completa = parse_senado(_processo())
    p = completa.proposicao
    assert (p.casa, p.id_fonte, p.identificacao, p.codigo_materia) == (
        "senado",
        "9900900",
        "PL 123/2026",
        990001,
    )
    assert (p.sigla_tipo, p.numero, p.ano, p.apelido) == ("PL", 123, 2026, "Lei de Exemplo")
    assert p.ementa == "Dispõe sobre um assunto de exemplo."
    assert (p.situacao, p.situacao_em, p.sigla_orgao, p.tramitando) == (
        "PRONTA PARA A PAUTA NA COMISSÃO",
        date(2026, 8, 20),
        "CCJ",
        True,
    )
    assert p.autoria_resumo == "Senadora Joana Exemplo (XYZ/MG)"
    assert [(t.id_fonte, t.sequencia, t.sigla_orgao, t.situacao) for t in completa.tramitacoes] == [
        ("9900501", 1, "PLEN", "AGDESP"),
        ("9900502", 2, "CCJ", "PRPTAC"),
    ]
    assert completa.tramitacoes[0].data_hora == datetime(2026, 3, 3, 19, 16, 49)
    assert completa.tramitacoes[0].url == "https://exemplo.invalid/doc1"
    assert [t.tema for t in completa.temas] == [
        "Ciência, Tecnologia e Informática",
        "Responsabilidade Civil",
    ]
    assert [(a.nome, a.id_fonte) for a in completa.autores] == [("Joana Exemplo", "990001")]


def test_hash_muda_com_tramitacao_nova():
    base = parse_camara(_detalhe_camara(), TRAMITACOES, TEMAS, AUTORES)
    menos = parse_camara(_detalhe_camara(), {"dados": TRAMITACOES["dados"][:1]}, TEMAS, AUTORES)
    assert base.content_hash() != menos.content_hash()


class FakeRepository:
    def __init__(self):
        self.saved = {}

    def interesse_camara(self):
        return [9900001, 9900002]

    def interesse_senado(self):
        return [9900900], [990777]

    def upsert(self, completa, *, raw_object_id):
        self.saved[(completa.proposicao.casa, completa.proposicao.id_fonte)] = completa
        return True


def test_collect_usa_a_lista_de_interesse_das_duas_casas():
    pedidos = []

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        pedidos.append(path)
        if "/proposicoes/" in path:
            if path.endswith("/tramitacoes"):
                return httpx.Response(200, json=TRAMITACOES)
            if path.endswith("/temas"):
                return httpx.Response(200, json=TEMAS)
            if path.endswith("/autores"):
                return httpx.Response(200, json=AUTORES)
            return httpx.Response(200, json=_detalhe_camara(int(path.rsplit("/", 1)[1])))
        if path.endswith("/processo"):
            assert request.url.params["codigoMateria"] == "990777"
            return httpx.Response(200, json=[{"id": 9900901, "codigoMateria": 990777}])
        return httpx.Response(200, json=_processo(int(path.rsplit("/", 1)[1])))

    repository = FakeRepository()
    with SourceClient(Settings(), transport=httpx.MockTransport(handler)) as client:
        stats = collect(
            client, MemoryRawStorage(), MemoryRawRegistry(), repository, ids_camara=[9900002]
        )

    assert (stats.camara, stats.senado, stats.alteradas, stats.nao_encontradas) == (2, 2, 4, 0)
    assert stats.tramitacoes == 2 * 2 + 2 * 2
    assert set(repository.saved) == {
        ("camara", "9900001"),
        ("camara", "9900002"),
        ("senado", "9900900"),
        ("senado", "9900901"),
    }
    assert pedidos.count("/api/v2/proposicoes/9900002") == 1
