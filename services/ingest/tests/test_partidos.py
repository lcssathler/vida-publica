from vida_publica_ingest.sources.partidos import (
    SUCESSOES_CURADAS,
    aggregate,
    infer_renames,
    normalize_sigla,
)


def _rows(*items):
    return [
        {"nr_partido": n, "sg_partido": s, "nm_partido": f"PARTIDO {s}", "ano": a}
        for n, s, a in items
    ]


def test_normaliza_grafias_da_mesma_sigla():
    assert normalize_sigla("PC do B") == normalize_sigla("PCdoB") == "PCDOB"
    assert normalize_sigla("UNIÃO") == "UNIAO"


def test_aggregate_junta_grafias_e_anos():
    partidos = aggregate(_rows((65, "PC do B", 2018), (65, "PCDOB", 2026), (13, "PT", 2022)))
    assert set(partidos) == {(65, "PCDOB"), (13, "PT")}
    pcdob = partidos[(65, "PCDOB")]
    assert (pcdob.primeiro_ano, pcdob.ultimo_ano, pcdob.sigla) == (2018, 2026, "PCDOB")


def test_infere_renomeacao_com_mesmo_numero():
    partidos = aggregate(
        _rows(
            (10, "PRB", 2018), (10, "REPUBLICANOS", 2022), (33, "PMN", 2022), (33, "MOBILIZA", 2026)
        )
    )
    renomeacoes = {(s.sigla_antiga, s.sigla_nova) for s in infer_renames(partidos)}
    assert renomeacoes == {("PRB", "REPUBLICANOS"), ("PMN", "MOBILIZA")}


def test_numero_reaproveitado_nao_vira_renomeacao():
    partidos = aggregate(_rows((14, "PTB", 2022), (14, "MISSÃO", 2026)))
    assert infer_renames(partidos) == []


def test_sucessoes_curadas_sao_consistentes():
    for sucessao in SUCESSOES_CURADAS:
        assert sucessao.tipo in {"fusao", "incorporacao", "mudanca_numero", "renomeacao"}
        assert sucessao.sigla_nova == normalize_sigla(sucessao.sigla_nova)
        assert 2018 <= sucessao.ano <= 2026
