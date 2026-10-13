"""Cliente HTTP para as fontes oficiais.

Identifica o coletor, respeita limites (429 e Retry-After), tenta de novo em
falhas temporárias com espera crescente e guarda cada resposta como dado bruto.
"""

import logging
import time
from collections.abc import Callable, Mapping
from typing import Any

import httpx

from .config import Settings
from .ports import RawRegistry, RawStorage
from .raw import StoreResult, store_raw

logger = logging.getLogger(__name__)

RETRY_STATUS = {429, 500, 502, 503, 504}


class SourceError(RuntimeError):
    """A fonte respondeu com erro definitivo ou esgotou as tentativas."""


class SourceClient:
    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.BaseTransport | None = None,
        max_attempts: int = 4,
        backoff_seconds: float = 1.0,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._client = httpx.Client(
            headers={"User-Agent": settings.user_agent, "Accept": "application/json"},
            timeout=settings.http_timeout_seconds,
            follow_redirects=True,
            transport=transport,
        )
        self._max_attempts = max_attempts
        self._backoff = backoff_seconds
        self._sleep = sleep

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "SourceClient":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def get(
        self,
        url: str,
        params: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> httpx.Response:
        last_problem = ""
        for attempt in range(1, self._max_attempts + 1):
            try:
                response = self._client.get(url, params=params, headers=headers)
            except httpx.TransportError as error:
                last_problem = f"{type(error).__name__}: {error}"
            else:
                if response.status_code not in RETRY_STATUS:
                    if response.is_error:
                        raise SourceError(f"{url} respondeu {response.status_code}")
                    return response
                last_problem = f"status {response.status_code}"
                retry_after = response.headers.get("Retry-After", "")
                if retry_after.isdigit() and attempt < self._max_attempts:
                    self._sleep(float(retry_after))
                    continue
            if attempt < self._max_attempts:
                wait = self._backoff * 2 ** (attempt - 1)
                logger.warning("%s falhou (%s); nova tentativa em %.1fs", url, last_problem, wait)
                self._sleep(wait)
        raise SourceError(f"{url} falhou após {self._max_attempts} tentativas: {last_problem}")

    def fetch_and_store(
        self,
        storage: RawStorage,
        registry: RawRegistry,
        *,
        source: str,
        dataset: str,
        url: str,
        params: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> tuple[httpx.Response, StoreResult]:
        """Baixa e guarda a resposta como dado bruto antes de qualquer interpretação.
        `headers` sobrepõe os padrões (ex.: Accept para servidores que recusam JSON)."""
        response = self.get(url, params=params, headers=headers)
        content_type = response.headers.get("Content-Type", "application/octet-stream")
        stored = store_raw(
            storage,
            registry,
            source=source,
            dataset=dataset,
            content=response.content,
            content_type=content_type,
        )
        return response, stored
