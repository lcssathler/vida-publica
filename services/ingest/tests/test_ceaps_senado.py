from datetime import date
from decimal import Decimal

from vida_publica_ingest.sources.ceaps_senado import Senadores, parse_row, read_csv, row_key

CSV = (
    '"ULTIMA ATUALIZACAO";"13/10/2026 02:03"\r\n'
    '"ANO";"MES";"SENADOR";"TIPO_DESPESA";"CNPJ_CPF";"FORNECEDOR";"DOCUMENTO";"DATA";'
    '"DETALHAMENTO";"VALOR_REEMBOLSADO";"COD_DOCUMENTO"\r\n'
    '"2026";"1";"JOANA EXEMPLO";"Aluguel de imóveis para escritório político";"12.345.678/0001-90";'
    '"IMOBILIÁRIA EXEMPLO";"946049";"20/01/2026";"";"1.462,18";"2279778"\r\n'
    '"2026";"2";"JOANA EXEMPLO";"Divulgação da atividade parlamentar";"123.456.789-00";'
    '"JOSÉ EXEMPLO";"77";"05/02/2026";"Produção de vídeo";"300,00";"2279779"\r\n'
).encode("latin-1")


def test_read_csv_pula_a_linha_de_atualizacao():
    rows = list(read_csv(CSV))
    assert len(rows) == 2 and rows[0]["SENADOR"] == "JOANA EXEMPLO"


def test_parse_row_pj_e_pf():
    pj, pf = list(read_csv(CSV))
    values, cpf = parse_row(pj, codigo_senado=990001)
    assert values["fornecedor_cnpj"] == "12345678000190" and cpf is None
    assert values["valor"] == Decimal("1462.18") and values["data"] == date(2026, 1, 20)
    assert (values["ano"], values["mes"], values["cod_documento"]) == (2026, 1, 2279778)
    values, cpf = parse_row(pf, codigo_senado=None)
    assert cpf == "12345678900" and values["fornecedor_cnpj"] is None
    assert values["codigo_senado"] is None and values["detalhamento"] == "Produção de vídeo"
    assert "CNPJ_CPF" not in values and all("cpf" not in k for k in values)


def test_row_key_cobre_todos_os_campos():
    pj, pf = list(read_csv(CSV))
    assert row_key(pj) != row_key(pf)
    assert row_key(pj) == row_key(dict(pj))


def test_senadores_casam_por_nome_parlamentar_completo_ou_prefixo():
    senadores = Senadores(
        [
            ("Weverton", "Weverton Rocha Marques de Sousa", 1),
            ("Joana Exemplo", "Joana Exemplo de Souza", 2),
            ("Ana", "Ana Silva", 3),
            ("Ana", "Ana Souza", 4),
        ]
    )
    assert senadores.codigo("JOANA EXEMPLO") == 2
    assert senadores.codigo("Joana Exemplo de Souza") == 2
    assert senadores.codigo("WEVERTON ROCHA") == 1
    assert senadores.codigo("ANA") == 3  # nome parlamentar: o primeiro listado
    assert senadores.codigo("ANA S") is None  # prefixo ambíguo
    assert senadores.codigo("") is None
