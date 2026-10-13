import csv
import io
import zipfile
from datetime import date
from decimal import Decimal

from vida_publica_ingest.sources.tse_contas_candidatos import (
    parse_despesa,
    parse_doador_originario,
    parse_receita,
    read_member,
    row_key,
)

COMUM = {
    "DT_GERACAO": "13/10/2026",
    "HH_GERACAO": "04:08:17",
    "AA_ELEICAO": "2026",
    "CD_TIPO_ELEICAO": "2",
    "NM_TIPO_ELEICAO": "Ordinária",
    "CD_ELEICAO": "6259",
    "DS_ELEICAO": "Eleições Gerais Estaduais 2026",
    "DT_ELEICAO": "04/10/2026",
    "ST_TURNO": "1",
    "TP_PRESTACAO_CONTAS": "Parcial",
    "DT_PRESTACAO_CONTAS": "10/09/2026",
    "SQ_PRESTADOR_CONTAS": "6800000001",
    "SG_UF": "MG",
}
CANDIDATO = {
    "SG_UE": "MG",
    "NM_UE": "MINAS GERAIS",
    "NR_CNPJ_PRESTADOR_CONTA": "12345678000190",
    "CD_CARGO": "6",
    "DS_CARGO": "Deputado Federal",
    "SQ_CANDIDATO": "990000000001",
    "NR_CANDIDATO": "1234",
    "NM_CANDIDATO": "MARIA EXEMPLO",
    "NR_CPF_CANDIDATO": "12345678900",
    "NR_CPF_VICE_CANDIDATO": "#NULO#",
    "NR_PARTIDO": "99",
    "SG_PARTIDO": "XYZ",
    "NM_PARTIDO": "PARTIDO EXEMPLO",
}


def receita(**overrides) -> dict:
    base = {
        **COMUM,
        **CANDIDATO,
        "CD_FONTE_RECEITA": "2",
        "DS_FONTE_RECEITA": "FUNDO ESPECIAL",
        "CD_ORIGEM_RECEITA": "10020000",
        "DS_ORIGEM_RECEITA": "Recursos de partido político",
        "CD_NATUREZA_RECEITA": "1",
        "DS_NATUREZA_RECEITA": "Financeiro",
        "CD_ESPECIE_RECEITA": "1",
        "DS_ESPECIE_RECEITA": "Transferência eletrônica",
        "CD_CNAE_DOADOR": "94928",
        "DS_CNAE_DOADOR": "Atividades de organizações políticas",
        "NR_CPF_CNPJ_DOADOR": "98765432000100",
        "NM_DOADOR": "Direção Estadual - XYZ - MG",
        "NM_DOADOR_RFB": "PARTIDO EXEMPLO - MINAS GERAIS",
        "CD_ESFERA_PARTIDARIA_DOADOR": "F",
        "DS_ESFERA_PARTIDARIA_DOADOR": "Federal (Estadual/Distrital)",
        "SG_UF_DOADOR": "MG",
        "CD_MUNICIPIO_DOADOR": "-1",
        "NM_MUNICIPIO_DOADOR": "#NULO",
        "SQ_CANDIDATO_DOADOR": "-1",
        "NR_CANDIDATO_DOADOR": "-1",
        "CD_CARGO_CANDIDATO_DOADOR": "-1",
        "DS_CARGO_CANDIDATO_DOADOR": "#NULO",
        "NR_PARTIDO_DOADOR": "99",
        "SG_PARTIDO_DOADOR": "XYZ",
        "NM_PARTIDO_DOADOR": "PARTIDO EXEMPLO",
        "NR_RECIBO_DOACAO": "099000600000MG000001E",
        "NR_DOCUMENTO_DOACAO": "#NULO#",
        "SQ_RECEITA": "48000001",
        "DT_RECEITA": "23/09/2026",
        "DS_RECEITA": "Repasse",
        "VR_RECEITA": "150000,00",
        "DS_NATUREZA_RECURSO_ESTIMAVEL": "#NULO",
        "DS_GENERO": "Feminino",
        "DS_COR_RACA": "Parda",
    }
    return {**base, **overrides}


def doador_originario(**overrides) -> dict:
    base = {
        **COMUM,
        "NR_CPF_CNPJ_DOADOR_ORIGINARIO": "123.456.789-00",
        "NM_DOADOR_ORIGINARIO": "José Exemplo",
        "NM_DOADOR_ORIGINARIO_RFB": "JOSE EXEMPLO",
        "TP_DOADOR_ORIGINARIO": "F",
        "CD_CNAE_DOADOR_ORIGINARIO": "-1",
        "DS_CNAE_DOADOR_ORIGINARIO": "#NULO",
        "SQ_RECEITA": "48000001",
        "DT_RECEITA": "14/07/2026",
        "DS_RECEITA": "Importação FCC",
        "VR_RECEITA": "10,00",
    }
    return {**base, **overrides}


