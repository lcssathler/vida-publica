from datetime import UTC, datetime

import pytest

from vida_publica_ingest.adapters.memory import MemoryRawRegistry, MemoryRawStorage
from vida_publica_ingest.raw import raw_key, store_raw

MOMENT = datetime(2026, 10, 13, 6, 30, 5, tzinfo=UTC)


def test_raw_key_tem_formato_imutavel():
    key = raw_key("camara", "votacoes", MOMENT, "abc123", "application/json")
    assert key == "raw/camara/votacoes/2026-10-13/063005_abc123.json"


def test_raw_key_usa_bin_para_tipo_desconhecido():
    key = raw_key("tse", "candidatos", MOMENT, "f00", "application/octet-stream")
    assert key.endswith(".bin")


@pytest.mark.parametrize("source", ["Camara", "../etc", "", "a b"])
def test_raw_key_rejeita_nomes_inseguros(source):
    with pytest.raises(ValueError, match="source inválido"):
        raw_key(source, "votacoes", MOMENT, "abc", "text/csv")


def test_store_raw_guarda_conteudo_novo():
    storage, registry = MemoryRawStorage(), MemoryRawRegistry()
    result = store_raw(
        storage,
        registry,
        source="senado",
        dataset="votacao",
        content=b'{"ok": true}',
        content_type="application/json",
        fetched_at=MOMENT,
    )
    assert result.is_new
    assert storage.get(result.raw.key) == b'{"ok": true}'
    assert result.raw.size_bytes == 12
    assert len(registry.items) == 1


def test_store_raw_nao_duplica_conteudo_igual():
    storage, registry = MemoryRawStorage(), MemoryRawRegistry()
    kwargs = {
        "source": "camara",
        "dataset": "cota",
        "content": b"mesmo conteudo",
        "content_type": "application/zip",
    }
    first = store_raw(storage, registry, fetched_at=MOMENT, **kwargs)
    second = store_raw(storage, registry, **kwargs)
    assert first.is_new and not second.is_new
    assert second.raw == first.raw
    assert len(storage.objects) == 1


def test_storage_em_memoria_e_imutavel():
    storage = MemoryRawStorage()
    storage.put("raw/x", b"1", "text/csv")
    with pytest.raises(FileExistsError):
        storage.put("raw/x", b"2", "text/csv")
