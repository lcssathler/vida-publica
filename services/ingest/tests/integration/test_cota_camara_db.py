import random

import pytest

from tests.test_cota_camara import KEY, _row, _zip
from vida_publica_ingest.adapters.postgres import rows_as_dicts
from vida_publica_ingest.identity import hash_cpf
from vida_publica_ingest.sources.cota_camara import CamaraDespesaRepository, parse_file

pytestmark = pytest.mark.integration


def test_insercao_diferenca_e_hash_do_fornecedor(ingest_conn):
    repository = CamaraDespesaRepository(ingest_conn)
    ano = random.randint(2100, 2999)  # noqa: S311 - ano fictício isola o teste
    linhas = list(
        parse_file(
            _zip(
                [
                    _row(numAno=str(ano)),
                    _row(numAno=str(ano), ideDocumento="2", txtCNPJCPF="123.456.789-00"),
                ],
                ano,
            ),
            ano,
        )
    )
    itens = [(d, hash_cpf(cpf, KEY)) for d, cpf in linhas]
    repository.insert_many(itens, raw_object_id=None)
    repository.insert_many(itens, raw_object_id=None)
    repository.mark_removed([linhas[0][0].id])
    assert repository.ids_do_ano(ano) == {linhas[0][0].id: True, linhas[1][0].id: False}
    repository.restore([linhas[0][0].id])

    [row] = rows_as_dicts(
        ingest_conn,
        "SELECT count(*) AS n, count(removido_em) AS removidas,"
        " (SELECT count(*) FROM ident.camara_despesa_fornecedor f"
        "  JOIN canon.camara_despesa d ON d.id = f.despesa_id WHERE d.ano = :ano) AS pf,"
        " sum(valor_liquido) AS total FROM canon.camara_despesa WHERE ano = :ano",
        ano=ano,
    )
    assert row == {"n": 2, "removidas": 0, "pf": 1, "total": 501}
