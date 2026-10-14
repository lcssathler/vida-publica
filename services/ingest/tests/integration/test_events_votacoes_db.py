import random

import pytest

from vida_publica_ingest.adapters.postgres import rows_as_dicts
from vida_publica_ingest.events import votacoes
from vida_publica_ingest.events.engine import processar

pytestmark = pytest.mark.integration


def test_voto_nominal_e_contra_orientacao(ingest_conn):
    base = random.randint(10**8, 10**9 - 1)  # noqa: S311 - isola o teste
    votacao = f"{base}-1"
    ingest_conn.run(
        "INSERT INTO canon.camara_votacao (id, data, registrado_em, sigla_orgao, descricao,"
        " aprovacao, nominal, content_hash) VALUES (:id, '2026-08-12', '2026-08-12 18:30',"
        " 'PLEN', 'Aprovado o Projeto. Sim: 2; Não: 2.', true, true, :h)",
        id=votacao,
        h="0" * 64,
    )
    votos = [(base, "Não", "PL"), (base + 1, "Não", "PT"), (base + 2, "Sim", "PCdoB"),
             (base + 3, None, "PSD")]  # fmt: skip
    for id_camara, voto, partido in votos:
        ingest_conn.run(
            "INSERT INTO canon.camara_voto (votacao_id, id_camara, voto, sigla_partido, sigla_uf)"
            " VALUES (:v, :d, :voto, :p, 'SP')",
            v=votacao,
            d=id_camara,
            voto=voto,
            p=partido,
        )
    for bancada, orientacao, tipo in [("PL", "Sim", "P"), ("Fdr PT-PCdoB-PV", "Não", "B")]:
        ingest_conn.run(
            "INSERT INTO canon.camara_orientacao (votacao_id, sigla_bancada, orientacao,"
            " cod_tipo_lideranca) VALUES (:v, :b, :o, :t)",
            v=votacao,
            b=bancada,
            o=orientacao,
            t=tipo,
        )

    for numero, sigla in [(22, "PL"), (13, "PT"), (65, "PCDOB"), (55, "PSD")]:
        ingest_conn.run(
            "INSERT INTO canon.partido (numero_tse, sigla, sigla_normalizada, ultimo_ano)"
            " VALUES (:n, :s, :s, 2026) ON CONFLICT DO NOTHING",
            n=numero,
            s=sigla,
        )

    for gerador in votacoes.GERADORES:
        processar(ingest_conn, gerador)
    rows = rows_as_dicts(
        ingest_conn,
        "SELECT tipo, chave_fato, titulo, payload->>'voto' AS voto,"
        " (SELECT array_agg(alvo_id ORDER BY alvo_id) FROM feed.evento_alvo a"
        "  WHERE a.evento_id = e.id AND a.alvo_tipo = 'partido') AS partidos"
        " FROM feed.evento e WHERE chave_fato LIKE :chave ORDER BY chave_fato",
        chave=f"camara:{votacao}:%",
    )
    assert [(r["tipo"], r["voto"]) for r in rows] == [
        ("voto_contra_orientacao", "Não"),
        ("voto_nominal", "Não"),
        ("voto_contra_orientacao", "Sim"),
        ("voto_nominal", "secreto"),
    ]
    assert rows[0]["titulo"] == (
        f"Deputado {base} votou Não contra a orientação da bancada PL (Sim)"
    )
    assert rows[3]["titulo"] == f"Deputado {base + 3} votou em votação secreta"
    assert all(r["partidos"] for r in rows)

    for gerador in votacoes.GERADORES:
        stats = processar(ingest_conn, gerador)
        assert (stats.novos, stats.alterados, stats.arquivados) == (0, 0, 0)
