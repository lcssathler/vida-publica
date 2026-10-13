import random

import httpx
import pytest

from tests.test_tse_contas_candidatos import despesa, doador_originario, make_zip, receita
from vida_publica_ingest.adapters.memory import MemoryRawStorage
from vida_publica_ingest.adapters.postgres import PgRawRegistry, rows_as_dicts
from vida_publica_ingest.config import Settings
from vida_publica_ingest.http import SourceClient
from vida_publica_ingest.sources.tse_contas_candidatos import collect

pytestmark = pytest.mark.integration


def test_coleta_filtra_cargos_e_sincroniza(ingest_conn):
    ano = random.randint(2100, 32000)  # noqa: S311 - ano fictício isola o teste
    estadual = {
        "CD_CARGO": "7",
        "DS_CARGO": "Deputado Estadual",
        "SQ_PRESTADOR_CONTAS": "6800000002",
    }
    content = make_zip(
        ano,
        [receita(AA_ELEICAO=str(ano)), receita(AA_ELEICAO=str(ano), **estadual)],
        [
            doador_originario(AA_ELEICAO=str(ano)),
            doador_originario(AA_ELEICAO=str(ano), SQ_PRESTADOR_CONTAS="6800000002"),
        ],
        [despesa(AA_ELEICAO=str(ano)), despesa(AA_ELEICAO=str(ano), **estadual)],
    )
    transport = httpx.MockTransport(lambda request: httpx.Response(200, content=content))

    with SourceClient(Settings(), transport=transport) as client:
        stats = collect(
            client,
            MemoryRawStorage(),
            PgRawRegistry(ingest_conn),
            ingest_conn,
            cpf_hash_key="chave-de-teste",
            anos=[ano],
        )
        assert (stats.receitas.novas, stats.doadores_originarios.novas, stats.despesas.novas) == (
            1,
            1,
            1,
        )
        assert (stats.doadores_pf, stats.fornecedores_pf) == (0, 1)
        de_novo = collect(
            client,
            MemoryRawStorage(),
            PgRawRegistry(ingest_conn),
            ingest_conn,
            cpf_hash_key="chave-de-teste",
            anos=[ano],
        )
    assert (de_novo.receitas.novas, de_novo.despesas.novas, de_novo.receitas.removidas) == (0, 0, 0)

    [row] = rows_as_dicts(
        ingest_conn,
        "SELECT (SELECT count(*) FROM canon.tse_receita WHERE ano_eleicao = :ano) AS receitas,"
        " (SELECT count(*) FROM canon.tse_receita_doador_originario WHERE ano_eleicao = :ano)"
        " AS originarios,"
        " (SELECT count(*) FROM canon.tse_despesa WHERE ano_eleicao = :ano) AS despesas,"
        " (SELECT count(*) FROM ident.tse_despesa_fornecedor f JOIN canon.tse_despesa d"
        "  ON d.id = f.linha_id WHERE d.ano_eleicao = :ano) AS pf",
        ano=ano,
    )
    assert row == {"receitas": 1, "originarios": 1, "despesas": 1, "pf": 1}