def despesa(**overrides) -> dict:
    base = {
        **COMUM,
        **CANDIDATO,
        "CD_TIPO_FORNECEDOR": "2",
        "DS_TIPO_FORNECEDOR": "PESSOA FÍSICA",
        "CD_CNAE_FORNECEDOR": "-1",
        "DS_CNAE_FORNECEDOR": "#NULO",
        "NR_CPF_CNPJ_FORNECEDOR": "12345678900",
        "NM_FORNECEDOR": "CARLOS EXEMPLO",
        "NM_FORNECEDOR_RFB": "CARLOS EXEMPLO",
        "CD_ESFERA_PART_FORNECEDOR": "-1",
        "DS_ESFERA_PART_FORNECEDOR": "#NULO",
        "SG_UF_FORNECEDOR": "#NULO#",
        "CD_MUNICIPIO_FORNECEDOR": "-1",
        "NM_MUNICIPIO_FORNECEDOR": "#NULO",
        "SQ_CANDIDATO_FORNECEDOR": "-1",
        "NR_CANDIDATO_FORNECEDOR": "-1",
        "CD_CARGO_FORNECEDOR": "-1",
        "DS_CARGO_FORNECEDOR": "#NULO",
        "NR_PARTIDO_FORNECEDOR": "-1",
        "SG_PARTIDO_FORNECEDOR": "#NULO",
        "NM_PARTIDO_FORNECEDOR": "#NULO",
        "DS_TIPO_DOCUMENTO": "Recibo",
        "NR_DOCUMENTO": "7",
        "CD_ORIGEM_DESPESA": "20140000",
        "DS_ORIGEM_DESPESA": "Despesas com pessoal",
        "SQ_DESPESA": "73000001",
        "DT_DESPESA": "09/09/2026",
        "DS_DESPESA": "Coordenação de campanha",
        "VR_DESPESA_CONTRATADA": "3700,00",
    }
    return {**base, **overrides}


def make_zip(
    ano: int, receitas: list[dict], originarios: list[dict], despesas: list[dict]
) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, rows in (
            (f"receitas_candidatos_{ano}_BRASIL.csv", receitas),
            (f"receitas_candidatos_doador_originario_{ano}_BRASIL.csv", originarios),
            (f"despesas_contratadas_candidatos_{ano}_BRASIL.csv", despesas),
        ):
            text = io.StringIO()
            writer = csv.DictWriter(
                text, fieldnames=list(rows[0]), delimiter=";", quoting=csv.QUOTE_ALL
            )
            writer.writeheader()
            writer.writerows(rows)
            archive.writestr(name, text.getvalue().encode("latin-1"))
    return buffer.getvalue()


def test_parse_receita_de_partido():
    values, cpf = parse_receita(receita())
    assert cpf is None
    assert (values["ano_eleicao"], values["sq_candidato"], values["cd_cargo"]) == (
        2026,
        990000000001,
        6,
    )
    assert values["doador_cnpj"] == "98765432000100" and values["doador_esfera"] == "F"
    assert values["ds_fonte"] == "FUNDO ESPECIAL" and values["valor"] == Decimal("150000.00")
    assert values["data"] == date(2026, 9, 23)
    assert values["doador_sq_candidato"] is None and values["doador_municipio"] is None
    assert not any("cpf" in k for k in values)


def test_parse_receita_de_pessoa_fisica_devolve_cpf_em_claro():
    values, cpf = parse_receita(
        receita(
            NR_CPF_CNPJ_DOADOR="123.456.789-00", DS_ORIGEM_RECEITA="Recursos de pessoas físicas"
        )
    )
    assert cpf == "12345678900" and values["doador_cnpj"] is None


def test_parse_doador_originario_e_despesa():
    values, cpf = parse_doador_originario(doador_originario())
    assert cpf == "12345678900" and values["tipo"] == "F"
    assert (values["sq_prestador"], values["sq_receita"], values["valor"]) == (
        6800000001,
        48000001,
        Decimal("10.00"),
    )
    values, cpf = parse_despesa(despesa())
    assert cpf == "12345678900" and values["fornecedor_cnpj"] is None
    assert values["fornecedor_sq_candidato"] is None and values["sq_despesa"] == 73000001
    assert values["valor"] == Decimal("3700.00") and values["data"] == date(2026, 9, 9)


def test_row_key_ignora_a_data_de_geracao():
    assert row_key(receita()) == row_key(receita(DT_GERACAO="14/10/2026", HH_GERACAO="01:00:00"))
    assert row_key(receita()) != row_key(receita(VR_RECEITA="1,00"))


def test_read_member_do_zip():
    content = make_zip(2026, [receita()], [doador_originario()], [despesa()])
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        rows = list(read_member(archive, "receitas_candidatos_2026_BRASIL.csv"))
    assert len(rows) == 1 and rows[0]["NM_CANDIDATO"] == "MARIA EXEMPLO"
