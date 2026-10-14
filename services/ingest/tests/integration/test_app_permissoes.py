"""Permissões das tabelas de usuário do app (esquema app).

Só a API e o notificador escrevem em app (o notificador, só a fila de avisos);
o admin lê; o worker não enxerga. A API nunca lê os hashes de CPF do esquema
ident.
"""

import hashlib
import uuid
from collections.abc import Iterator

import pg8000.native
import pytest

from .test_banco_permissoes import _connect, _denied

pytestmark = pytest.mark.integration

TABELAS_APP = (
    "usuario",
    "identidade",
    "sessao",
    "refresh_token",
    "seguindo",
    "preferencias",
    "dispositivo",
    "notificacao",
    "notificacao_cursor",
    "resumo_semanal",
)


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


def test_api_usa_normalizacao_da_busca(api):
    assert api.run("SELECT canon.normaliza('Ação TRIBUTÁRIA')") == [["acao tributaria"]]


def test_preferencias_validadas_no_banco(api):
    usuario, _ = _usuario_com_sessao(api)
    api.run("INSERT INTO app.preferencias (usuario_id, uf) VALUES (:u, 'PE')", u=usuario)
    for coluna, valor in (("uf", "XX"), ("max_por_dia", "50"), ("fuso", "Europe/Lisbon")):
        with pytest.raises(pg8000.native.DatabaseError) as error:
            api.run(
                f"UPDATE app.preferencias SET {coluna} = :v WHERE usuario_id = :u",  # noqa: S608
                v=valor,
                u=usuario,
            )
        assert error.value.args[0]["C"] in ("23514", "22P02")
    api.run("DELETE FROM app.usuario WHERE id = :u", u=usuario)
    assert api.run("SELECT count(*) FROM app.preferencias WHERE usuario_id = :u", u=usuario) == [
        [0]
    ]


@pytest.fixture
def notify() -> Iterator[pg8000.native.Connection]:
    connection = _connect("notify")
    yield connection
    connection.close()


def test_notificador_le_o_minimo(notify):
    # Lê eventos, alvos, quem segue o quê, preferências e aparelhos.
    for tabela in (
        "feed.evento",
        "feed.evento_alvo",
        "app.seguindo",
        "app.preferencias",
        "app.dispositivo",
        "app.notificacao",
        "app.notificacao_cursor",
        "app.resumo_semanal",
    ):
        notify.run(f"SELECT count(*) FROM {tabela}")  # noqa: S608
    notify.run("SELECT id, usuario_id, revogada_em FROM app.sessao LIMIT 1")
    # Não enxerga dados públicos brutos, hashes, logins nem refresh tokens.
    for consulta in (
        "SELECT count(*) FROM canon.pessoa",
        "SELECT count(*) FROM raw.raw_object",
        "SELECT count(*) FROM ident.pessoa",
        "SELECT count(*) FROM app.identidade",
        "SELECT count(*) FROM app.refresh_token",
        "SELECT count(*) FROM app.usuario",
        "SELECT motivo_revogacao FROM app.sessao LIMIT 1",
        "SELECT plataforma FROM app.sessao LIMIT 1",
    ):
        assert _denied(notify, consulta), consulta


def test_notificador_so_escreve_a_fila(notify):
    for comando in (
        "UPDATE feed.evento SET status = 'publicado'",
        "DELETE FROM app.seguindo",
        "UPDATE app.preferencias SET notificacoes = true",
        "INSERT INTO app.dispositivo (sessao_id, token, plataforma)"
        " VALUES (gen_random_uuid(), repeat('a', 40), 'ios')",
        "DELETE FROM app.notificacao",
        "DELETE FROM app.sessao",
    ):
        assert _denied(notify, comando), comando


