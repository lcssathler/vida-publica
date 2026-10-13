import os
import random
from dataclasses import replace
from datetime import date
from decimal import Decimal

import pg8000.native
import pytest

from vida_publica_ingest.adapters.postgres import rows_as_dicts
from vida_publica_ingest.events.engine import (
    Alvo,
    Evento,
    Gerador,
    Regra,
    RegraAlterada,
    liberar_carga_inicial,
    momento,
    processar,
)

pytestmark = pytest.mark.integration


def _tipo() -> str:
    return f"teste_{random.randint(10**8, 10**9 - 1)}"  # noqa: S311 - isola o teste


def _evento(chave: str, valor: str | None = None, titulo: str = "Fato") -> Evento:
    return Evento(
        chave=chave,
        ocorrido_em=momento(date(2026, 10, 1)),
        titulo=titulo,
        payload={"n": 1},
        alvos=(Alvo("pessoa", f"p{chave}", "autor"), Alvo("assunto", "Saúde")),
        fonte_url="https://example.org/fonte",
        valor=None if valor is None else Decimal(valor),
    )


def _status(conn, tipo: str) -> dict[str, tuple]:
    rows = rows_as_dicts(
        conn,
        "SELECT chave_fato, regra_versao, status, motivo, titulo FROM feed.evento"
        " WHERE tipo = :tipo ORDER BY chave_fato, regra_versao",
        tipo=tipo,
    )
    return {
        f"{r['chave_fato']}@v{r['regra_versao']}": (r["status"], r["motivo"], r["titulo"])
        for r in rows
    }


def test_ciclo_de_vida_dos_eventos(ingest_conn):
    tipo = _tipo()
    regra = Regra(tipo, 1, "regra de teste", {"revisao_acima_de": 500000})
    fatos = [_evento("a"), _evento("b"), _evento("c", valor="750000")]

    def gerador(regra: Regra = regra) -> Gerador:
        return Gerador(regra, lambda _conn: list(fatos))

    primeira = processar(ingest_conn, gerador())
    assert (primeira.carga_inicial, primeira.novos, primeira.segurados) == (True, 3, 3)
    assert _status(ingest_conn, tipo) == {
        "a@v1": ("segurado", "carga_inicial", "Fato"),
        "b@v1": ("segurado", "carga_inicial", "Fato"),
        "c@v1": ("segurado", "revisao_valor", "Fato"),
    }
    [[alvos]] = ingest_conn.run(
        "SELECT count(*) FROM feed.evento_alvo a JOIN feed.evento e ON e.id = a.evento_id"
        " WHERE e.tipo = :tipo",
        tipo=tipo,
    )
    assert alvos == 6

    de_novo = processar(ingest_conn, gerador())
    assert (de_novo.novos, de_novo.alterados, de_novo.arquivados) == (0, 0, 0)

    # liberar a carga inicial não publica o que espera revisão de valor
    assert liberar_carga_inicial(ingest_conn, tipo) == 2

    # fato novo depois da carga inicial já sai publicado; fato alterado é atualizado;
    # fato que sumiu da fonte é arquivado
    fatos[:] = [_evento("a", titulo="Fato corrigido"), _evento("c", valor="750000"), _evento("d")]
    terceira = processar(ingest_conn, gerador())
    assert (terceira.carga_inicial, terceira.novos, terceira.alterados, terceira.arquivados) == (
        False, 1, 1, 1,
    )  # fmt: skip
    assert _status(ingest_conn, tipo) == {
        "a@v1": ("publicado", None, "Fato corrigido"),
        "b@v1": ("arquivado", "fonte_removeu", "Fato"),
        "c@v1": ("segurado", "revisao_valor", "Fato"),
        "d@v1": ("publicado", None, "Fato"),
    }

    # a regra não pode mudar sem versão nova
    with pytest.raises(RegraAlterada):
        processar(ingest_conn, gerador(replace(regra, parametros={"revisao_acima_de": 1})))

    # versão nova: herda o status de cada fato e arquiva a versão anterior
    v2 = processar(ingest_conn, gerador(Regra(tipo, 2, "regra de teste, v2", regra.parametros)))
    assert (v2.carga_inicial, v2.novos, v2.substituidos) == (False, 3, 3)
    status = _status(ingest_conn, tipo)
    assert status["a@v2"] == ("publicado", None, "Fato corrigido")
    assert status["c@v2"] == ("segurado", "revisao_valor", "Fato")
    assert status["a@v1"] == ("arquivado", "regra_substituida", "Fato corrigido")
    assert "b@v2" not in status

    with pytest.raises(RegraAlterada):
        processar(ingest_conn, gerador())  # versão antiga depois da nova


def _connect(role: str) -> pg8000.native.Connection:
    password = os.environ.get(f"VP_{role.upper()}_DB_PASSWORD")
    if not password:
        pytest.skip("senhas do infra/.env não definidas")
    return pg8000.native.Connection(
        user=f"vp_{role}",
        password=password,
        host=os.environ.get("VP_TEST_DB_HOST", "127.0.0.1"),
        port=int(os.environ.get("POSTGRES_PORT", "5433")),
        database=os.environ.get("POSTGRES_DB", "vida_publica"),
    )


def test_api_le_o_feed_e_so_o_admin_revisa(ingest_conn):
    tipo = _tipo()
    processar(ingest_conn, Gerador(Regra(tipo, 1, "teste"), lambda _conn: [_evento("x")]))

    api = _connect("api")
    try:
        [[n]] = api.run("SELECT count(*) FROM feed.evento WHERE tipo = :tipo", tipo=tipo)
        assert n == 1
        with pytest.raises(pg8000.native.DatabaseError, match="permission denied"):
            api.run("UPDATE feed.evento SET status = 'publicado' WHERE tipo = :tipo", tipo=tipo)
    finally:
        api.close()

    admin = _connect("admin")
    try:
        admin.run(
            "UPDATE feed.evento SET status = 'publicado', motivo = NULL, publicado_em = now(),"
            " revisado_em = now(), revisado_por = 'teste' WHERE tipo = :tipo",
            tipo=tipo,
        )
    finally:
        admin.close()
    [[status]] = ingest_conn.run("SELECT status FROM feed.evento WHERE tipo = :tipo", tipo=tipo)
    assert status == "publicado"
