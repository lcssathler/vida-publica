"""Portas: interfaces que isolam o domínio dos fornecedores de infraestrutura.

Cada porta tem um adaptador em memória (testes) e um real (S3, Postgres).
Trocar de fornecedor é escrever outro adaptador.
"""

from typing import Protocol

from .models import JobRun, RawObject


class RawStorage(Protocol):
    """Armazena arquivos brutos baixados das fontes, sem alteração."""

    def put(self, key: str, content: bytes, content_type: str) -> None: ...

    def get(self, key: str) -> bytes: ...


class RawRegistry(Protocol):
    """Registra cada coleta guardada, para não guardar o mesmo conteúdo duas vezes."""

    def find(self, source: str, dataset: str, sha256: str) -> RawObject | None: ...

    def add(self, raw: RawObject) -> None: ...


class JobRecorder(Protocol):
    """Registra o início, o fim e o resultado de cada execução de job."""

    def start(self, run: JobRun) -> None: ...

    def finish(self, run: JobRun) -> None: ...