def test_api_nao_ve_a_fila_mas_registra_aparelho(api):
    assert _denied(api, "SELECT count(*) FROM app.notificacao")
    assert _denied(api, "SELECT count(*) FROM app.notificacao_cursor")
    assert _denied(api, "SELECT count(*) FROM app.resumo_semanal")
    _, sessao = _usuario_com_sessao(api)
    api.run(
        "INSERT INTO app.dispositivo (sessao_id, token, plataforma) VALUES (:s, :t, 'android')",
        s=sessao,
        t=f"fcm:{uuid.uuid4()}-{'x' * 20}",
    )
    with pytest.raises(pg8000.native.DatabaseError) as error:
        api.run(
            "UPDATE app.dispositivo SET token = 'tem espaço e é curto' WHERE sessao_id = :s",
            s=sessao,
        )
    assert error.value.args[0]["C"] == "23514"
    # Sair encerra a sessão; excluir a conta apaga o aparelho em cascata.
    api.run("DELETE FROM app.sessao WHERE id = :s", s=sessao)
    assert api.run("SELECT count(*) FROM app.dispositivo WHERE sessao_id = :s", s=sessao) == [[0]]


def test_notificador_apaga_token_invalido_e_fila_some_com_a_conta(api, notify):
    usuario, sessao = _usuario_com_sessao(api)
    token = f"fcm:{uuid.uuid4()}-{'x' * 20}"
    api.run(
        "INSERT INTO app.dispositivo (sessao_id, token, plataforma) VALUES (:s, :t, 'ios')",
        s=sessao,
        t=token,
    )
    evento = str(uuid.uuid4())
    notify.run(
        "INSERT INTO app.notificacao (usuario_id, evento_id, tipo) VALUES (:u, :e, 'pauta')",
        u=usuario,
        e=evento,
    )
    # Um aviso por usuário e evento.
    with pytest.raises(pg8000.native.DatabaseError) as error:
        notify.run(
            "INSERT INTO app.notificacao (usuario_id, evento_id, tipo) VALUES (:u, :e, 'pauta')",
            u=usuario,
            e=evento,
        )
    assert error.value.args[0]["C"] == "23505"  # unique_violation
    # Enviada exige texto, aparelhos e data.
    with pytest.raises(pg8000.native.DatabaseError) as error:
        notify.run("UPDATE app.notificacao SET status = 'enviada' WHERE usuario_id = :u", u=usuario)
    assert error.value.args[0]["C"] == "23514"
    notify.run("DELETE FROM app.dispositivo WHERE token = :t", t=token)
    api.run("DELETE FROM app.usuario WHERE id = :u", u=usuario)
    assert notify.run("SELECT count(*) FROM app.notificacao WHERE usuario_id = :u", u=usuario) == [
        [0]
    ]


def test_resumo_semanal_um_por_semana_e_some_com_a_conta(api, notify):
    usuario, _ = _usuario_com_sessao(api)
    notify.run(
        "INSERT INTO app.resumo_semanal (usuario_id, semana, status)"
        " VALUES (:u, '2026-10-12', 'vazio')",
        u=usuario,
    )
    for semana, codigo in (("2026-10-12", "23505"), ("2026-10-14", "23514")):
        with pytest.raises(pg8000.native.DatabaseError) as error:
            notify.run(
                "INSERT INTO app.resumo_semanal (usuario_id, semana, status)"
                " VALUES (:u, CAST(:s AS date), 'vazio')",
                u=usuario,
                s=semana,
            )
        assert error.value.args[0]["C"] == codigo  # repetido; não é segunda-feira
    # Pendente exige o texto e o link.
    with pytest.raises(pg8000.native.DatabaseError) as error:
        notify.run(
            "INSERT INTO app.resumo_semanal (usuario_id, semana) VALUES (:u, '2026-10-19')",
            u=usuario,
        )
    assert error.value.args[0]["C"] == "23514"
    assert _denied(notify, "DELETE FROM app.resumo_semanal")
    api.run("DELETE FROM app.usuario WHERE id = :u", u=usuario)
    assert notify.run(
        "SELECT count(*) FROM app.resumo_semanal WHERE usuario_id = :u", u=usuario
    ) == [[0]]
