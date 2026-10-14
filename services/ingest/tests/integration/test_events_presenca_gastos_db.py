import random
from datetime import date

import pytest

from vida_publica_ingest.adapters.postgres import rows_as_dicts
from vida_publica_ingest.events import presenca_gastos
from vida_publica_ingest.events.engine import Gerador, processar

pytestmark = pytest.mark.integration


def _eventos(conn, padrao: str) -> list[dict]:
    return rows_as_dicts(
        conn,
        "SELECT tipo, chave_fato, titulo, payload FROM feed.evento WHERE chave_fato LIKE :p"
        " AND tipo IN ('presenca', 'ausencia', 'despesa_mensal') ORDER BY tipo, chave_fato",
        p=padrao,
    )


def test_presenca_ausencia_e_despesas(ingest_conn):
    base = random.randint(10**8, 10**9 - 1)  # noqa: S311 - isola o teste
    h = "0" * 64
    # Senado: uma sessão com duas votações; um senador vota, outro está de licença
    for votacao in (base, base + 1):
        ingest_conn.run(
            "INSERT INTO canon.senado_votacao (codigo_sessao_votacao, codigo_sessao, data_sessao,"
            " content_hash) VALUES (:v, :s, '2026-05-20', :h)",
            v=votacao,
            s=base,
            h=h,
        )
        for parlamentar, voto, descricao in [
            (base, "Sim", None),
            (base + 1, "LS", "Licença saúde"),
        ]:
            ingest_conn.run(
                "INSERT INTO canon.senado_voto (codigo_sessao_votacao, codigo_parlamentar,"
                " sigla_voto, descricao_voto, sigla_partido) VALUES (:v, :p, :sv, :d, 'PT')",
                v=votacao,
                p=parlamentar,
                sv=voto,
                d=descricao,
            )
    # Câmara: frequência oficial do dia com ausência justificada
    ingest_conn.run(
        "INSERT INTO canon.camara_presenca_dia (data, id_camara, frequencia, justificativa)"
        " VALUES ('2099-08-11', :d, 'Ausência justificada', 'Missão oficial')",
        d=base,
    )
    # cota: duas despesas no mês e uma removida pela fonte
    for sufixo, valor, removida in [("a", "1000.50", False), ("b", "200.00", False),
                                    ("c", "999.00", True)]:  # fmt: skip
        ingest_conn.run(
            "INSERT INTO canon.camara_despesa (id, ano, mes, id_camara, nome_parlamentar,"
            " num_subcota, descricao, valor_liquido, removido_em) VALUES"
            " (:id, 2026, 6, :d, 'Fulana', 1, 'COMBUSTÍVEIS E LUBRIFICANTES.',"
            " CAST(:v AS numeric), CASE WHEN :r THEN now() END)",
            id=f"{base:064d}"[:63] + sufixo,
            d=base,
            v=valor,
            r=removida,
        )

    despesas = Gerador(
        presenca_gastos.REGRA_DESPESA,
        lambda conn: presenca_gastos.gerar_despesas(conn, hoje=date(2026, 10, 14)),
    )
    for gerador in [*presenca_gastos.GERADORES[:2], despesas]:
        processar(ingest_conn, gerador)

    senado = _eventos(ingest_conn, f"senado:{base}:%")
    assert [(e["tipo"], e["chave_fato"]) for e in senado] == [
        ("ausencia", f"senado:{base}:{base + 1}"),
        ("presenca", f"senado:{base}:{base}"),
    ]
    assert senado[0]["payload"]["motivo"] == "Licença saúde"

    [ausencia] = _eventos(ingest_conn, f"camara:2099-08-11:{base}")
    assert ausencia["titulo"].endswith("(ausência justificada)")

    [despesa] = _eventos(ingest_conn, f"camara:{base}:2026-06")
    assert despesa["titulo"] == "Fulana: R$ 1.200,50 em despesas da cota em junho de 2026"
    assert despesa["payload"]["incompleto"] is False
    assert despesa["payload"]["documentos"] == 2

    for gerador in [*presenca_gastos.GERADORES[:2], despesas]:
        stats = processar(ingest_conn, gerador)
        assert (stats.novos, stats.alterados, stats.arquivados) == (0, 0, 0)
