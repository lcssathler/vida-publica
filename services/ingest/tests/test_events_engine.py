from datetime import UTC, date, datetime
from decimal import Decimal

import pytest

from vida_publica_ingest.events.engine import (
    BRT,
    Alvo,
    Estado,
    Evento,
    Regra,
    decidir_alterado,
    decidir_novo,
    momento,
)

AGORA = datetime(2026, 10, 13, 12, tzinfo=UTC)
REGRA = Regra("teste", 1, "regra de teste")
REGRA_DINHEIRO = Regra("teste_dinheiro", 1, "dinheiro", {"revisao_acima_de": 500000})


def evento(**campos) -> Evento:
    base = {"chave": "1", "ocorrido_em": momento(date(2026, 10, 1)), "titulo": "Fato"}
    return Evento(**{**base, **campos})


def estado(**campos) -> Estado:
    base = {
        "id": "00000000-0000-0000-0000-000000000001",
        "chave_fato": "1",
        "regra_versao": 1,
        "status": "publicado",
        "motivo": None,
        "publicado_em": AGORA,
        "revisado_em": None,
        "valor": None,
        "content_hash": "0" * 64,
    }
    return Estado(**{**base, **campos})


def test_momento_usa_horario_de_brasilia():
    assert momento(date(2026, 10, 1)) == datetime(2026, 10, 1, 3, tzinfo=UTC)
    assert momento(datetime(2026, 10, 1, 14, 30)).tzinfo == BRT
    with pytest.raises(ValueError, match="fuso"):
        evento(ocorrido_em=datetime(2026, 10, 1))


def test_chave_dedup_inclui_tipo_e_versao():
    assert Regra("voto_nominal", 2, "x").chave_dedup("camara:123:204554") == (
        "voto_nominal:v2:camara:123:204554"
    )


def test_hash_estavel_e_sensivel_ao_conteudo():
    a = evento(alvos=(Alvo("pessoa", "p1"), Alvo("partido", "7")), payload={"v": Decimal("1.5")})
    b = evento(alvos=(Alvo("partido", "7"), Alvo("pessoa", "p1")), payload={"v": Decimal("1.5")})
    assert a.content_hash() == b.content_hash()
    assert a.content_hash() != evento(titulo="Outro").content_hash()
    with pytest.raises(ValueError):
        Alvo("cidade", "x")


def test_novo_publica_fora_da_carga_inicial():
    decisao = decidir_novo(REGRA, evento(), carga_inicial=False, anterior=None, agora=AGORA)
    assert (decisao.status, decisao.motivo, decisao.publicado_em) == ("publicado", None, AGORA)


def test_carga_inicial_segura_sem_publicar():
    decisao = decidir_novo(REGRA, evento(), carga_inicial=True, anterior=None, agora=AGORA)
    assert (decisao.status, decisao.motivo, decisao.publicado_em) == (
        "segurado",
        "carga_inicial",
        None,
    )


def test_dinheiro_acima_do_limite_segura_para_revisao_mesmo_na_carga_inicial():
    for carga in (True, False):
        decisao = decidir_novo(
            REGRA_DINHEIRO,
            evento(valor=Decimal("500000.01")),
            carga_inicial=carga,
            anterior=None,
            agora=AGORA,
        )
        assert (decisao.status, decisao.motivo) == ("segurado", "revisao_valor")
    no_limite = decidir_novo(
        REGRA_DINHEIRO, evento(valor=Decimal("500000")), carga_inicial=False, anterior=None,
        agora=AGORA,
    )  # fmt: skip
    assert no_limite.status == "publicado"


def test_versao_nova_herda_status_da_anterior():
    anterior = estado(regra_versao=1)
    regra_v2 = Regra("teste", 2, "regra de teste, versão 2")
    decisao = decidir_novo(regra_v2, evento(), carga_inicial=False, anterior=anterior, agora=AGORA)
    assert (decisao.status, decisao.publicado_em) == ("publicado", AGORA)
    segurada = decidir_novo(
        regra_v2, evento(), carga_inicial=False,
        anterior=estado(status="segurado", motivo="carga_inicial", publicado_em=None), agora=AGORA,
    )  # fmt: skip
    assert (segurada.status, segurada.motivo) == ("segurado", "carga_inicial")


def test_valor_revisado_nao_volta_para_revisao_se_nao_mudou():
    revisado = estado(revisado_em=AGORA, valor=Decimal("900000"))
    mesmo = decidir_alterado(
        REGRA_DINHEIRO, evento(valor=Decimal("900000"), titulo="novo"), revisado, agora=AGORA
    )
    assert mesmo.status == "publicado"
    outro = decidir_alterado(REGRA_DINHEIRO, evento(valor=Decimal("950000")), revisado, agora=AGORA)
    assert (outro.status, outro.motivo, outro.revisado_em) == ("segurado", "revisao_valor", None)


def test_valor_que_cai_abaixo_do_limite_e_publicado():
    segurado = estado(status="segurado", motivo="revisao_valor", publicado_em=None)
    decisao = decidir_alterado(
        REGRA_DINHEIRO, evento(valor=Decimal("10000")), segurado, agora=AGORA
    )
    assert (decisao.status, decisao.publicado_em) == ("publicado", AGORA)


def test_fato_que_volta_a_fonte_recupera_o_status():
    removido = estado(status="arquivado", motivo="fonte_removeu")
    assert decidir_alterado(REGRA, evento(), removido, agora=AGORA).status == "publicado"
    nunca_publicado = estado(status="arquivado", motivo="fonte_removeu", publicado_em=None)
    decisao = decidir_alterado(REGRA, evento(), nunca_publicado, agora=AGORA)
    assert (decisao.status, decisao.motivo) == ("segurado", "carga_inicial")
    pelo_admin = estado(status="arquivado", motivo="admin")
    assert decidir_alterado(REGRA, evento(), pelo_admin, agora=AGORA).status == "arquivado"
