import random

import pytest

from vida_publica_ingest.adapters.postgres import rows_as_dicts
from vida_publica_ingest.events import proposicoes
from vida_publica_ingest.events.engine import processar

pytestmark = pytest.mark.integration

TRAMITACOES = [
    ("1", "2024-01-10 10:00", "100", "Apresentação de Proposição", None),
    ("2", "2024-01-10 11:00", "604", "Publicação de Proposição", None),
    ("3", "2024-09-01 10:00", "320", "Designação de Relator(a)", None),
    ("4", "2024-09-02 10:00", "196", "Aprovação de Urgência (154, 155 ou 64 CF)", None),
    ("5", "2024-09-02 10:05", "196", "Aprovação de Urgência (154, 155 ou 64 CF)",
     "Alteração do Regime de Tramitação"),
    ("6", "2024-09-03 10:00", "502", "Arquivamento", "Arquivada."),
]  # fmt: skip


def test_tramitacao_pauta_regime_e_parada(ingest_conn):
    base = random.randint(10**8, 10**9 - 1)  # noqa: S311 - isola o teste
    ident = f"PL {base}/2024"
    [[prop]] = ingest_conn.run(
        "INSERT INTO canon.proposicao (casa, id_fonte, sigla_tipo, numero, ano, identificacao,"
        " ementa, content_hash) VALUES ('camara', :id, 'PL', 1, 2024, :ident, 'Ementa.', :h)"
        " RETURNING id::text",
        id=str(base),
        ident=ident,
        h="0" * 64,
    )
    for id_fonte, data_hora, cod, descricao, despacho in TRAMITACOES:
        ingest_conn.run(
            "INSERT INTO canon.proposicao_tramitacao (proposicao_id, id_fonte, sequencia,"
            " data_hora, descricao, cod_tipo, despacho) VALUES (CAST(:p AS uuid), :i, :seq,"
            " CAST(:d AS timestamp), :desc, :cod, :desp)",
            p=prop,
            i=id_fonte,
            seq=int(id_fonte),
            d=data_hora,
            desc=descricao,
            cod=cod,
            desp=despacho,
        )
    # duas sessões com o parecer da proposição na pauta; a segunda foi cancelada
    for evento, inicio, situacao in [
        (base, "2024-09-02 14:00", "Encerrada"),
        (base + 1, "2024-09-09 14:00", "Cancelada"),
    ]:
        ingest_conn.run(
            "INSERT INTO canon.camara_evento (id, inicio, situacao, sigla_orgao, deliberativo,"
            " content_hash) VALUES (:e, CAST(:i AS timestamp), :s, 'PLEN', true, :h)",
            e=evento,
            i=inicio,
            s=situacao,
            h="0" * 64,
        )
        ingest_conn.run(
            "INSERT INTO canon.camara_pauta_item (id_evento, posicao, titulo, proposicao_id,"
            " proposicao_relacionada_id) VALUES (:e, 1, :t, :parecer, :principal)",
            e=evento,
            t=ident,
            parecer=base + 7,
            principal=base,
        )

    for gerador in proposicoes.GERADORES:
        processar(ingest_conn, gerador)
    rows = rows_as_dicts(
        ingest_conn,
        "SELECT tipo, chave_fato, titulo FROM feed.evento e WHERE EXISTS (SELECT 1 FROM"
        " feed.evento_alvo a WHERE a.evento_id = e.id AND a.alvo_tipo = 'proposicao'"
        " AND a.alvo_id = :p) ORDER BY tipo, chave_fato",
        p=prop,
    )
    assert [(r["tipo"], r["titulo"]) for r in rows] == [
        ("mudanca_regime", f"{ident}: passa a tramitar em regime de urgência"),
        ("pauta", f"{ident} na pauta do Plenário da Câmara em 02/09/2024"),
        ("proposta_parada", f"{ident}: 180 dias sem tramitação"),
        ("tramitacao", f"{ident}: apresentada"),
        ("tramitacao", f"{ident}: relator designado"),
        ("tramitacao", f"{ident}: arquivada"),
    ]
    assert rows[2]["chave_fato"] == f"camara:{base}:2024-01-10"

    for gerador in proposicoes.GERADORES:
        stats = processar(ingest_conn, gerador)
        assert (stats.novos, stats.alterados, stats.arquivados) == (0, 0, 0)
