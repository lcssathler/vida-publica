import json
from datetime import date
from pathlib import Path

import httpx

from vida_publica_ingest.adapters.memory import MemoryRawRegistry, MemoryRawStorage
from vida_publica_ingest.config import Settings
from vida_publica_ingest.http import SourceClient
from vida_publica_ingest.identity import hash_cpf
from vida_publica_ingest.sources.camara_deputados import API, collect, parse_deputado

FIXTURES = Path(__file__).parent / "fixtures" / "camara"
KEY = "chave-de-teste"


def _detalhe(id_camara: int) -> dict:
    payload = json.loads((FIXTURES / "deputado_detalhe.json").read_text(encoding="utf-8"))
    payload["dados"]["id"] = id_camara
    return payload


def test_parse_deputado():
    deputado, cpf = parse_deputado(_detalhe(900001))
    assert deputado.nome_parlamentar == "Maria Exemplo"
    assert deputado.nome_civil == "MARIA EXEMPLO DA SILVA"
    assert deputado.data_nascimento == date(1980, 5, 17)
    assert deputado.sigla_partido == "XYZ"
    assert deputado.situacao == "Exercício"
    assert deputado.redes_sociais == ("https://exemplo.invalid/maria",)
    assert cpf == "123.456.789-00"


def test_content_hash_muda_quando_o_conteudo_muda():
    deputado, _ = parse_deputado(_detalhe(900001))
    outro = _detalhe(900001)
    outro["dados"]["ultimoStatus"]["siglaPartido"] = "ABC"
    trocado, _ = parse_deputado(outro)
    assert deputado.content_hash() == parse_deputado(_detalhe(900001))[0].content_hash()
    assert deputado.content_hash() != trocado.content_hash()


class FakeRepository:
    def __init__(self):
        self.saved = {}

    def upsert(self, deputado, *, cpf_hash, legislaturas, raw_object_id):
        self.saved[deputado.id_camara] = (deputado, cpf_hash, legislaturas)
        return True


def _transport():
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/deputados"):
            pagina = request.url.params.get("pagina", "1")
            if pagina == "1":
                return httpx.Response(
                    200,
                    json={
                        "dados": [{"id": 900001}, {"id": 900002}],
                        "links": [{"rel": "next", "href": f"{API}/deputados?pagina=2"}],
                    },
                )
            # Mesmo deputado listado duas vezes (troca de partido): aparece uma vez só.
            return httpx.Response(200, json={"dados": [{"id": 900002}], "links": []})
        id_camara = int(path.rsplit("/", 1)[1])
        return httpx.Response(200, json=_detalhe(id_camara))

    return httpx.MockTransport(handler)


def test_collect_pagina_busca_detalhes_e_guarda_so_o_hash_do_cpf():
    repository = FakeRepository()
    storage, registry = MemoryRawStorage(), MemoryRawRegistry()
    with SourceClient(Settings(), transport=_transport()) as client:
        stats = collect(client, storage, registry, repository, cpf_hash_key=KEY, legislaturas=[57])

    assert stats.listados == 3
    assert stats.detalhes == 2
    assert set(repository.saved) == {900001, 900002}
    _, cpf_hash, legislaturas = repository.saved[900001]
    assert cpf_hash == hash_cpf("12345678900", KEY)
    assert legislaturas == {57}
    # Respostas brutas guardadas: 2 páginas da lista + 2 detalhes (iguais só no id).
    assert len(storage.objects) == 4
