"""Testes de integração do esquema e das permissões do banco.

Rodam contra o Postgres local com as migrações aplicadas:
    uv run pytest -m integration
Precisam das variáveis do infra/.env (veja infra/README.md).
"""

import hashlib
import os
import uuid
from collections.abc import Iterator

import pg8000.native
import pytest

pytestmark = pytest.mark.integration

ROLES = {
    "owner": ("POSTGRES_USER", "POSTGRES_PASSWORD"),
    "ingest": (None, "VP_INGEST_DB_PASSWORD"),
    "api": (None, "VP_API_DB_PASSWORD"),
    "admin": (None, "VP_ADMIN_DB_PASSWORD"),
    "notify": (None, "VP_NOTIFY_DB_PASSWORD"),
}


def _connect(role: str) -> pg8000.native.Connection:
    user_var, password_var = ROLES[role]
    password = os.environ.get(password_var)
    if not password:
        pytest.skip(f"{password_var} não definida; rode com as variáveis do infra/.env")
    user = os.environ.get(user_var, "vp_owner") if user_var else f"vp_{role}"
    return pg8000.native.Connection(
        user=user,
        password=password,
        host=os.environ.get("VP_TEST_DB_HOST", "127.0.0.1"),
        port=int(os.environ.get("POSTGRES_PORT", "5433")),
        database=os.environ.get("POSTGRES_DB", "vida_publica"),
    )


@pytest.fixture
def conn(request: pytest.FixtureRequest) -> Iterator[pg8000.native.Connection]:
    connection = _connect(request.param)
    yield connection
    connection.close()


def _sha() -> str:
    return hashlib.sha256(uuid.uuid4().bytes).hexdigest()


def _insert_raw(connection: pg8000.native.Connection, sha: str) -> None:
    connection.run(
        "INSERT INTO raw.raw_object (source, dataset, sha256, key, size_bytes, content_type,"
        " fetched_at) VALUES ('teste', 'permissoes', :sha, :key, 1, 'text/csv', now())",
        sha=sha,
        key=f"raw/teste/permissoes/{sha}.csv",
    )


def _denied(connection: pg8000.native.Connection, sql: str) -> bool:
    try:
        connection.run(sql)
    except pg8000.native.DatabaseError as error:
        return error.args[0].get("C") == "42501"  # insufficient_privilege
    return False


@pytest.mark.parametrize("conn", ["ingest"], indirect=True)
def test_worker_grava_coletas_e_jobs(conn):
    _insert_raw(conn, _sha())
    conn.run(
        "INSERT INTO raw.job_run (job, status, started_at, finished_at)"
        " VALUES ('teste', 'succeeded', now(), now())"
    )


@pytest.mark.parametrize("conn", ["ingest"], indirect=True)
def test_worker_nao_acessa_dados_de_usuario(conn):
    assert _denied(conn, "CREATE TABLE app.x (id int)")


@pytest.mark.parametrize("conn", ["api"], indirect=True)
def test_api_nao_le_nem_escreve_dados_brutos(conn):
    assert _denied(conn, "SELECT count(*) FROM raw.raw_object")
    assert _denied(
        conn, "INSERT INTO raw.job_run (job, status, started_at) VALUES ('x', 'running', now())"
    )


@pytest.mark.parametrize("conn", ["admin"], indirect=True)
def test_admin_le_mas_nao_escreve_dados_brutos(conn):
    conn.run("SELECT count(*) FROM raw.raw_object")
    assert _denied(
        conn, "INSERT INTO raw.job_run (job, status, started_at) VALUES ('x', 'running', now())"
    )


@pytest.mark.parametrize("conn", ["ingest", "api", "admin"], indirect=True)
def test_componentes_nao_criam_tabelas(conn):
    assert _denied(conn, "CREATE TABLE public.intrusa (id int)")
    assert _denied(conn, "CREATE TABLE canon.intrusa (id int)")


@pytest.mark.parametrize("conn", ["ingest"], indirect=True)
def test_mesmo_conteudo_nao_e_registrado_duas_vezes(conn):
    sha = _sha()
    _insert_raw(conn, sha)
    with pytest.raises(pg8000.native.DatabaseError) as error:
        conn.run(
            "INSERT INTO raw.raw_object (source, dataset, sha256, key, size_bytes, content_type,"
            " fetched_at) VALUES ('teste', 'permissoes', :sha, :key, 1, 'text/csv', now())",
            sha=sha,
            key=f"raw/teste/permissoes/outra-{sha}.csv",
        )
    assert error.value.args[0]["C"] == "23505"  # unique_violation


@pytest.mark.parametrize("conn", ["ingest"], indirect=True)
def test_job_em_andamento_nao_tem_fim(conn):
    with pytest.raises(pg8000.native.DatabaseError) as error:
        conn.run(
            "INSERT INTO raw.job_run (job, status, started_at, finished_at)"
            " VALUES ('x', 'running', now(), now())"
        )
    assert error.value.args[0]["C"] == "23514"  # check_violation
