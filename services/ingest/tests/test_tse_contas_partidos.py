import csv
import io
import zipfile
from datetime import date
from decimal import Decimal

from tests.test_tse_contas_candidatos import COMUM
from vida_publica_ingest.sources.tse_contas_partidos import (
    parse_despesa,
    parse_pagamento,
    parse_receita,
)

ORGAO = {
    "CD_ESFERA_PARTIDARIA": "F",
    "DS_ESFERA_PARTIDARIA": "Federal (Estadual/Distrital)",
    "SG_UF": "MG",
    "CD_MUNICIPIO": "-1",
    "NM_MUNICIPIO": "#NULO",
    "NR_CNPJ_PRESTADOR_CONTA": "98.765.432/0001-00",
    "NR_PARTIDO": "99",
    "SG_PARTIDO": "XYZ",
    "NM_PARTIDO": "PARTIDO EXEMPLO",
}


def receita(**overrides) -> dict:
    base = {
        **{
            k: v
            for k, v in COMUM.items()
            if k not in ("CD_ELEICAO", "DS_ELEICAO", "DT_ELEICAO", "ST_TURNO")
        },
        **ORGAO,
        "CD_FONTE_RECEITA": "1",
        "DS_FONTE_RECEITA": "Outros Recursos",
        "CD_ORIGEM_RECEITA": "10010200",
        "DS_ORIGEM_RECEITA": "Recursos de pessoas físicas",
        "CD_NATUREZA_RECEITA": "1",
        "DS_NATUREZA_RECEITA": "Financeiro",
        "CD_ESPECIE_RECEITA": "19",
        "DS_ESPECIE_RECEITA": "PIX",
        "CD_CNAE_DOADOR": "-1",
        "DS_CNAE_DOADOR": "#NULO",
        "NR_CPF_CNPJ_DOADOR": "123.456.789-00",
        "NM_DOADOR": "JOSÉ EXEMPLO",
        "NM_DOADOR_RFB": "JOSE EXEMPLO",
        "CD_ESFERA_PARTIDARIA_DOADOR": "-1",
        "DS_ESFERA_PARTIDARIA_DOADOR": "#NULO",
        "SG_UF_DOADOR": "#NULO#",
        "CD_MUNICIPIO_DOADOR": "-1",
        "NM_MUNICIPIO_DOADOR": "#NULO",
        "SQ_CANDIDATO_DOADOR": "-1",
        "NR_CANDIDATO_DOADOR": "-1",
        "CD_CARGO_CANDIDATO_DOADOR": "-1",
        "DS_CARGO_CANDIDATO_DOADOR": "#NULO",
        "NR_PARTIDO_DOADOR": "-1",
        "SG_PARTIDO_DOADOR": "#NULO",
        "NM_PARTIDO_DOADOR": "#NULO",
        "NR_RECIBO_DOACAO": "P99000400000MG000001A",
        "NR_DOCUMENTO_DOACAO": "290922435506901",
        "SQ_RECEITA": "48138471",
        "DT_RECEITA": "29/09/2026",
        "DS_RECEITA": "#NULO",
        "VR_RECEITA": "100,00",
    }
    return {**base, **overrides}


def despesa(**overrides) -> dict:
    base = {
        **{
            k: v
            for k, v in COMUM.items()
            if k not in ("CD_ELEICAO", "DS_ELEICAO", "DT_ELEICAO", "ST_TURNO")
        },
        **ORGAO,
        "SG_UE": "MG",
        "NM_UE": "MINAS GERAIS",
        "CD_TIPO_FORNECEDOR": "2",
        "DS_TIPO_FORNECEDOR": "PESSOA FÍSICA",
        "CD_CNAE_FORNECEDOR": "-1",
        "DS_CNAE_FORNECEDOR": "#NULO",
        "NR_CPF_CNPJ_FORNECEDOR": "12345678900",
        "NM_FORNECEDOR": "MARIA EXEMPLO",
        "NM_FORNECEDOR_RFB": "MARIA EXEMPLO",
        "CD_ESFERA_PART_FORNECEDOR": "-1",
        "DS_ESFERA_PART_FORNECEDOR": "#NULO",
        "SG_UF_FORNECEDOR": "MG",
        "CD_MUNICIPIO_FORNECEDOR": "-1",
        "NM_MUNICIPIO_FORNECEDOR": "#NULO",
        "SQ_CANDIDATO_FORNECEDOR": "990000000001",
        "NR_CANDIDATO_FORNECEDOR": "1234",
        "CD_CARGO_FORNECEDOR": "6",
        "DS_CARGO_FORNECEDOR": "Deputado Federal",
        "NR_PARTIDO_FORNECEDOR": "99",
        "SG_PARTIDO_FORNECEDOR": "XYZ",
        "NM_PARTIDO_FORNECEDOR": "PARTIDO EXEMPLO",
        "DS_TIPO_DOCUMENTO": "#NULO",
        "NR_DOCUMENTO": "550284000046250",
        "CD_ORIGEM_DESPESA": "20240000",
        "DS_ORIGEM_DESPESA": "Doações financeiras a outros candidatos/partidos",
        "SQ_DESPESA": "77908040",
        "DT_DESPESA": "24/08/2026",
        "DS_DESPESA": "#NULO",
        "VR_DESPESA_CONTRATADA": "25000,00",
    }
    return {**base, **overrides}


