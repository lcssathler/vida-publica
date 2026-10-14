import json
import random

import pytest

from vida_publica_ingest.adapters.postgres import rows_as_dicts
from vida_publica_ingest.events import dinheiro_campanha
from vida_publica_ingest.events.engine import processar

pytestmark = pytest.mark.integration


def _receita(conn, tabela: str, **campos) -> None:
    colunas = ", ".join(campos)
    valores = ", ".join(f":{c}" for c in campos)
    conn.run(f"INSERT INTO {tabela} ({colunas}) VALUES ({valores})", **campos)  # noqa: S608


def test_fundo_e_doacoes_com_revisao_e_sem_nome_de_pessoa_fisica(ingest_conn):
    ano = random.randint(2100, 9999)  # noqa: S311 - ano fictício isola o teste
    sq = random.randint(10**8, 10**9 - 1)  # noqa: S311
    # fundo recebido por um diretório nacional em duas prestações: só a final conta
    for sufixo, prestacao in [("p", "Parcial"), ("f", "Final")]:
        _receita(
            ingest_conn, "canon.tse_partido_receita", id=f"{sq:063d}{sufixo}", ano_eleicao=ano,
            sq_prestador=sq, tp_prestacao=prestacao, esfera="N", sg_uf="BR", sg_partido="PL",
            ds_fonte="Fundo Especial", ds_origem="Recursos de partido político", sq_receita=1,
            doador_cnpj="00000000000191", doador_nome="TESOURO", valor=900000,
        )  # fmt: skip
    # duas doações de pessoas físicas no mesmo dia e uma de outro candidato
    for i, (origem, nome) in enumerate([(10010200, "PESSOA UM"), (10010200, "PESSOA DOIS"),
                                        (10040000, "OUTRO CANDIDATO")]):  # fmt: skip
        _receita(
            ingest_conn, "canon.tse_receita", id=f"{sq:063d}{i}", ano_eleicao=ano,
            sq_candidato=sq, tp_prestacao="PARCIAL", cd_origem=origem, sq_receita=10 + i,
            data=f"{ano}-09-01", doador_nome=nome, valor=600,
        )  # fmt: skip

    for gerador in (dinheiro_campanha.GERADORES[0], dinheiro_campanha.GERADORES[2]):
        processar(ingest_conn, gerador)
    rows = rows_as_dicts(
        ingest_conn,
        "SELECT tipo, titulo, resumo, payload, status, motivo, valor FROM feed.evento"
        " WHERE tipo IN ('fundo_recebido', 'doacao') AND chave_fato LIKE :chave"
        " ORDER BY tipo, chave_fato",
        chave=f"{ano}:{sq}:%",
    )
    assert [(r["tipo"], r["valor"]) for r in rows] == [
        ("doacao", 1200), ("doacao", 600), ("fundo_recebido", 900000),
    ]  # fmt: skip
    pf, outro, fundo = rows
    assert pf["titulo"] == f"Candidatura {sq} recebeu R$ 1.200,00 de pessoas físicas em 01/09/{ano}"
    texto_pf = json.dumps([pf["titulo"], pf["resumo"], pf["payload"]], ensure_ascii=False)
    assert "PESSOA" not in texto_pf
    assert pf["payload"]["doacoes"] == 2
    assert "OUTRO CANDIDATO" in outro["titulo"]
    assert fundo["payload"]["prestacao"] == "Final"
    assert (fundo["status"], fundo["motivo"]) == ("segurado", "revisao_valor")

    for gerador in (dinheiro_campanha.GERADORES[0], dinheiro_campanha.GERADORES[2]):
        stats = processar(ingest_conn, gerador)
        assert (stats.novos, stats.alterados, stats.arquivados) == (0, 0, 0)
