import random

import pytest

from tests.test_ceaps_senado import CSV
from tests.test_senado_senadores import _detalhe
from vida_publica_ingest.adapters.postgres import rows_as_dicts
from vida_publica_ingest.identity import hash_cpf
from vida_publica_ingest.snapshot import PgSnapshotTable, sync, with_ids
from vida_publica_ingest.sources.ceaps_senado import (
    parse_row,
    read_csv,
    row_key,
    senadores_por_nome,
)
from vida_publica_ingest.sources.senado_senadores import SenadoSenadorRepository, parse_senador

pytestmark = pytest.mark.integration


def test_fotografia_da_ceaps_casa_senador_pelo_nome(ingest_conn):
    codigo = random.randint(10_000_000, 99_999_999)  # noqa: S311 - id de teste
    ano = random.randint(2100, 32000)  # noqa: S311 - ano fictício isola o teste
    nome = f"Joana Exemplo {codigo}"
    detalhe = _detalhe(codigo)
    detalhe["DetalheParlamentar"]["Parlamentar"]["IdentificacaoParlamentar"]["NomeParlamentar"] = (
        nome
    )
    SenadoSenadorRepository(ingest_conn).upsert(
        parse_senador(detalhe, em_exercicio=True), participacoes={}, raw_object_id=None
    )
    nomes = senadores_por_nome(ingest_conn)
    assert nomes.codigo(nome) == codigo

    def rows():
        for row in read_csv(CSV):
            row["ANO"] = str(ano)
            row["SENADOR"] = nome.upper()
            values, cpf = parse_row(row, codigo_senado=nomes.codigo(row["SENADOR"]))
            yield row_key(row), (values, hash_cpf(cpf, "chave-de-teste"))

    table = PgSnapshotTable(
        ingest_conn,
        "canon.senado_despesa",
        scope_column="ano",
        scope_value=ano,
        ident_table="ident.senado_despesa_fornecedor",
    )
    stats = sync(table, with_ids(f"ceaps:{ano}", rows()), raw_object_id=None)
    assert (stats.novas, stats.removidas) == (2, 0)
    stats = sync(table, with_ids(f"ceaps:{ano}", list(rows())[:1]), raw_object_id=None)
    assert (stats.novas, stats.removidas, stats.restauradas) == (0, 1, 0)

    [row] = rows_as_dicts(
        ingest_conn,
        "SELECT count(*) AS n, count(removido_em) AS removidas, count(codigo_senado) AS casadas,"
        " (SELECT count(*) FROM ident.senado_despesa_fornecedor f JOIN canon.senado_despesa d"
        "  ON d.id = f.linha_id WHERE d.ano = :ano) AS pf"
        " FROM canon.senado_despesa WHERE ano = :ano",
        ano=ano,
    )
    assert row == {"n": 2, "removidas": 1, "casadas": 2, "pf": 1}
