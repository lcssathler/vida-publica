import random

import pytest

from tests.test_camara_votacoes import ORIENTACOES, VOTOS, _detalhe
from vida_publica_ingest.adapters.postgres import rows_as_dicts
from vida_publica_ingest.sources.camara_votacoes import (
    CamaraVotacaoRepository,
    VotacaoCompleta,
    parse_orientacoes,
    parse_votacao,
    parse_votos,
)

pytestmark = pytest.mark.integration


def test_upsert_substitui_votos_e_orientacoes(ingest_conn):
    repository = CamaraVotacaoRepository(ingest_conn)
    votacao_id = f"{random.randint(10**7, 10**8 - 1)}-1"  # noqa: S311 - id de teste
    votacao, proposicoes = parse_votacao(_detalhe(votacao_id))
    completa = VotacaoCompleta(
        votacao,
        tuple(proposicoes),
        tuple(parse_votos(VOTOS)),
        tuple(parse_orientacoes(ORIENTACOES)),
    )

    assert repository.upsert(completa, raw_object_id=None)
    assert not repository.upsert(completa, raw_object_id=None)

    menos_votos = VotacaoCompleta(
        votacao, tuple(proposicoes), tuple(parse_votos({"dados": VOTOS["dados"][:1]})), ()
    )
    assert repository.upsert(menos_votos, raw_object_id=None)

    [row] = rows_as_dicts(
        ingest_conn,
        "SELECT v.nominal, v.proposicao_principal_id,"
        " (SELECT count(*) FROM canon.camara_voto WHERE votacao_id = v.id) AS votos,"
        " (SELECT count(*) FROM canon.camara_orientacao WHERE votacao_id = v.id) AS orientacoes,"
        " (SELECT count(*) FROM canon.camara_votacao_proposicao WHERE votacao_id = v.id) AS props"
        " FROM canon.camara_votacao v WHERE v.id = :id",
        id=votacao_id,
    )
    assert row == {
        "nominal": True,
        "proposicao_principal_id": 9900001,
        "votos": 1,
        "orientacoes": 0,
        "props": 2,
    }
