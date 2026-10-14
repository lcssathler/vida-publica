"""Permissões das tabelas de usuário do app (esquema app).

Só a API escreve em app; o admin lê; o worker não enxerga. A API nunca lê os
hashes de CPF do esquema ident.
"""

import hashlib
import uuid
from collections.abc import Iterator

import pg8000.native
import pytest

from .test_banco_permissoes import _connect, _denied

pytestmark = pytest.mark.integration

TABELAS_APP = ("usuario", "identidade", "sessao", "refresh_token", "seguindo")


@pytest.fixture
def api() -> Iterator[pg8000.native.Connection]:
    connection = _connect("api")
    yield connection
    connection.close()


def _usuario_com_sessao(api: pg8000.native.Connection) -> tuple[str, str]:
    usuario = api.run("INSERT INTO app.usuario DEFAULT VALUES RETURNING id")[0][0]
    sessao = api.run(
        "INSERT INTO app.sessao (usuario_id, plataforma) VALUES (:u, 'android') RETURNING id",
        u=usuario,
    )[0][0]
    return str(usuario), str(sessao)


def test_api_cria_usuario_sessao_e_refresh(api):
    usuario, sessao = _usuario_com_sessao(api)
    api.run(
        "INSERT INTO app.refresh_token (hash, sessao_id, expira_em)"
        " VALUES (:h, :s, now() + interval '1 day')",
        h=hashlib.sha256(uuid.uuid4().bytes).hexdigest(),
        s=sessao,
    )
    api.run(
        "INSERT INTO app.identidade (provedor, sujeito, usuario_id) VALUES ('apple', :s, :u)",
        s=f"sujeito-{uuid.uuid4()}",
        u=usuario,
    )
    # Excluir a conta apaga tudo o que é dela.
    api.run("DELETE FROM app.usuario WHERE id = :u", u=usuario)
    assert api.run("SELECT count(*) FROM app.sessao WHERE id = :s", s=sessao) == [[0]]
    assert api.run("SELECT count(*) FROM app.identidade WHERE usuario_id = :u", u=usuario) == [[0]]


def test_refresh_token_so_como_hash(api):
    _, sessao = _usuario_com_sessao(api)
    with pytest.raises(pg8000.native.DatabaseError) as error:
        api.run(
            "INSERT INTO app.refresh_token (hash, sessao_id, expira_em)"
            " VALUES ('token-em-claro', :s, now() + interval '1 day')",
            s=sessao,
        )
    assert error.value.args[0]["C"] == "23514"  # check_violation


def test_provedor_desconhecido_recusado(api):
    usuario, _ = _usuario_com_sessao(api)
    with pytest.raises(pg8000.native.DatabaseError) as error:
        api.run(
            "INSERT INTO app.identidade (provedor, sujeito, usuario_id)"
            " VALUES ('facebook', 'x', :u)",
            u=usuario,
        )
    assert error.value.args[0]["C"] == "23514"


def test_api_nao_le_ident(api):
    assert _denied(api, "SELECT count(*) FROM ident.pessoa")


@pytest.mark.parametrize("tabela", TABELAS_APP)
def test_worker_nao_enxerga_app(tabela):
    connection = _connect("ingest")
    try:
        assert _denied(connection, f"SELECT count(*) FROM app.{tabela}")  # noqa: S608
    finally:
        connection.close()


@pytest.mark.parametrize("tabela", TABELAS_APP)
def test_admin_le_mas_nao_escreve_app(tabela):
    connection = _connect("admin")
    try:
        connection.run(f"SELECT count(*) FROM app.{tabela}")  # noqa: S608
        assert _denied(connection, f"DELETE FROM app.{tabela}")  # noqa: S608
    finally:
        connection.close()


def test_api_nao_altera_feed_nem_canon(api):
    assert _denied(api, "UPDATE feed.evento SET status = 'publicado'")
    assert _denied(api, "DELETE FROM canon.pessoa")


def test_api_segue_alvos_e_exclusao_apaga(api):
    usuario, _ = _usuario_com_sessao(api)
    api.run(
        "INSERT INTO app.seguindo (usuario_id, alvo_tipo, alvo_id) VALUES (:u, 'assunto', 'Saúde')",
        u=usuario,
    )
    with pytest.raises(pg8000.native.DatabaseError) as error:
        api.run(
            "INSERT INTO app.seguindo (usuario_id, alvo_tipo, alvo_id)"
            " VALUES (:u, 'vereador', '1')",
            u=usuario,
        )
    assert error.value.args[0]["C"] == "23514"
    api.run("DELETE FROM app.usuario WHERE id = :u", u=usuario)
    assert api.run("SELECT count(*) FROM app.seguindo WHERE usuario_id = :u", u=usuario) == [[0]]


def test_api_le_doadores_pf_pela_visao_sem_hash(api):
    api.run("SELECT count(*) FROM canon.tse_doador_pessoa_fisica")
    colunas = api.run(
        "SELECT column_name FROM information_schema.columns"
        " WHERE table_schema = 'canon' AND table_name = 'tse_doador_pessoa_fisica'"
    )
    assert sorted(c[0] for c in colunas) == [
        "ano_eleicao",
        "doacoes",
        "doador_nome",
        "sq_candidato",
        "total",
    ]
    assert _denied(api, "SELECT count(*) FROM ident.tse_receita_doador")
