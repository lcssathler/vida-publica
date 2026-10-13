import json
from datetime import date
from pathlib import Path

import httpx

from vida_publica_ingest.adapters.memory import MemoryRawRegistry, MemoryRawStorage
from vida_publica_ingest.config import Settings
from vida_publica_ingest.http import SourceClient
from vida_publica_ingest.sources.senado_senadores import collect, parse_senador, participations

FIXTURES = Path(__file__).parent / "fixtures" / "senado"


def _detalhe(codigo: int) -> dict:
    payload = json.loads((FIXTURES / "senador_detalhe.json").read_text(encoding="utf-8"))
    payload["DetalheParlamentar"]["Parlamentar"]["IdentificacaoParlamentar"][
        "CodigoParlamentar"
    ] = str(codigo)
    return payload


def _item(codigo: int, mandatos) -> dict:
    return {
        "IdentificacaoParlamentar": {"CodigoParlamentar": str(codigo)},
        "Mandatos": {"Mandato": mandatos},
    }


def _mandato(primeira: int, segunda: int, participacao: str) -> dict:
    return {
        "PrimeiraLegislaturaDoMandato": {"NumeroLegislatura": str(primeira)},
        "SegundaLegislaturaDoMandato": {"NumeroLegislatura": str(segunda)},
        "DescricaoParticipacao": participacao,
    }


def test_parse_senador():
    senador = parse_senador(_detalhe(990001), em_exercicio=True)
    assert senador.codigo_senado == 990001
    assert senador.nome_completo == "Joana Exemplo de Souza"
    assert senador.sexo == "F"
    assert senador.data_nascimento == date(1971, 3, 9)
    assert senador.em_exercicio


def test_participacoes_aceitam_objeto_unico_ou_lista():
    unico = _item(1, _mandato(56, 57, "Titular"))
    varios = _item(2, [_mandato(55, 56, "Titular"), _mandato(56, 57, "1º Suplente")])
    assert participations(unico, 57) == {"Titular"}
    assert participations(varios, 57) == {"1º Suplente"}
    assert participations(varios, 58) == set()


class FakeRepository:
    def __init__(self):
        self.saved = {}

    def upsert(self, senador, *, participacoes, raw_object_id):
        self.saved[senador.codigo_senado] = (senador, participacoes)
        return True


def test_collect_marca_em_exercicio_e_participacoes():
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/lista/atual"):
            return httpx.Response(
                200,
                json={
                    "ListaParlamentarEmExercicio": {
                        "Parlamentares": {
                            "Parlamentar": {
                                "IdentificacaoParlamentar": {"CodigoParlamentar": "990001"}
                            }
                        }
                    }
                },
            )
        if "/lista/legislatura/" in path:
            return httpx.Response(
                200,
                json={
                    "ListaParlamentarLegislatura": {
                        "Parlamentares": {
                            "Parlamentar": [
                                _item(990001, _mandato(57, 58, "Titular")),
                                _item(990002, _mandato(56, 57, "2º Suplente")),
                            ]
                        }
                    }
                },
            )
        return httpx.Response(200, json=_detalhe(int(path.rsplit("/", 1)[1])))

    repository = FakeRepository()
    with SourceClient(Settings(), transport=httpx.MockTransport(handler)) as client:
        stats = collect(
            client, MemoryRawStorage(), MemoryRawRegistry(), repository, legislaturas=[57]
        )

    assert (stats.em_exercicio, stats.na_legislatura, stats.detalhes) == (1, 2, 2)
    titular, part_titular = repository.saved[990001]
    suplente, part_suplente = repository.saved[990002]
    assert titular.em_exercicio and not suplente.em_exercicio
    assert part_titular == {57: {"Titular"}}
    assert part_suplente == {57: {"2º Suplente"}}
