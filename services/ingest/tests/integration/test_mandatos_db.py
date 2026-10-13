import random
from dataclasses import replace
from datetime import date

import pytest

from tests.test_camara_deputados import _detalhe
from tests.test_tse_candidaturas import ROWS
from vida_publica_ingest.adapters.postgres import rows_as_dicts
from vida_publica_ingest.canon import mandatos
from vida_publica_ingest.canon.pessoas import PessoaRepository, resolve
from vida_publica_ingest.sources.camara_deputados import CamaraDeputadoRepository, parse_deputado
from vida_publica_ingest.sources.camara_historico import CamaraHistoricoRepository, parse_historico
from vida_publica_ingest.sources.tse_candidaturas import TseCandidaturaRepository, parse_row

pytestmark = pytest.mark.integration


def test_mandato_e_filiacoes_de_um_deputado(ingest_conn):
    sufixo = random.randint(10**7, 10**8 - 1)  # noqa: S311 - dados fictícios
    cpf_hash = f"{sufixo:064x}"
    candidatura, _ = parse_row(ROWS[0])
    TseCandidaturaRepository(ingest_conn).upsert_many(
        [(replace(candidatura, sq_candidato=sufixo), cpf_hash, None)], raw_object_id=None
    )
    deputado, _ = parse_deputado(_detalhe(sufixo))
    CamaraDeputadoRepository(ingest_conn).upsert(
        deputado, cpf_hash=cpf_hash, legislaturas={57}, raw_object_id=None
    )
    historico = CamaraHistoricoRepository(ingest_conn)
    historico.save_legislaturas([{"id": 57, "dataInicio": "2023-02-01", "dataFim": "2027-01-31"}])
    evento = {
        "id": sufixo,
        "idLegislatura": 57,
        "siglaUf": "MG",
        "condicaoEleitoral": "Titular",
        "situacao": "Exercício",
    }
    historico.save_eventos(
        parse_historico(
            {
                "dados": [
                    {
                        **evento,
                        "dataHora": "2023-02-01T12:05",
                        "siglaPartido": "XYZ",
                        "descricaoStatus": "Entrada - Posse de Eleito Titular",
                    },
                    {
                        **evento,
                        "dataHora": "2026-03-09T17:24",
                        "siglaPartido": "ABC",
                        "descricaoStatus": "Alteração de partido",
                    },
                ]
            }
        )
    )
    resolve(PessoaRepository(ingest_conn))
    mandatos.build(ingest_conn)

    [mandato] = rows_as_dicts(
        ingest_conn,
        "SELECT casa, condicao, inicio, fim, em_exercicio FROM canon.mandato"
        " WHERE casa = 'camara' AND fonte_id = :id",
        id=str(sufixo),
    )
    assert mandato == {
        "casa": "camara",
        "condicao": "Titular",
        "inicio": date(2023, 2, 1),
        "fim": None,
        "em_exercicio": True,
    }
    filiacoes = rows_as_dicts(
        ingest_conn,
        "SELECT f.sigla, f.desde, f.ate FROM canon.filiacao f JOIN canon.pessoa_vinculo v"
        " ON v.pessoa_id = f.pessoa_id WHERE v.fonte = 'camara' AND v.id_fonte = :id"
        " ORDER BY f.desde",
        id=str(sufixo),
    )
    assert filiacoes == [
        {"sigla": "XYZ", "desde": date(2023, 2, 1), "ate": date(2026, 3, 8)},
        {"sigla": "ABC", "desde": date(2026, 3, 9), "ate": None},
    ]
