import random

import pytest

from tests.test_senado_votacoes import _votacao
from vida_publica_ingest.adapters.postgres import rows_as_dicts
from vida_publica_ingest.sources.senado_votacoes import SenadoVotacaoRepository, parse_votacao

pytestmark = pytest.mark.integration


def test_upsert_substitui_votos(ingest_conn):
    repository = SenadoVotacaoRepository(ingest_conn)
    codigo = random.randint(10**7, 10**8 - 1)  # noqa: S311 - id de teste
    completa = parse_votacao(_votacao(codigo))

    assert repository.upsert(completa, raw_object_id=None)
    assert not repository.upsert(completa, raw_object_id=None)

    payload = _votacao(codigo)
    payload["votos"] = payload["votos"][:2]
    assert repository.upsert(parse_votacao(payload), raw_object_id=None)

    [row] = rows_as_dicts(
        ingest_conn,
        "SELECT v.identificacao, v.secreta, (SELECT count(*) FROM canon.senado_voto s"
        " WHERE s.codigo_sessao_votacao = v.codigo_sessao_votacao) AS votos"
        " FROM canon.senado_votacao v WHERE v.codigo_sessao_votacao = :codigo",
        codigo=codigo,
    )
    assert row == {"identificacao": "PL 123/2026", "secreta": False, "votos": 2}
