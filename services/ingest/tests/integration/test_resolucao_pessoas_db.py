import random
from dataclasses import replace
from datetime import date

import pytest

from tests.test_camara_deputados import _detalhe as detalhe_camara
from tests.test_senado_senadores import _detalhe as detalhe_senado
from tests.test_tse_candidaturas import ROWS
from vida_publica_ingest.adapters.postgres import rows_as_dicts
from vida_publica_ingest.canon.pessoas import PessoaRepository, resolve
from vida_publica_ingest.sources.camara_deputados import CamaraDeputadoRepository, parse_deputado
from vida_publica_ingest.sources.senado_senadores import SenadoSenadorRepository, parse_senador
from vida_publica_ingest.sources.tse_candidaturas import TseCandidaturaRepository, parse_row

pytestmark = pytest.mark.integration


def _vinculo(conn, fonte, id_fonte):
    rows = rows_as_dicts(
        conn,
        "SELECT pessoa_id::text AS pessoa_id, metodo FROM canon.pessoa_vinculo"
        " WHERE fonte = :fonte AND id_fonte = :id",
        fonte=fonte,
        id=id_fonte,
    )
    return rows[0] if rows else None


def test_resolve_liga_fontes_e_manda_ambiguos_para_revisao(ingest_conn):
    sufixo = random.randint(10**8, 10**9)  # noqa: S311 - dados fictícios
    cpf_hash = f"{sufixo:064x}"
    nascimento = date(1950 + sufixo % 40, 1 + sufixo % 12, 1 + sufixo % 28)

    # TSE: deputada (com CPF) e senadora (cargo SENADOR) fictícias.
    deputada_tse, _ = parse_row(ROWS[0])
    deputada_tse = replace(deputada_tse, sq_candidato=sufixo, nm_candidato=f"DEPUTADA {sufixo}")
    senadora_tse = replace(
        deputada_tse,
        sq_candidato=sufixo + 1,
        nm_candidato=f"SENADORA EXEMPLO {sufixo}",
        ds_cargo="SENADOR",
        sg_uf="RS",
        dt_nascimento=nascimento,
    )
    TseCandidaturaRepository(ingest_conn).upsert_many(
        [(deputada_tse, cpf_hash, None), (senadora_tse, f"{sufixo + 1:064x}", None)],
        raw_object_id=None,
    )

    # Câmara: a mesma deputada, ligada pelo hash do CPF.
    deputada, _ = parse_deputado(detalhe_camara(sufixo % 10**8))
    CamaraDeputadoRepository(ingest_conn).upsert(
        deputada, cpf_hash=cpf_hash, legislaturas={57}, raw_object_id=None
    )

    # Senado: a senadora (nome com acento e caixa diferente) e uma sem correspondência.
    senado = SenadoSenadorRepository(ingest_conn)
    senadora = replace(
        parse_senador(detalhe_senado(sufixo % 10**8), em_exercicio=True),
        nome_completo=f"Senadora Exémplo {sufixo}",
        data_nascimento=nascimento,
        uf_parlamentar="RS",
    )
    sem_par = replace(senadora, codigo_senado=sufixo % 10**8 + 1, nome_completo="Ninguém")
    sem_par = replace(sem_par, data_nascimento=date(1901, 1, 1))
    senado.upsert(senadora, participacoes={57: {"Titular"}}, raw_object_id=None)
    senado.upsert(sem_par, participacoes={57: {"Titular"}}, raw_object_id=None)

    resolve(PessoaRepository(ingest_conn))

    tse_deputada = _vinculo(ingest_conn, "tse", f"2026:{sufixo}")
    camara = _vinculo(ingest_conn, "camara", str(deputada.id_camara))
    assert camara["pessoa_id"] == tse_deputada["pessoa_id"]
    assert camara["metodo"] == "cpf"

    tse_senadora = _vinculo(ingest_conn, "tse", f"2026:{sufixo + 1}")
    senado_vinculo = _vinculo(ingest_conn, "senado", str(senadora.codigo_senado))
    assert senado_vinculo == {"pessoa_id": tse_senadora["pessoa_id"], "metodo": "nome_nascimento"}

    assert _vinculo(ingest_conn, "senado", str(sem_par.codigo_senado)) is None
    [revisao] = rows_as_dicts(
        ingest_conn,
        "SELECT motivo, status FROM canon.match_review WHERE fonte = 'senado' AND id_fonte = :id",
        id=str(sem_par.codigo_senado),
    )
    assert revisao == {"motivo": "sem_candidatura_compativel", "status": "pendente"}

    # Rodar de novo não muda nada nem duplica.
    resolve(PessoaRepository(ingest_conn))
    assert _vinculo(ingest_conn, "camara", str(deputada.id_camara)) == camara
