import os
import random

import pg8000.native
import pytest

from tests.test_camara_deputados import _detalhe
from vida_publica_ingest.adapters.postgres import rows_as_dicts
from vida_publica_ingest.identity import hash_cpf
from vida_publica_ingest.sources.camara_deputados import CamaraDeputadoRepository, parse_deputado

pytestmark = pytest.mark.integration


def test_upsert_grava_detecta_mudanca_e_separa_o_hash(ingest_conn):
    repository = CamaraDeputadoRepository(ingest_conn)
    id_camara = random.randint(10_000_000, 99_999_999)  # noqa: S311 - id de teste
    deputado, cpf = parse_deputado(_detalhe(id_camara))
    cpf_hash = hash_cpf(cpf, "chave-de-teste")

    assert repository.upsert(deputado, cpf_hash=cpf_hash, legislaturas={57}, raw_object_id=None)
    assert not repository.upsert(deputado, cpf_hash=cpf_hash, legislaturas={57}, raw_object_id=None)

    mudado = _detalhe(id_camara)
    mudado["dados"]["ultimoStatus"]["siglaPartido"] = "ABC"
    novo, _ = parse_deputado(mudado)
    assert repository.upsert(novo, cpf_hash=cpf_hash, legislaturas={56}, raw_object_id=None)

    [row] = rows_as_dicts(
        ingest_conn,
        "SELECT d.sigla_partido, i.cpf_hash,"
        " (SELECT array_agg(id_legislatura ORDER BY id_legislatura)"
        "    FROM canon.camara_deputado_legislatura l WHERE l.id_camara = d.id_camara) AS legs"
        " FROM canon.camara_deputado d JOIN ident.camara_deputado i USING (id_camara)"
        " WHERE d.id_camara = :id",
        id=id_camara,
    )
    assert row == {"sigla_partido": "ABC", "cpf_hash": cpf_hash, "legs": [56, 57]}


def test_api_le_deputados_mas_nao_enxerga_hash_de_cpf():
    password = os.environ.get("VP_API_DB_PASSWORD")
    if not password:
        pytest.skip("VP_API_DB_PASSWORD não definida")
    conn = pg8000.native.Connection(
        user="vp_api",
        password=password,
        host=os.environ.get("VP_TEST_DB_HOST", "127.0.0.1"),
        port=int(os.environ.get("POSTGRES_PORT", "5433")),
        database=os.environ.get("POSTGRES_DB", "vida_publica"),
    )
    try:
        conn.run("SELECT count(*) FROM canon.camara_deputado")
        with pytest.raises(pg8000.native.DatabaseError) as error:
            conn.run("SELECT cpf_hash FROM ident.camara_deputado")
        assert error.value.args[0]["C"] == "42501"
    finally:
        conn.close()
