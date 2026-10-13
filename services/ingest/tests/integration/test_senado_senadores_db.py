import random

import pytest

from tests.test_senado_senadores import _detalhe
from vida_publica_ingest.adapters.postgres import rows_as_dicts
from vida_publica_ingest.sources.senado_senadores import SenadoSenadorRepository, parse_senador

pytestmark = pytest.mark.integration


def test_upsert_de_senador_e_participacoes(ingest_conn):
    repository = SenadoSenadorRepository(ingest_conn)
    codigo = random.randint(10_000_000, 99_999_999)  # noqa: S311 - id de teste
    senador = parse_senador(_detalhe(codigo), em_exercicio=False)

    assert repository.upsert(senador, participacoes={57: {"1º Suplente"}}, raw_object_id=None)
    assert not repository.upsert(senador, participacoes={57: {"1º Suplente"}}, raw_object_id=None)
    em_exercicio = parse_senador(_detalhe(codigo), em_exercicio=True)
    assert repository.upsert(em_exercicio, participacoes={57: {"Titular"}}, raw_object_id=None)

    [row] = rows_as_dicts(
        ingest_conn,
        "SELECT s.em_exercicio, (SELECT array_agg(participacao ORDER BY participacao)"
        " FROM canon.senado_senador_legislatura l WHERE l.codigo_senado = s.codigo_senado) AS p"
        " FROM canon.senado_senador s WHERE s.codigo_senado = :codigo",
        codigo=codigo,
    )
    assert row == {"em_exercicio": True, "p": ["1º Suplente", "Titular"]}
