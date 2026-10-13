from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4


@dataclass(frozen=True)
class RawObject:
    """Metadados de um arquivo bruto guardado. O conteúdo fica no RawStorage."""

    source: str
    dataset: str
    sha256: str
    key: str
    size_bytes: int
    content_type: str
    fetched_at: datetime
    id: UUID = field(default_factory=uuid4)


class JobStatus(StrEnum):
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


@dataclass
class JobRun:
    job: str
    started_at: datetime
    status: JobStatus = JobStatus.RUNNING
    finished_at: datetime | None = None
    error: str | None = None
    id: UUID = field(default_factory=uuid4)
