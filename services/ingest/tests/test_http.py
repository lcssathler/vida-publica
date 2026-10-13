import httpx
import pytest

from vida_publica_ingest.adapters.memory import MemoryRawRegistry, MemoryRawStorage
from vida_publica_ingest.config import Settings
from vida_publica_ingest.http import SourceClient, SourceError


def _client(handler, **kwargs):
    waits: list[float] = []
    client = SourceClient(
        Settings(), transport=httpx.MockTransport(handler), sleep=waits.append, **kwargs
    )
    return client, waits


def test_envia_user_agent_identificando_o_coletor():
    seen = {}

    def handler(request):
        seen["ua"] = request.headers["User-Agent"]
        return httpx.Response(200, json={"ok": True})

    client, _ = _client(handler)
    client.get("https://fonte.exemplo/api")
    assert seen["ua"].startswith("VidaPublica/")


def test_tenta_de_novo_em_erro_temporario_com_espera_crescente():
    calls = iter([503, 502, 200])

    def handler(request):
        return httpx.Response(next(calls), json={})

    client, waits = _client(handler, backoff_seconds=1.0)
    assert client.get("https://fonte.exemplo/api").status_code == 200
    assert waits == [1.0, 2.0]


def test_respeita_retry_after():
    calls = iter([httpx.Response(429, headers={"Retry-After": "7"}), httpx.Response(200)])
    client, waits = _client(lambda request: next(calls))
    client.get("https://fonte.exemplo/api")
    assert waits == [7.0]


def test_erro_definitivo_nao_tenta_de_novo():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(404)

    client, _ = _client(handler)
    with pytest.raises(SourceError, match="404"):
        client.get("https://fonte.exemplo/api")
    assert len(calls) == 1


def test_desiste_apos_esgotar_tentativas():
    def handler(request):
        raise httpx.ConnectError("sem rede")

    client, waits = _client(handler, max_attempts=3)
    with pytest.raises(SourceError, match="após 3 tentativas"):
        client.get("https://fonte.exemplo/api")
    assert len(waits) == 2


def test_fetch_and_store_guarda_resposta_bruta():
    client, _ = _client(
        lambda request: httpx.Response(
            200, content=b'{"dados": []}', headers={"Content-Type": "application/json"}
        )
    )
    storage, registry = MemoryRawStorage(), MemoryRawRegistry()
    response, stored = client.fetch_and_store(
        storage, registry, source="camara", dataset="deputados", url="https://fonte.exemplo/api"
    )
    assert response.json() == {"dados": []}
    assert stored.is_new and stored.raw.key.endswith(".json")
    assert storage.get(stored.raw.key) == b'{"dados": []}'
