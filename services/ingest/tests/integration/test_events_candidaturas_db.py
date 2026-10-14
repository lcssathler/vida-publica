import random
from dataclasses import replace
from datetime import date

import pytest

from tests.test_tse_candidaturas import ROWS
from vida_publica_ingest.adapters.postgres import rows_as_dicts
from vida_publica_ingest.canon.pessoas import PessoaRepository, resolve
from vida_publica_ingest.events import candidaturas
from vida_publica_ingest.events.engine import Gerador, processar
from vida_publica_ingest.sources.tse_candidaturas import TseCandidaturaRepository, parse_row

pytestmark = pytest.mark.integration


def test_troca_situacao_e_resultado(ingest_conn):
    sq = random.randint(10**8, 10**9 - 1)  # noqa: S311 - isola o teste
    [[pessoa]] = ingest_conn.run(
        "INSERT INTO canon.pessoa (nome_exibicao) VALUES (:n) RETURNING id::text", n=f"Pessoa {sq}"
    )
    # PT → sem partido → PT não é troca; PT → PSOL é
    for sigla, desde in [("PT", "2015-02-01"), ("S.PART.", "2019-03-01"), ("PT", "2019-09-01"),
                         ("PSOL", "2023-04-10")]:  # fmt: skip
        ingest_conn.run(
            "INSERT INTO canon.filiacao (pessoa_id, sigla, desde, fonte)"
            " VALUES (CAST(:p AS uuid), :s, CAST(:d AS date), 'camara')",
            p=pessoa,
            s=sigla,
            d=desde,
        )

    candidatura, _ = parse_row(ROWS[0])
    ano = random.randint(2100, 9999)  # noqa: S311
    candidatura = replace(candidatura, ano_eleicao=ano, sq_candidato=sq, cd_cargo=6,
                          ds_cargo="DEPUTADO FEDERAL", ds_sit_tot_turno="ELEITO POR QP",
                          dt_eleicao=date(ano, 10, 4), ds_situacao_candidatura="APTO")  # fmt: skip
    TseCandidaturaRepository(ingest_conn).upsert_many(
        [(candidatura, f"{sq:064x}", None)], raw_object_id=None
    )
    resolve(PessoaRepository(ingest_conn))

    geradores = [Gerador(g.regra, g.gerar) for g in candidaturas.GERADORES]
    for gerador in geradores:
        processar(ingest_conn, gerador)
    trocas = rows_as_dicts(
        ingest_conn,
        "SELECT titulo, payload->>'de' AS de, payload->>'para' AS para FROM feed.evento"
        " WHERE tipo = 'troca_partido' AND chave_fato LIKE :c",
        c=f"camara:{pessoa}:%",
    )
    assert [(t["de"], t["para"]) for t in trocas] == [("PT", "PSOL")]
    assert trocas[0]["titulo"].endswith(": muda do PT para o PSOL")

    rows = rows_as_dicts(
        ingest_conn,
        "SELECT tipo, titulo FROM feed.evento WHERE tipo IN ('situacao_candidatura', 'resultado')"
        " AND chave_fato LIKE :c ORDER BY tipo",
        c=f"{ano}:{sq}:%",
    )
    nome = candidatura.nm_urna_candidato
    uf, partido = candidatura.sg_uf, candidatura.sg_partido
    assert [(r["tipo"], r["titulo"]) for r in rows] == [
        ("resultado",
         f"{nome}: eleito por quociente partidário para Deputado Federal ({uf}) em {ano}"),
        ("situacao_candidatura",
         f"{nome}: candidatura a Deputado Federal ({uf}) pelo {partido} em {ano}, situação: apto"),
    ]  # fmt: skip

    for gerador in geradores:
        stats = processar(ingest_conn, gerador)
        assert (stats.novos, stats.alterados, stats.arquivados) == (0, 0, 0)
