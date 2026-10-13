import csv
import io
import zipfile
from datetime import date
from decimal import Decimal

import httpx

from vida_publica_ingest.adapters.memory import MemoryRawRegistry, MemoryRawStorage
from vida_publica_ingest.config import Settings
from vida_publica_ingest.http import SourceClient
from vida_publica_ingest.sources.cota_camara import collect, parse_file, parse_row, row_id, row_key

KEY = "chave-de-teste"
COLUMNS = [
    "txNomeParlamentar", "cpf", "ideCadastro", "nuCarteiraParlamentar", "nuLegislatura", "sgUF",
    "sgPartido", "codLegislatura", "numSubCota", "txtDescricao", "numEspecificacaoSubCota",
    "txtDescricaoEspecificacao", "txtFornecedor", "txtCNPJCPF", "txtNumero", "indTipoDocumento",
    "datEmissao", "vlrDocumento", "vlrGlosa", "vlrLiquido", "numMes", "numAno", "numParcela",
    "txtPassageiro", "txtTrecho", "numLote", "numRessarcimento", "datPagamentoRestituicao",
    "vlrRestituicao", "nuDeputadoId", "ideDocumento", "urlDocumento",
]  # fmt: skip


def _row(**overrides) -> dict:
    base = {
        "txNomeParlamentar": "Maria Exemplo",
        "cpf": "12345678900",
        "ideCadastro": "900001",
        "nuCarteiraParlamentar": "10",
        "nuLegislatura": "2023",
        "sgUF": "MG",
        "sgPartido": "XYZ",
        "codLegislatura": "57",
        "numSubCota": "3",
        "txtDescricao": "COMBUSTÍVEIS E LUBRIFICANTES.",
        "numEspecificacaoSubCota": "1",
        "txtDescricaoEspecificacao": "Veículos Automotores",
        "txtFornecedor": "POSTO EXEMPLO LTDA",
        "txtCNPJCPF": "12.345.678/0001-90",
        "txtNumero": "4471",
        "indTipoDocumento": "4",
        "datEmissao": "2026-03-04T00:00:00",
        "vlrDocumento": "250.5",
        "vlrGlosa": "0",
        "vlrLiquido": "250.5",
        "numMes": "3",
        "numAno": "2026",
        "numParcela": "0",
        "txtPassageiro": "",
        "txtTrecho": "",
        "numLote": "2200001",
        "numRessarcimento": "",
        "datPagamentoRestituicao": "",
        "vlrRestituicao": "",
        "nuDeputadoId": "3001",
        "ideDocumento": "8100001",
        "urlDocumento": "https://exemplo.invalid/doc/8100001",
    }
    return {**base, **overrides}


def _zip(rows: list[dict], ano: int = 2026) -> bytes:
    text = io.StringIO()
    writer = csv.DictWriter(text, fieldnames=COLUMNS, delimiter=";", quoting=csv.QUOTE_ALL)
    writer.writeheader()
    writer.writerows(rows)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(f"Ano-{ano}.csv", ("﻿" + text.getvalue()).encode("utf-8"))
    return buffer.getvalue()


def test_parse_row_pessoa_juridica():
    despesa, cpf = parse_row(_row(), id="x" * 64)
    assert despesa.id_camara == 900001
    assert despesa.fornecedor_cnpj == "12345678000190"
    assert cpf is None
    assert despesa.emitido_em == date(2026, 3, 4)
    assert despesa.valor_liquido == Decimal("250.5")
    assert (despesa.ano, despesa.mes, despesa.num_subcota) == (2026, 3, 3)


def test_parse_row_pessoa_fisica_devolve_cpf_em_claro_e_nao_guarda():
    despesa, cpf = parse_row(
        _row(txtCNPJCPF="123.456.789-00", txtFornecedor="JOSÉ EXEMPLO", ideCadastro=""),
        id="y" * 64,
    )
    assert cpf == "12345678900"
    assert despesa.fornecedor_cnpj is None
    assert despesa.id_camara is None
    assert "cpf" not in despesa.__dict__


def test_ids_estaveis_e_distintos_para_linhas_iguais():
    linhas = list(parse_file(_zip([_row(), _row(), _row(vlrLiquido="10")]), 2026))
    ids = [d.id for d, _ in linhas]
    assert len(set(ids)) == 3
    assert ids[0] == row_id(2026, row_key(_row()), 1)
    assert ids[1] == row_id(2026, row_key(_row()), 2)
    assert next(iter(parse_file(_zip([_row()]), 2026)))[0].id == ids[0]


class FakeRepository:
    def __init__(self, existentes=None):
        self.existentes = existentes or {}
        self.inseridas = []
        self.removidas = []
        self.restauradas = []

    def ids_do_ano(self, ano):
        return dict(self.existentes)

    def insert_many(self, items, *, raw_object_id):
        self.inseridas.extend(items)

    def mark_removed(self, ids):
        self.removidas.extend(ids)

    def restore(self, ids):
        self.restauradas.extend(ids)


def test_collect_aplica_a_diferenca():
    antiga = row_id(2026, row_key(_row(ideDocumento="1")), 1)
    sumida = row_id(2026, row_key(_row(ideDocumento="2")), 1)
    voltou = row_id(2026, row_key(_row(ideDocumento="3")), 1)
    repository = FakeRepository({antiga: False, sumida: False, voltou: True})
    conteudo = _zip(
        [
            _row(ideDocumento="1"),
            _row(ideDocumento="3"),
            _row(ideDocumento="4", txtCNPJCPF="123.456.789-00"),
        ]
    )
    with SourceClient(
        Settings(),
        transport=httpx.MockTransport(lambda request: httpx.Response(200, content=conteudo)),
    ) as client:
        stats = collect(
            client,
            MemoryRawStorage(),
            MemoryRawRegistry(),
            repository,
            cpf_hash_key=KEY,
            anos=[2026],
        )

    assert (stats.linhas, stats.novas, stats.removidas, stats.restauradas) == (3, 1, 1, 1)
    assert stats.fornecedores_pf == 1
    [(nova, cpf_hash)] = repository.inseridas
    assert nova.ide_documento == 4 and cpf_hash and len(cpf_hash) == 64
    assert repository.removidas == [sumida]
    assert repository.restauradas == [voltou]
