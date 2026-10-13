import pytest

from vida_publica_ingest.identity import hash_cpf, normalize_name

KEY = "chave-de-teste"


def test_hash_ignora_pontuacao():
    assert hash_cpf("123.456.789-09", KEY) == hash_cpf("12345678909", KEY)


def test_hash_nao_contem_o_cpf():
    digest = hash_cpf("12345678909", KEY)
    assert digest is not None and len(digest) == 64
    assert "12345678909" not in digest


def test_hash_depende_da_chave():
    assert hash_cpf("12345678909", KEY) != hash_cpf("12345678909", "outra-chave")


@pytest.mark.parametrize("value", [None, "", "-4", "#NULO#", "123", "00000000000", "11111111111"])
def test_cpf_invalido_vira_none(value):
    assert hash_cpf(value, KEY) is None


def test_sem_chave_falha():
    with pytest.raises(ValueError, match="VP_CPF_HASH_KEY"):
        hash_cpf("12345678909", "")


def test_normaliza_nome_para_comparacao():
    assert normalize_name("  José  da Conceição ") == "JOSE DA CONCEICAO"
