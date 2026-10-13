from vida_publica_ingest.canon.repasses import fonte


def test_fonte_do_dinheiro():
    assert fonte("FUNDO ESPECIAL") == "fundo_especial"
    assert fonte("Fundo Especial de Financiamento de Campanha") == "fundo_especial"
    assert fonte("FUNDO PARTIDARIO") == "fundo_partidario"
    assert fonte("Fundo Partidário") == "fundo_partidario"
    assert fonte("OUTROS RECURSOS") == "outros"
    assert fonte(None) == "outros"
