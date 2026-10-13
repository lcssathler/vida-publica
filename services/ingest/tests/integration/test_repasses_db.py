import random
from dataclasses import replace
from decimal import Decimal

import pytest

from tests.test_tse_candidaturas import ROWS
from tests.test_tse_contas_candidatos import receita
from vida_publica_ingest.adapters.postgres import rows_as_dicts
from vida_publica_ingest.canon import repasses
from vida_publica_ingest.canon.pessoas import PessoaRepository, resolve
from vida_publica_ingest.snapshot import PgSnapshotTable, sync, with_ids
from vida_publica_ingest.sources.tse_candidaturas import TseCandidaturaRepository, parse_row
from vida_publica_ingest.sources.tse_contas_candidatos import parse_receita, row_key

pytestmark = pytest.mark.integration


def test_repasses_por_diretorio_fonte_e_prestacao_vigente(ingest_conn):
    ano = random.randint(2100, 32000)  # noqa: S311 - ano fictício isola o teste
    sq = random.randint(10**8, 10**9 - 1)  # noqa: S311
    cpf_hash = f"{sq:064x}"
    candidatura, _ = parse_row(ROWS[0])
    TseCandidaturaRepository(ingest_conn).upsert_many(
        [(replace(candidatura, ano_eleicao=ano, sq_candidato=sq), cpf_hash, None)],
        raw_object_id=None,
    )
    resolve(PessoaRepository(ingest_conn))

    base = {"AA_ELEICAO": str(ano), "SQ_CANDIDATO": str(sq)}
    linhas = [
        # mesma receita em duas prestações: só a final conta
        receita(**base, TP_PRESTACAO_CONTAS="Parcial", VR_RECEITA="150000,00"),
        receita(**base, TP_PRESTACAO_CONTAS="FINAL", DT_PRESTACAO_CONTAS="05/11/2026",
                VR_RECEITA="150000,00"),
        # diretório nacional, fundo partidário
        receita(**base, SQ_RECEITA="48000002", CD_ESFERA_PARTIDARIA_DOADOR="N",
                DS_ESFERA_PARTIDARIA_DOADOR="Nacional", SG_UF_DOADOR="#NULO#",
                DS_FONTE_RECEITA="FUNDO PARTIDARIO", VR_RECEITA="20000,00"),
        # doação de pessoa física: não é repasse
        receita(**base, SQ_RECEITA="48000003", CD_ORIGEM_RECEITA="10010200",
                DS_ORIGEM_RECEITA="Recursos de pessoas físicas", NR_CPF_CNPJ_DOADOR="12345678900",
                VR_RECEITA="500,00"),
    ]  # fmt: skip

    def rows():
        for row in linhas:
            values, _ = parse_receita(row)
            yield row_key(row), (values, None)

    table = PgSnapshotTable(
        ingest_conn, "canon.tse_receita", scope_column="ano_eleicao", scope_value=ano
    )
    sync(table, with_ids(f"canon.tse_receita:{ano}", rows()), raw_object_id=None)

    stats = repasses.build(ingest_conn)
    assert stats.repasses_alterados >= 3
    de_novo = repasses.build(ingest_conn)
    assert (de_novo.repasses_alterados, de_novo.vigencia_alterada) == (0, 0)

    totais = rows_as_dicts(
        ingest_conn,
        "SELECT esfera, fonte, repasses, valor, pessoa_id IS NOT NULL AS com_pessoa"
        " FROM canon.repasse_total WHERE ano_eleicao = :ano AND sq_candidato = :sq"
        " ORDER BY esfera, fonte",
        ano=ano,
        sq=sq,
    )
    assert totais == [
        {"esfera": "F", "fonte": "fundo_especial", "repasses": 1, "valor": Decimal("150000.00"),
         "com_pessoa": True},
        {"esfera": "N", "fonte": "fundo_partidario", "repasses": 1, "valor": Decimal("20000.00"),
         "com_pessoa": True},
    ]  # fmt: skip
    [row] = rows_as_dicts(
        ingest_conn,
        "SELECT count(*) AS n, count(*) FILTER (WHERE vigente) AS vigentes,"
        " (SELECT tp_prestacao FROM canon.repasse WHERE ano_eleicao = :ano AND sq_candidato = :sq"
        "  AND sq_receita = 48000001 AND vigente) AS vigente_de"
        " FROM canon.repasse WHERE ano_eleicao = :ano AND sq_candidato = :sq",
        ano=ano,
        sq=sq,
    )
    assert row == {"n": 3, "vigentes": 2, "vigente_de": "FINAL"}
