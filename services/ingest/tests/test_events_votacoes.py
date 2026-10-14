from vida_publica_ingest.events.comum import normalizar_sigla, resumir
from vida_publica_ingest.events.votacoes import Orientacao, contra, orientacao_do_partido

ORIENTACOES = [
    {"sigla_bancada": "PL", "orientacao": "Sim", "cod_tipo_lideranca": "P"},
    {"sigla_bancada": "Fdr PT-PCdoB-PV", "orientacao": "Não", "cod_tipo_lideranca": "B"},
    {"sigla_bancada": "PT", "orientacao": "Liberado", "cod_tipo_lideranca": "P"},
    {"sigla_bancada": "Bl UniPpPsd...", "orientacao": "Sim", "cod_tipo_lideranca": "B"},
    {"sigla_bancada": "Governo", "orientacao": "Não", "cod_tipo_lideranca": "B"},
]


def test_orientacao_do_proprio_partido_antes_da_federacao():
    assert orientacao_do_partido("PL", ORIENTACOES) == Orientacao("PL", "Sim")
    assert orientacao_do_partido("PT", ORIENTACOES) == Orientacao("PT", "Liberado")
    assert orientacao_do_partido("PCdoB", ORIENTACOES) == Orientacao("Fdr PT-PCdoB-PV", "Não")
    # bloco com nome truncado e governo não contam
    assert orientacao_do_partido("UNIÃO", ORIENTACOES) is None
    assert orientacao_do_partido(None, ORIENTACOES) is None


def test_voto_contra_so_com_orientacao_sim_ou_nao():
    assert contra("Não", Orientacao("PL", "Sim"))
    assert contra("Abstenção", Orientacao("PL", "Sim"))
    assert not contra("Sim", Orientacao("PL", "Sim"))
    assert not contra("Não", Orientacao("PT", "Liberado"))
    assert not contra(None, Orientacao("PL", "Sim"))  # votação secreta
    assert not contra("Artigo 17", Orientacao("PL", "Sim"))
    assert not contra("Não", None)


def test_sigla_normalizada_e_resumo():
    assert normalizar_sigla("União") == "UNIAO"
    assert normalizar_sigla("PODEMOS") == "PODE"
    assert normalizar_sigla("PCdoB") == "PCDOB"
    assert resumir("  texto\r\n com   quebras ") == "texto com quebras"
    assert resumir("palavra " * 100, limite=20) == "palavra palavra…"
    assert resumir("") is None
