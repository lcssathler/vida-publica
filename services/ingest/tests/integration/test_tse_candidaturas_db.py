import random
from dataclasses import replace

import pytest

from tests.test_tse_candidaturas import ROWS
from vida_publica_ingest.adapters.postgres import rows_as_dicts
from vida_publica_ingest.sources.tse_candidaturas import TseCandidaturaRepository, parse_row

pytestmark = pytest.mark.integration


def test_upsert_many_e_idempotente(ingest_conn):
    repository = TseCandidaturaRepository(ingest_conn)
    candidatura, _ = parse_row(ROWS[0])
    candidatura = replace(candidatura, sq_candidato=random.randint(10**11, 10**12))  # noqa: S311
    items = [(candidatura, "a" * 64, "b" * 64)]

    assert repository.upsert_many(items, raw_object_id=None) == 1
    assert repository.upsert_many(items, raw_object_id=None) == 0
    eleita = replace(candidatura, ds_sit_tot_turno="ELEITO")
    assert repository.upsert_many([(eleita, "a" * 64, "b" * 64)], raw_object_id=None) == 1

    [row] = rows_as_dicts(
        ingest_conn,
        "SELECT c.ds_sit_tot_turno, i.cpf_hash FROM canon.tse_candidatura c"
        " JOIN ident.tse_candidatura i USING (ano_eleicao, sq_candidato)"
        " WHERE c.sq_candidato = :sq",
        sq=candidatura.sq_candidato,
    )
    assert row == {"ds_sit_tot_turno": "ELEITO", "cpf_hash": "a" * 64}
