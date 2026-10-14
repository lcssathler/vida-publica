from datetime import date

from vida_publica_ingest.events.dinheiro_campanha import _diretorio, visibilidade


def test_eventos_de_candidato_so_para_seguidores_durante_a_campanha():
    assert visibilidade(2026, date(2026, 8, 15)) == "geral"
    assert visibilidade(2026, date(2026, 8, 16)) == "seguidores"
    assert visibilidade(2026, date(2026, 10, 25)) == "seguidores"
    assert visibilidade(2026, date(2026, 10, 26)) == "geral"
    assert visibilidade(2022, date(2026, 10, 14)) == "geral"


def test_nome_do_diretorio_sem_somar_niveis():
    assert _diretorio("N", "PL", "BR", None) == "diretório nacional do PL"
    assert _diretorio("F", "PT", "SP", None) == "diretório estadual do PT (SP)"
    assert _diretorio("M", "MDB", "MG", "BELO HORIZONTE") == (
        "diretório municipal do MDB (BELO HORIZONTE)"
    )
    assert _diretorio(None, "PSD", None, None) == "diretório do PSD"
