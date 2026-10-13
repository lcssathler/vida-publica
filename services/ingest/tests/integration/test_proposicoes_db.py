import random

import pytest

from tests.test_proposicoes import AUTORES, TEMAS, TRAMITACOES, _detalhe_camara, _processo
from vida_publica_ingest.adapters.postgres import rows_as_dicts
from vida_publica_ingest.sources.proposicoes import (
    ProposicaoRepository,
    parse_camara,
    parse_senado,
)

pytestmark = pytest.mark.integration


def test_upsert_camara_acumula_tramitacoes_e_substitui_temas(ingest_conn):
    repository = ProposicaoRepository(ingest_conn)
    id_camara = random.randint(10**7, 10**8 - 1)  # noqa: S311 - id de teste
    parcial = parse_camara(
        _detalhe_camara(id_camara), {"dados": TRAMITACOES["dados"][:1]}, TEMAS, AUTORES
    )
    assert repository.upsert(parcial, raw_object_id=None)
    assert not repository.upsert(parcial, raw_object_id=None)

    completa = parse_camara(
        _detalhe_camara(id_camara), TRAMITACOES, {"dados": TEMAS["dados"][:1]}, AUTORES
    )
    assert repository.upsert(completa, raw_object_id=None)

    [row] = rows_as_dicts(
        ingest_conn,
        "SELECT p.identificacao, p.situacao,"
        " (SELECT count(*) FROM canon.proposicao_tramitacao t WHERE t.proposicao_id = p.id) AS tr,"
        " (SELECT count(*) FROM canon.proposicao_tema t WHERE t.proposicao_id = p.id) AS temas,"
        " (SELECT count(*) FROM canon.proposicao_autor a WHERE a.proposicao_id = p.id) AS autores"
        " FROM canon.proposicao p WHERE p.casa = 'camara' AND p.id_fonte = :id",
        id=str(id_camara),
    )
    assert row == {
        "identificacao": "PL 123/2025",
        "situacao": "Aguardando Envio ao Senado Federal",
        "tr": 2,
        "temas": 1,
        "autores": 2,
    }


def test_upsert_senado(ingest_conn):
    repository = ProposicaoRepository(ingest_conn)
    id_processo = random.randint(10**7, 10**8 - 1)  # noqa: S311 - id de teste
    completa = parse_senado(_processo(id_processo))
    assert repository.upsert(completa, raw_object_id=None)
    assert not repository.upsert(completa, raw_object_id=None)
    [row] = rows_as_dicts(
        ingest_conn,
        "SELECT p.codigo_materia, p.tramitando, (SELECT min(descricao)"
        " FROM canon.proposicao_tramitacao t WHERE t.proposicao_id = p.id) AS primeira"
        " FROM canon.proposicao p WHERE p.casa = 'senado' AND p.id_fonte = :id",
        id=str(id_processo),
    )
    assert row == {
        "codigo_materia": 990001,
        "tramitando": True,
        "primeira": "Autuado o Projeto de Lei nº 123/2026.",
    }
