import os
from collections.abc import Iterator

import pg8000.native
import pytest
from pydantic import SecretStr

from vida_publica_ingest.adapters.postgres import connect
from vida_publica_ingest.config import Settings


@pytest.fixture
def ingest_settings() -> Settings:
    """Configuração do worker apontando para o Postgres local, com o usuário vp_ingest."""
    password = os.environ.get("VP_INGEST_DB_PASSWORD")
    if not password:
        pytest.skip("VP_INGEST_DB_PASSWORD não definida; rode com as variáveis do infra/.env")
    return Settings(
        db_host=os.environ.get("VP_TEST_DB_HOST", "127.0.0.1"),
        db_port=int(os.environ.get("POSTGRES_PORT", "5433")),
        db_name=os.environ.get("POSTGRES_DB", "vida_publica"),
        db_user="vp_ingest",
        db_password=SecretStr(password),
        cpf_hash_key=SecretStr("chave-de-teste"),
    )


@pytest.fixture
def ingest_conn(ingest_settings: Settings) -> Iterator[pg8000.native.Connection]:
    connection = connect(ingest_settings)
    yield connection
    connection.close()