def pagamento(**overrides) -> dict:
    base = {
        **{
            k: v
            for k, v in COMUM.items()
            if k not in ("CD_ELEICAO", "DS_ELEICAO", "DT_ELEICAO", "ST_TURNO")
        },
        "DS_TIPO_DOCUMENTO": "#NULO",
        "NR_DOCUMENTO": "550284000046250",
        "CD_FONTE_DESPESA": "2",
        "DS_FONTE_DESPESA": "Fundo Especial de Financiamento de Campanha",
        "CD_ORIGEM_DESPESA": "20240000",
        "DS_ORIGEM_DESPESA": "Doações financeiras a outros candidatos/partidos",
        "CD_NATUREZA_DESPESA": "1",
        "DS_NATUREZA_DESPESA": "Financeiro",
        "CD_ESPECIE_RECURSO": "1",
        "DS_ESPECIE_RECURSO": "Transferência eletrônica",
        "SQ_DESPESA": "77908040",
        "SQ_PARCELAMENTO_DESPESA": "59162970",
        "DT_PAGTO_DESPESA": "24/08/2026",
        "DS_DESPESA": "#NULO",
        "VR_PAGTO_DESPESA": "25000,00",
    }
    return {**base, **overrides}


def make_zip(ano: int, receitas, originarios, despesas, pagamentos) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, rows in (
            (f"receitas_orgaos_partidarios_{ano}_BRASIL.csv", receitas),
            (f"receitas_orgaos_partidarios_doador_originario_{ano}_BRASIL.csv", originarios),
            (f"despesas_contratadas_orgaos_partidarios_{ano}_BRASIL.csv", despesas),
            (f"despesas_pagas_orgaos_partidarios_{ano}_BRASIL.csv", pagamentos),
        ):
            text = io.StringIO()
            writer = csv.DictWriter(
                text, fieldnames=list(rows[0]), delimiter=";", quoting=csv.QUOTE_ALL
            )
            writer.writeheader()
            writer.writerows(rows)
            archive.writestr(name, text.getvalue().encode("latin-1"))
    return buffer.getvalue()


def test_parse_receita_de_orgao():
    values, cpf = parse_receita(receita())
    assert cpf == "12345678900" and values["doador_cnpj"] is None
    assert (values["esfera"], values["sg_uf"], values["cnpj_prestador"]) == (
        "F",
        "MG",
        "98765432000100",
    )
    assert values["cd_municipio"] is None and values["doador_sq_candidato"] is None
    assert values["valor"] == Decimal("100.00") and values["data"] == date(2026, 9, 29)


def test_parse_despesa_repasse_a_candidato():
    values, cpf = parse_despesa(despesa())
    assert cpf == "12345678900"
    assert values["fornecedor_sq_candidato"] == 990000000001
    assert values["fornecedor_cargo"] == "Deputado Federal"
    assert values["ds_origem"].startswith("Doações financeiras") and values["valor"] == Decimal(
        "25000.00"
    )


def test_parse_pagamento_com_fonte():
    values, cpf = parse_pagamento(pagamento())
    assert cpf is None
    assert (values["ds_fonte"], values["sq_despesa"], values["sq_parcelamento"]) == (
        "Fundo Especial de Financiamento de Campanha",
        77908040,
        59162970,
    )
    assert values["data"] == date(2026, 8, 24) and values["valor"] == Decimal("25000.00")
