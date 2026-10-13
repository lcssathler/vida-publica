import random
from datetime import date

import pytest

from tests.test_camara_eventos import _evento
from tests.test_camara_presenca import PRESENCAS_XML
from vida_publica_ingest.adapters.postgres import rows_as_dicts
from vida_publica_ingest.sources.camara_eventos import (
    CamaraEventoRepository,
    EventoCompleto,
    parse_evento,
)
from vida_publica_ingest.sources.camara_presenca import (
    CamaraPresencaRepository,
    parse_presencas_dia,
)

pytestmark = pytest.mark.integration


def test_presenca_por_evento_e_por_dia(ingest_conn):
    id_evento = random.randint(10**7, 10**8 - 1)  # noqa: S311 - id de teste
    evento, orgaos = parse_evento(_evento(id_evento))
    CamaraEventoRepository(ingest_conn).upsert(
        EventoCompleto(evento, tuple(orgaos), ()), raw_object_id=None
    )
    repository = CamaraPresencaRepository(ingest_conn)
    assert id_evento in repository.eventos_deliberativos(date(2026, 9, 3), date(2026, 9, 3))
    assert date(2026, 9, 3) in repository.dias_de_plenario(date(2026, 9, 1), date(2026, 9, 30))

    assert repository.save_presentes(id_evento, [900001, 900002]) == 2
    assert repository.save_presentes(id_evento, [900001, 900002, 900003]) == 1

    dia, presencas = parse_presencas_dia(PRESENCAS_XML)
    sufixo = random.randint(10**7, 10**8 - 1)  # noqa: S311 - id de teste
    registros = [(sufixo + i, p) for i, p in enumerate(presencas)]
    repository.save_dia(dia, registros, raw_object_id=None)
    repository.save_dia(dia, registros, raw_object_id=None)

    [row] = rows_as_dicts(
        ingest_conn,
        "SELECT (SELECT count(*) FROM canon.camara_presenca WHERE id_evento = :evento) AS n,"
        " (SELECT count(*) FROM canon.camara_presenca_dia WHERE id_camara BETWEEN :a AND :b)"
        " AS dias, (SELECT justificativa FROM canon.camara_presenca_dia WHERE id_camara = :a + 1)"
        " AS just",
        evento=id_evento,
        a=sufixo,
        b=sufixo + 2,
    )
    assert row == {"n": 3, "dias": 3, "just": "Missão Autorizada"}
