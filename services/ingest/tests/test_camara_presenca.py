from datetime import date
from pathlib import Path

import httpx

from vida_publica_ingest.adapters.memory import MemoryRawRegistry, MemoryRawStorage
from vida_publica_ingest.config import Settings
from vida_publica_ingest.http import SourceClient
from vida_publica_ingest.sources.camara_presenca import (
    collect,
    parse_matriculas,
    parse_presencas_dia,
    parse_presentes,
)

FIXTURES = Path(__file__).parent / "fixtures" / "camara"
PRESENCAS_XML = (FIXTURES / "presencas_dia.xml").read_bytes()
DEPUTADOS_XML = b"""<?xml version="1.0" encoding="utf-8"?>
<deputados>
  <deputado><ideCadastro>900001</ideCadastro><matricula>10</matricula>
    <nomeParlamentar>Maria Exemplo</nomeParlamentar></deputado>
  <deputado><ideCadastro>900002</ideCadastro><matricula>20</matricula>
    <nomeParlamentar>Carlos Exemplo</nomeParlamentar></deputado>
</deputados>"""


def test_parse_presentes():
    payload = {"dados": [{"id": 900002, "nome": "B"}, {"id": 900001, "nome": "A"}, {"id": 900002}]}
    assert parse_presentes(payload) == [900001, 900002]


def test_parse_presencas_dia():
    dia, presencas = parse_presencas_dia(PRESENCAS_XML)
    assert dia == date(2026, 9, 3)
    assert [
        (p.matricula, p.frequencia, p.justificativa, p.sessoes_presente) for p in presencas
    ] == [
        (10, "Presença", None, 1),
        (20, "Ausência justificada", "Missão Autorizada", 0),
        (30, "Ausência", None, 0),
    ]
    assert presencas[0].nome == "Maria Exemplo-XYZ/MG"


def test_dia_sem_sessao():
    assert parse_presencas_dia(b'<?xml version="1.0" encoding="utf-8"?><dia />') == (None, [])


def test_parse_matriculas():
    assert parse_matriculas(DEPUTADOS_XML) == {10: 900001, 20: 900002}


class FakeRepository:
    def __init__(self):
        self.presentes = {}
        self.dias = {}

    def eventos_deliberativos(self, desde, ate):
        return [9900100, 9900101]

    def dias_de_plenario(self, desde, ate):
        return [date(2026, 9, 3), date(2026, 9, 4)]

    def nomes_parlamentares(self):
        return {"ana exemplo": 900003}

    def save_presentes(self, id_evento, ids):
        novos = len(set(ids) - set(self.presentes.get(id_evento, [])))
        self.presentes[id_evento] = ids
        return novos

    def save_dia(self, dia, registros, *, raw_object_id):
        self.dias[dia] = registros


def _handler(request: httpx.Request) -> httpx.Response:
    path = request.url.path
    if path.endswith("/deputados"):
        return httpx.Response(200, json={"dados": [{"id": 900001}, {"id": 900002}]})
    if path.endswith("/ObterDeputados"):
        return httpx.Response(200, content=DEPUTADOS_XML, headers={"Content-Type": "text/xml"})
    assert path.endswith("/ListarPresencasDia")
    if request.url.params["data"] == "03/09/2026":
        return httpx.Response(200, content=PRESENCAS_XML, headers={"Content-Type": "text/xml"})
    return httpx.Response(200, content=b"<dia />", headers={"Content-Type": "text/xml"})


def test_collect_sem_legado_so_busca_eventos():
    repository = FakeRepository()
    with SourceClient(Settings(), transport=httpx.MockTransport(_handler)) as client:
        stats = collect(
            client,
            MemoryRawStorage(),
            MemoryRawRegistry(),
            repository,
            desde=date(2026, 9, 1),
            ate=date(2026, 9, 30),
        )
    assert (stats.eventos, stats.presencas, stats.presencas_novas, stats.dias_legado) == (
        2,
        4,
        4,
        0,
    )
    assert repository.dias == {}


def test_collect_com_legado_casa_por_matricula_e_nome():
    repository = FakeRepository()
    with SourceClient(Settings(), transport=httpx.MockTransport(_handler)) as client:
        stats = collect(
            client,
            MemoryRawStorage(),
            MemoryRawRegistry(),
            repository,
            desde=date(2026, 9, 1),
            ate=date(2026, 9, 30),
            legado=True,
        )
    assert (stats.dias_legado, stats.registros_legado, stats.sem_matricula) == (1, 3, 0)
    registros = repository.dias[date(2026, 9, 3)]
    assert [(id_camara, p.frequencia) for id_camara, p in registros] == [
        (900001, "Presença"),
        (900002, "Ausência justificada"),
        (900003, "Ausência"),
    ]
