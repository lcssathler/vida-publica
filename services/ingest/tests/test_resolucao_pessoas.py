from datetime import date

from vida_publica_ingest.canon.pessoas import CandidatoTse, Senador, match_senador

NASC = date(1971, 3, 9)


def _candidato(pessoa, nome, nasc=NASC, uf="RS", cargo="DEPUTADO FEDERAL"):
    return CandidatoTse(pessoa, nome, nasc, uf, cargo)


def _senador(nome="Joana Exemplo de Souza", nasc=NASC, uf="RS"):
    return Senador(990001, nome, nasc, uf)


def test_casa_por_nome_civil_e_data_ignorando_acentos_e_caixa():
    casamento = match_senador(
        _senador("Joána Exemplo de Souza"), [_candidato("p1", "JOANA EXEMPLO DE SOUZA")]
    )
    assert (casamento.pessoa_id, casamento.metodo, casamento.confianca) == (
        "p1",
        "nome_nascimento",
        0.95,
    )


def test_mesma_pessoa_em_varias_candidaturas_nao_e_ambiguidade():
    candidatos = [
        _candidato("p1", "JOANA EXEMPLO DE SOUZA"),
        _candidato("p1", "JOANA EXEMPLO DE SOUZA", uf="SC"),
    ]
    assert match_senador(_senador(), candidatos).pessoa_id == "p1"


def test_homonimos_com_mesma_data_vao_para_revisao():
    candidatos = [
        _candidato("p1", "JOANA EXEMPLO DE SOUZA"),
        _candidato("p2", "JOANA EXEMPLO DE SOUZA"),
    ]
    casamento = match_senador(_senador(), candidatos)
    assert casamento.pessoa_id is None
    assert casamento.motivo == "homonimos_mesma_data"
    assert casamento.candidatos == ("p1", "p2")


def test_nome_diferente_casa_por_data_uf_e_cargo_no_senado():
    candidatos = [
        _candidato("p1", "JOANA E DE SOUZA", cargo="SENADOR"),
        _candidato("p2", "OUTRA PESSOA", uf="SP", cargo="SENADOR"),
    ]
    casamento = match_senador(_senador(), candidatos)
    assert (casamento.pessoa_id, casamento.metodo) == ("p1", "nascimento_cargo_uf")


def test_nunca_casa_so_pelo_nome():
    candidatos = [_candidato("p1", "JOANA EXEMPLO DE SOUZA", nasc=date(1980, 1, 1))]
    casamento = match_senador(_senador(), [c for c in candidatos if c.nascimento == NASC])
    assert casamento.pessoa_id is None
    assert casamento.motivo == "sem_candidatura_compativel"


def test_sem_data_de_nascimento_vai_para_revisao():
    assert match_senador(_senador(nasc=None), []).motivo == "sem_data_nascimento"
