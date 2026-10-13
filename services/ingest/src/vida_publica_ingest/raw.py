import hashlib
import re
from dataclasses import dataclass
from datetime import UTC, datetime

from .models import RawObject
from .ports import RawRegistry, RawStorage

_SLUG = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
_EXTENSIONS = {
    "application/json": "json",
    "application/zip": "zip",
    "text/csv": "csv",
    "application/xml": "xml",
    "text/xml": "xml",
}


@dataclass(frozen=True)
class StoreResult:
    raw: RawObject
    is_new: bool


def raw_key(source: str, dataset: str, fetched_at: datetime, sha256: str, content_type: str) -> str:
    """Caminho imutável do arquivo: raw/{fonte}/{dataset}/{AAAA-MM-DD}/{HHMMSS}_{sha256}.{ext}."""
    for name, value in (("source", source), ("dataset", dataset)):
        if not _SLUG.match(value):
            raise ValueError(f"{name} inválido: {value!r}")
    moment = fetched_at.astimezone(UTC)
    extension = _EXTENSIONS.get(content_type.split(";")[0].strip(), "bin")
    return f"raw/{source}/{dataset}/{moment:%Y-%m-%d}/{moment:%H%M%S}_{sha256}.{extension}"


def store_raw(
    storage: RawStorage,
    registry: RawRegistry,
    *,
    source: str,
    dataset: str,
    content: bytes,
    content_type: str,
    fetched_at: datetime | None = None,
) -> StoreResult:
    """Guarda o conteúdo bruto uma única vez por (fonte, dataset, hash).

    Se o mesmo conteúdo já foi guardado, devolve o registro existente e não
    grava de novo: coletar duas vezes um arquivo que não mudou é inofensivo.
    """
    sha256 = hashlib.sha256(content).hexdigest()
    existing = registry.find(source, dataset, sha256)
    if existing is not None:
        return StoreResult(raw=existing, is_new=False)

    moment = fetched_at or datetime.now(UTC)
    key = raw_key(source, dataset, moment, sha256, content_type)
    storage.put(key, content, content_type)
    raw = RawObject(
        source=source,
        dataset=dataset,
        sha256=sha256,
        key=key,
        size_bytes=len(content),
        content_type=content_type,
        fetched_at=moment,
    )
    registry.add(raw)
    return StoreResult(raw=raw, is_new=True)
