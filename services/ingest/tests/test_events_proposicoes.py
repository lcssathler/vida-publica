from datetime import date

from vida_publica_ingest.events.proposicoes import classificar, paradas, urgencia


def test_etapas_da_camara():
    assert classificar("camara", "100", None, "Apresentação de Proposição", None) == "apresentacao"
    assert classificar("camara", "110", None, "Distribuição", "Às Comissões de Saúde") == (
        "envio_comissoes"
    )
    # distribuição por apensação não é envio às comissões
    assert classificar("camara", "110", None, "Distribuição", "Apensação da proposição") is None
    assert classificar("camara", "320", None, "Designação de Relator(a)", None) == "relator"
    assert classificar("camara", "1235", None, "Aprovação de Proposição (Plenário)", None) == (
        "votacao_plenario"
    )
    remessa_sancao = "Remessa dos Autógrafos à sanção por meio da Mensagem"
    assert classificar("camara", "190", None, "Expedição", remessa_sancao) == "sancao"
    remessa_senado = "Remessa ao Senado Federal por meio do Of. nº 149"
    assert classificar("camara", "180", None, "Encaminhamento", remessa_senado) == (
        "envio_outra_casa"
    )
    assert classificar("camara", "1012", None, "Norma Jurídica com Veto Parcial", None) == "veto"
    assert classificar("camara", "640", None, "Desarquivamento a Pedido", None) == (
        "desarquivamento"
    )
    assert classificar("camara", "604", None, "Publicação de Proposição", None) is None
    assert classificar("camara", "250", None, "Retirada de Pauta", None) is None


def test_etapas_do_senado():
    distribuido = "Distribuído ao Senador Fulano, para emitir relatório."
    assert classificar("senado", None, "RELATOR", distribuido, None) == "relator"
    assert classificar("senado", None, "APRVPAR", "A Comissão aprova o relatório", None) == (
        "parecer"
    )
    vai = "A  matéria vai à Comissão de Educação."
    assert classificar("senado", None, "MATDESP", vai, None) == "envio_comissoes"
    plenario = "(Sessão Deliberativa Ordinária de 9 de junho) Aprovado o projeto."
    assert classificar("senado", None, "APRVD", plenario, None) == "votacao_plenario"
    # aprovação terminativa em comissão, sem Plenário
    assert classificar("senado", None, "APRVD", "Encerrou-se o prazo para recurso", None) is None
    assert classificar("senado", None, "TNJR", "PROMULGADA. LEI Nº 1", None) == "promulgacao"
    assert classificar("senado", None, "TNJR", "SANCIONADA. LEI Nº 2", None) == "sancao"
    assert classificar("senado", None, "TNJRVETO", "SANCIONADA. LEI 3 (vetada)", None) == "veto"
    oficio = "Remetido Ofício SF nº 1, ao Primeiro-Secretário da Câmara dos Deputados"
    assert classificar("senado", None, None, oficio, None) == "envio_outra_casa"
    assert classificar("senado", None, "INPAUTA", "Matéria constante da Pauta", None) is None


def test_urgencia():
    assert urgencia("camara", "196", "Aprovação de Urgência")
    assert not urgencia("camara", "194", "Apresentação de Requerimento")
    assert urgencia("senado", None, "Aprovado o Requerimento nº 5, de urgência para a matéria")
    assert not urgencia("senado", None, "Apresentado requerimento (Urgência para matéria)")


def test_proposta_parada_180_dias():
    hoje = date(2026, 10, 14)
    datas = [
        (date(2024, 1, 10), "apresentacao"),
        (date(2024, 7, 8), None),  # 180 dias depois: conta
        (date(2024, 12, 1), "relator"),  # 146 dias: não conta
        (date(2026, 1, 5), "arquivamento"),
    ]
    assert paradas(datas, hoje=hoje, tramitando=None) == [
        (date(2024, 1, 10), date(2024, 7, 8)),
        (date(2024, 12, 1), date(2026, 1, 5)),
    ]
    # intervalo em aberto: só se ainda tramita e não terminou
    aberta = [(date(2026, 1, 5), "parecer")]
    assert paradas(aberta, hoje=hoje, tramitando=None) == [(date(2026, 1, 5), None)]
    assert paradas(aberta, hoje=hoje, tramitando=False) == []
    assert paradas([(date(2026, 1, 5), "arquivamento")], hoje=hoje, tramitando=None) == []
    assert paradas([(date(2026, 5, 1), None)], hoje=hoje, tramitando=True) == []
