import random

import pytest

from tests.test_camara_eventos import PAUTA, _evento
from tests.test_senado_agenda import _comissoes, _plenario
from vida_publica_ingest.adapters.postgres import rows_as_dicts
from vida_publica_ingest.sources.camara_eventos import (
    CamaraEventoRepository,
    EventoCompleto,
    parse_evento,
    parse_pauta,
)
from vida_publica_ingest.sources.senado_agenda import (
    SenadoAgendaRepository,
    parse_reunioes,
    parse_sessoes,
)

pytestmark = pytest.mark.integration


def test_evento_da_camara_substitui_pauta(ingest_conn):
    repository = CamaraEventoRepository(ingest_conn)
    id_evento = random.randint(10**7, 10**8 - 1)  # noqa: S311 - id de teste
    evento, orgaos = parse_evento(_evento(id_evento))
    completo = EventoCompleto(evento, tuple(orgaos), tuple(parse_pauta(PAUTA)))

    assert repository.upsert(completo, raw_object_id=None)
    assert not repository.upsert(completo, raw_object_id=None)
    menor = EventoCompleto(evento, tuple(orgaos), tuple(parse_pauta(PAUTA)[:1]))
    assert repository.upsert(menor, raw_object_id=None)

    [row] = rows_as_dicts(
        ingest_conn,
        "SELECT e.deliberativo, e.sigla_orgao,"
        " (SELECT count(*) FROM canon.camara_evento_orgao o WHERE o.id_evento = e.id) AS orgaos,"
        " (SELECT array_agg(votacao_id) FROM canon.camara_pauta_item p WHERE p.id_evento = e.id)"
        " AS votacoes FROM canon.camara_evento e WHERE e.id = :id",
        id=id_evento,
    )
    assert row == {
        "deliberativo": True,
        "sigla_orgao": "PLEN",
        "orgaos": 2,
        "votacoes": ["9900001-7"],
    }


def test_sessao_e_reuniao_do_senado(ingest_conn):
    repository = SenadoAgendaRepository(ingest_conn)
    sufixo = random.randint(10**7, 10**8 - 1)  # noqa: S311 - id de teste

    payload = _plenario()
    sessao_json = payload["AgendaPlenario"]["Sessoes"]["Sessao"][0]
    sessao_json["CodigoSessao"] = str(sufixo)
    payload["AgendaPlenario"]["Sessoes"]["Sessao"] = sessao_json
    [sessao] = parse_sessoes(payload)
    assert repository.upsert_sessao(sessao, raw_object_id=None)
    assert not repository.upsert_sessao(sessao, raw_object_id=None)

    payload = _comissoes()
    payload["AgendaReuniao"]["reunioes"]["reuniao"]["codigo"] = str(sufixo)
    [reuniao] = parse_reunioes(payload)
    assert repository.upsert_reuniao(reuniao, raw_object_id=None)
    assert not repository.upsert_reuniao(reuniao, raw_object_id=None)

    [row] = rows_as_dicts(
        ingest_conn,
        "SELECT (SELECT count(*) FROM canon.senado_pauta_item WHERE codigo_sessao = :c) AS pauta,"
        " (SELECT count(*) FROM canon.senado_reuniao_item WHERE codigo_reuniao = :c) AS itens,"
        " (SELECT id_processo FROM canon.senado_reuniao_item WHERE codigo_reuniao = :c) AS proc",
        c=sufixo,
    )
    assert row == {"pauta": 2, "itens": 1, "proc": 9900900}
