"""Adaptadores em memória, usados em testes e em execuções locais rápidas."""

from ..models import JobRun, RawObject


class MemoryRawStorage:
    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}

    def put(self, key: str, content: bytes, content_type: str) -> None:
        if key in self.objects:
            raise FileExistsError(f"objeto bruto é imutável: {key}")
        self.objects[key] = (content, content_type)

    def get(self, key: str) -> bytes:
        return self.objects[key][0]


class MemoryRawRegistry:
    def __init__(self) -> None:
        self.items: list[RawObject] = []

    def find(self, source: str, dataset: str, sha256: str) -> RawObject | None:
        return next(
            (
                raw
                for raw in self.items
                if (raw.source, raw.dataset, raw.sha256) == (source, dataset, sha256)
            ),
            None,
        )

    def add(self, raw: RawObject) -> None:
        self.items.append(raw)


class MemoryJobRecorder:
    def __init__(self) -> None:
        self.runs: list[JobRun] = []

    def start(self, run: JobRun) -> None:
        self.runs.append(run)

    def finish(self, run: JobRun) -> None:
        # O mesmo objeto já está na lista; nada a fazer além de manter a referência.
        pass
