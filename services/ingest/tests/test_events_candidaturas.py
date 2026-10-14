from vida_publica_ingest.events.candidaturas import Linhagem, sem_partido
from vida_publica_ingest.events.comum import Indices


def _linhagem() -> Linhagem:
    linhagem = Linhagem.__new__(Linhagem)
    linhagem._indices = Indices(partidos={"PSL": 1, "UNIAO": 2, "PL": 3, "PMDB": 4, "MDB": 5})
    linhagem._sucessor = {1: 2, 2: None, 3: None, 5: None}
    return linhagem


def test_renomeacao_fusao_e_sigla_antiga_nao_sao_troca():
    linhagem = _linhagem()
    assert not linhagem.troca(("PSL", None), ("UNIÃO", None))  # fusão
    assert not linhagem.troca(("PMDB", None), ("MDB", None))  # sigla anterior a 2018
    assert not linhagem.troca(("PL", 3), ("PL", 3))
    assert linhagem.troca(("PSL", None), ("PL", None))
    assert linhagem.troca(("UNIÃO", None), ("PL", None))
    assert linhagem.troca(("PFX", None), ("PFY", None))  # sem cadastro: compara a sigla


def test_sem_partido():
    assert sem_partido("S.PART.")
    assert sem_partido(None)
    assert not sem_partido("PT")
