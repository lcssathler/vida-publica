from datetime import date, datetime

import httpx

from vida_publica_ingest.adapters.memory import MemoryRawRegistry, MemoryRawStorage
from vida_publica_ingest.config import Settings
from vida_publica_ingest.http import SourceClient
from vida_publica_ingest.sources.camara_eventos import (
    EventoCompleto,
    collect,
    parse_evento,
    parse_pauta,
)


def _evento(id_evento: int, tipo: str = "Sessão Deliberativa") -> dict:
    return {
        "id": id_evento,
        "uri": f"https://dadosabertos.camara.leg.br/api/v2/eventos/{id_evento}",
        "dataHoraInicio": "2026-09-03T13:55",
        "dataHoraFim": "2026-09-03T17:29" if tipo == "Sessão Deliberativa" else None,
        "situacao": "Encerrada",
        "descricaoTipo": tipo,
        "descricao": "Sessão Deliberativa Extraordinária\r\n",
        "localExterno": None,
        "orgaos": [
            {"id": 180, "sigla": "PLEN", "nome": "Plenário"},
            {"id": 2003, "sigla": "CCJC", "nome": "Comissão de Constituição e Justiça"},
        ],
        "localCamara": {"nome": "Plenário da Câmara dos Deputados"},
        "urlRegistro": "https://video.exemplo.invalid/abc",
    }


PAUTA = {
    "dados": [
        {
            "ordem": 1,
            "topico": "Urgente",
            "regime": "Urgência (Art. 155, RICD)",
            "codRegime": 21,
            "titulo": "PL 123/2025",
            "proposicao_": {
                "id": 9900003,
                "siglaTipo": "PRL",
                "codTipo": 190,
                "numero": 1,
                "ano": 0,
                "ementa": "Parecer do Relator.",
            },
            "relator": {"id": 900001, "nome": "Maria Exemplo", "siglaPartido": "XYZ"},
            "textoParecer": "Parecer do Relator pela aprovação.",
            "proposicaoRelacionada_": {
                "id": 9900001,
                "siglaTipo": "PL",
                "codTipo": "139",
                "numero": "123",
                "ano": "2025",
                "ementa": "Dispõe sobre um assunto de exemplo.",
            },
            "uriVotacao": "https://dadosabertos.camara.leg.br/api/v2/votacoes/9900001-7/",
            "situacaoItem": "Aprovado o Parecer.",
        },
        {
            "ordem": 2,
            "topico": "Discussão",
            "regime": None,
            "codRegime": None,
            "titulo": "REQ 1/2026",
            "proposicao_": {"id": 9900010, "siglaTipo": "REQ", "numero": 1, "ano": 2026},
            "relator": None,
            "textoParecer": None,
            "proposicaoRelacionada_": None,
            "uriVotacao": None,
            "situacaoItem": None,
        },
    ]
}


def test_parse_evento_e_orgaos():
    evento, orgaos = parse_evento(_evento(9900100))
    assert evento.id == 9900100
    assert evento.inicio == datetime(2026, 9, 3, 13, 55)
    assert evento.fim == datetime(2026, 9, 3, 17, 29)
    assert evento.descricao == "Sessão Deliberativa Extraordinária"
    assert (evento.id_orgao, evento.sigla_orgao) == (180, "PLEN")
    assert [o.id_orgao for o in orgaos] == [180, 2003]
    assert evento.deliberativo


def test_tipos_deliberativos():
    for tipo, esperado in [
        ("Sessão Deliberativa", True),
        ("Reunião Deliberativa", True),
        ("Audiência Pública e Deliberação", True),
        ("Audiência Pública", False),
        ("Seminário", False),
    ]:
        evento, _ = parse_evento(_evento(1, tipo))
        assert evento.deliberativo is esperado, tipo


def test_parse_pauta():
    itens = parse_pauta(PAUTA)
    assert len(itens) == 2
    primeiro, segundo = itens
    assert (primeiro.proposicao_id, primeiro.proposicao_relacionada_id) == (9900003, 9900001)
    assert (primeiro.relator_id, primeiro.relator_nome) == (900001, "Maria Exemplo")
    assert primeiro.votacao_id == "9900001-7"
    assert primeiro.cod_regime == 21
    assert segundo.proposicao_id == 9900010
    assert segundo.relator_id is None and segundo.votacao_id is None


def test_hash_inclui_a_pauta():
    evento, orgaos = parse_evento(_evento(1))
    com_pauta = EventoCompleto(evento, tuple(orgaos), tuple(parse_pauta(PAUTA)))
    sem_pauta = EventoCompleto(evento, tuple(orgaos), ())
    assert com_pauta.content_hash() != sem_pauta.content_hash()


class FakeRepository:
    def __init__(self):
        self.saved = {}

    def upsert(self, completo, *, raw_object_id):
        self.saved[completo.evento.id] = completo
        return True


def test_collect_busca_pauta_so_dos_deliberativos():
    pedidos = []

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        pedidos.append(path)
        if path.endswith("/eventos"):
            assert request.url.params["dataInicio"] == "2026-09-01"
            return httpx.Response(
                200,
                json={
                    "dados": [_evento(9900100), _evento(9900101, "Audiência Pública")],
                    "links": [{"rel": "self", "href": str(request.url)}],
                },
            )
        assert path.endswith("/eventos/9900100/pauta")
        return httpx.Response(200, json=PAUTA)

    repository = FakeRepository()
    with SourceClient(Settings(), transport=httpx.MockTransport(handler)) as client:
        stats = collect(
            client,
            MemoryRawStorage(),
            MemoryRawRegistry(),
            repository,
            desde=date(2026, 9, 1),
            ate=date(2026, 9, 30),
        )

    assert (stats.eventos, stats.deliberativos, stats.itens_pauta, stats.alterados) == (2, 1, 2, 2)
    assert len(pedidos) == 2
    assert len(repository.saved[9900100].pauta) == 2
    assert repository.saved[9900101].pauta == ()
