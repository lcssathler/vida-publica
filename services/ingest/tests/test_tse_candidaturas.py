import csv
import io
import zipfile
from datetime import date

import httpx
import pytest

from vida_publica_ingest.adapters.memory import MemoryRawRegistry, MemoryRawStorage
from vida_publica_ingest.config import Settings
from vida_publica_ingest.http import SourceClient
from vida_publica_ingest.identity import hash_document
from vida_publica_ingest.sources.tse_candidaturas import collect, parse_row, read_zip

KEY = "chave-de-teste"

# Linhas fictícias no formato do consulta_cand; CPF com dígito verificador inválido.
ROWS = [
    {
        "ANO_ELEICAO": "2026",
        "NR_TURNO": "1",
        "CD_ELEICAO": "999",
        "DS_ELEICAO": "Eleição Geral Federal 2026",
        "DT_ELEICAO": "04/10/2026",
        "SG_UF": "MG",
        "SG_UE": "MG",
        "NM_UE": "MINAS GERAIS",
        "CD_CARGO": "6",
        "DS_CARGO": "DEPUTADO FEDERAL",
        "SQ_CANDIDATO": "990000000001",
        "NR_CANDIDATO": "9999",
        "NM_CANDIDATO": "MARIA EXEMPLO DA SILVA",
        "NM_URNA_CANDIDATO": "MARIA EXEMPLO",
        "NM_SOCIAL_CANDIDATO": "#NULO#",
        "NR_CPF_CANDIDATO": "12345678900",
        "DS_EMAIL": "nao.guardar@exemplo.invalid",
        "DS_SITUACAO_CANDIDATURA": "#NE",
        "NR_PARTIDO": "99",
        "SG_PARTIDO": "XYZ",
        "NM_PARTIDO": "PARTIDO EXEMPLO",
        "NR_FEDERACAO": "-1",
        "SG_UF_NASCIMENTO": "MG",
        "DT_NASCIMENTO": "17/05/1980",
        "NR_TITULO_ELEITORAL_CANDIDATO": "000000000191",
        "DS_GENERO": "FEMININO",
        "DS_SIT_TOT_TURNO": "ELEITO POR QP",
    },
    {
        "ANO_ELEICAO": "2026",
        "NR_TURNO": "1",
        "SQ_CANDIDATO": "990000000002",
        "NM_CANDIDATO": "JOAO SEM DOCUMENTO",
        "NR_CPF_CANDIDATO": "-4",
        "NR_TITULO_ELEITORAL_CANDIDATO": "-4",
        "DT_NASCIMENTO": "#NULO#",
    },
]


def _zip(rows=ROWS, name="consulta_cand_2026_BRASIL.csv") -> bytes:
    header = sorted({key for row in rows for key in row})
    text = io.StringIO()
    writer = csv.DictWriter(text, fieldnames=header, delimiter=";", quoting=csv.QUOTE_ALL)
    writer.writeheader()
    writer.writerows(rows)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(name, text.getvalue().encode("latin-1"))
    return buffer.getvalue()


def test_parse_row_converte_tipos_e_marcadores_nulos():
    candidatura, documentos = parse_row(ROWS[0])
    assert candidatura.sq_candidato == 990000000001
    assert candidatura.dt_nascimento == date(1980, 5, 17)
    assert candidatura.dt_eleicao == date(2026, 10, 4)
    assert candidatura.nm_social_candidato is None
    assert candidatura.ds_situacao_candidatura is None
    assert candidatura.nr_federacao is None
    assert documentos.cpf == "12345678900"


def test_email_nao_faz_parte_da_candidatura():
    candidatura, _ = parse_row(ROWS[0])
    assert "nao.guardar" not in repr(candidatura)


def test_read_zip_exige_o_arquivo_nacional():
    assert len(list(read_zip(_zip(), 2026))) == 2
    with pytest.raises(ValueError, match="BRASIL"):
        list(read_zip(_zip(name="consulta_cand_2026_MG.csv"), 2026))


class FakeRepository:
    def __init__(self):
        self.items = []

    def upsert_many(self, items, *, raw_object_id):
        self.items.extend(items)
        return len(items)


def test_collect_grava_so_hashes_dos_documentos():
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200, content=_zip(), headers={"Content-Type": "application/zip"}
        )
    )
    repository = FakeRepository()
    with SourceClient(Settings(), transport=transport) as client:
        stats = collect(
            client,
            MemoryRawStorage(),
            MemoryRawRegistry(),
            repository,
            cpf_hash_key=KEY,
            anos=[2026],
        )

    assert (stats.linhas, stats.alteradas, stats.sem_cpf) == (2, 2, 1)
    _, cpf_hash, titulo_hash = repository.items[0]
    assert cpf_hash == hash_document("12345678900", KEY, length=11)
    assert titulo_hash == hash_document("000000000191", KEY, length=12)
    assert repository.items[1][1:] == (None, None)
