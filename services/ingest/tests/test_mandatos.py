from datetime import date, datetime

from vida_publica_ingest.canon.mandatos import Periodo, periodos_de_filiacao
from vida_publica_ingest.sources.camara_historico import parse_historico


def _item(data_hora, sigla, situacao="Exercício", leg=57, descricao="Alteração de partido"):
    return {
        "id": 900001,
        "dataHora": data_hora,
        "idLegislatura": leg,
        "siglaPartido": sigla,
        "siglaUf": "MG",
        "situacao": situacao,
        "condicaoEleitoral": "Titular",
        "descricaoStatus": descricao,
    }


def test_historico_descarta_marcadores_sem_situacao():
    payload = {
        "dados": [
            _item("2023-02-01T00:00", "XYZ", situacao=None, leg=58, descricao="Nome no início"),
            _item("2023-02-01T12:05", "XYZ", descricao="Entrada - Posse de Eleito Titular"),
        ]
    }
    eventos = parse_historico(payload)
    assert len(eventos) == 1
    assert eventos[0].data_hora == datetime(2023, 2, 1, 12, 5)
    assert eventos[0].descricao_status.startswith("Entrada")


def test_periodos_agrupam_trocas_de_partido():
    eventos = [
        (datetime(2019, 2, 1, 11, 45), "DEM"),
        (datetime(2022, 2, 23), "UNIÃO"),
        (datetime(2023, 2, 1, 12, 5), "UNIAO"),  # mesma sigla, grafia diferente
        (datetime(2026, 3, 9, 17, 24), "MISSÃO"),
    ]
    assert periodos_de_filiacao(eventos) == [
        Periodo("DEM", date(2019, 2, 1), date(2022, 2, 22)),
        Periodo("UNIÃO", date(2022, 2, 23), date(2026, 3, 8)),
        Periodo("MISSÃO", date(2026, 3, 9), None),
    ]


def test_troca_no_mesmo_dia_nao_gera_periodo_invertido():
    eventos = [(datetime(2024, 4, 5, 9), "ABC"), (datetime(2024, 4, 5, 18), "XYZ")]
    primeiro, segundo = periodos_de_filiacao(eventos)
    assert primeiro.ate == primeiro.desde == date(2024, 4, 5)
    assert segundo.ate is None


def test_siglas_equivalentes_e_sem_partido():
    from vida_publica_ingest.canon.mandatos import sigla_canonica

    assert sigla_canonica("PATRI") == "PATRIOTA"
    assert sigla_canonica("SDD") == sigla_canonica("Solidariedade") == "SOLIDARIEDADE"
    assert sigla_canonica("PCdoB") == "PCDOB"
    assert sigla_canonica("S.PART.") is None
