import random

import pytest

from vida_publica_ingest.adapters.postgres import rows_as_dicts
from vida_publica_ingest.sources.partidos import PartidoObservado, PartidoRepository, Sucessao

pytestmark = pytest.mark.integration


def test_save_liga_sucessor(ingest_conn):
    numero = random.randint(1000, 9999)  # noqa: S311 - número fictício
    repository = PartidoRepository(ingest_conn)
    antigo = PartidoObservado(numero, "ANTIGOX", "PARTIDO ANTIGO", 2018, 2018)
    novo = PartidoObservado(numero, "NOVOX", "PARTIDO NOVO", 2022, 2026)
    sucessao = Sucessao(numero, "ANTIGOX", numero, "NOVOX", "renomeacao", 2022)

    assert repository.save([antigo, novo], [(sucessao, True)]) == 1
    rows = rows_as_dicts(
        ingest_conn,
        "SELECT a.sigla, n.sigla AS sucessor, a.tipo_sucessao, a.sucessao_inferida"
        " FROM canon.partido a JOIN canon.partido n ON n.id = a.sucessor_id"
        " WHERE a.numero_tse = :numero",
        numero=numero,
    )
    assert rows == [
        {
            "sigla": "ANTIGOX",
            "sucessor": "NOVOX",
            "tipo_sucessao": "renomeacao",
            "sucessao_inferida": True,
        }
    ]
