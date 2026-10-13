import random

import httpx
import pytest

from tests.test_tse_contas_candidatos import doador_originario
from tests.test_tse_contas_partidos import despesa, make_zip, pagamento, receita
from vida_publica_ingest.adapters.memory import MemoryRawStorage
from vida_publica_ingest.adapters.postgres import PgRawRegistry, rows_as_dicts
from vida_publica_ingest.config import Settings
from vida_publica_ingest.http import SourceClient
from vida_publica_ingest.sources.tse_contas_partidos import collect

pytestmark = pytest.mark.integration


def test_coleta_das_contas_de_orgaos(ingest_conn):
    ano = random.randint(2100, 32000)  # noqa: S311 - ano fictício isola o teste
    a = {"AA_ELEICAO": str(ano)}
    content = make_zip(
        ano, [receita(**a)], [doador_originario(**a)], [despesa(**a)], [pagamento(**a)]
    )
    transport = httpx.MockTransport(lambda request: httpx.Response(200, content=content))
    with SourceClient(Settings(), transport=transport) as client:
        args = (client, MemoryRawStorage(), PgRawRegistry(ingest_conn), ingest_conn)
        stats = collect(*args, cpf_hash_key="chave-de-teste", anos=[ano])
        assert stats.repasses_a_candidatos == 1
        assert [
            s.novas
            for s in (stats.receitas, stats.doadores_originarios, stats.despesas, stats.pagamentos)
        ] == [1, 1, 1, 1]
        de_novo = collect(*args, cpf_hash_key="chave-de-teste", anos=[ano])
    assert de_novo.despesas.novas == 0 and de_novo.receitas.removidas == 0

    [row] = rows_as_dicts(
        ingest_conn,
        "SELECT (SELECT ds_fonte FROM canon.tse_partido_pagamento p"
        " JOIN canon.tse_partido_despesa d"
        " ON d.ano_eleicao = p.ano_eleicao AND d.sq_prestador = p.sq_prestador"
        " AND d.sq_despesa = p.sq_despesa WHERE d.ano_eleicao = :ano) AS fonte,"
        " (SELECT count(*) FROM ident.tse_partido_receita_doador f JOIN canon.tse_partido_receita r"
        "  ON r.id = f.linha_id WHERE r.ano_eleicao = :ano) AS pf",
        ano=ano,
    )
    assert row == {"fonte": "Fundo Especial de Financiamento de Campanha", "pf": 1}
