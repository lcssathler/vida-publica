"""Proposições das duas casas: detalhe, tramitações, temas oficiais e autores.

Coleta as proposições citadas por votações, pautas e reuniões já gravadas
(a "lista de interesse"), mais as pedidas por id. Câmara e Senado têm
formatos distintos; ambos viram as mesmas tabelas canon.proposicao*.
"""

import hashlib
import json
import logging
from collections.abc import Iterable
from dataclasses import asdict, dataclass
from datetime import date, datetime
from typing import Any
from uuid import UUID

import pg8000.native

from ..adapters.postgres import transaction
from ..http import SourceClient
from ..ports import RawRegistry, RawStorage
from . import camara_deputados, senado_senadores

logger = logging.getLogger(__name__)

CAMARA = "camara"
SENADO = "senado"

# Tipos que entram na lista de interesse quando aparecem só como item de pauta
# (pareceres, destaques e requerimentos avulsos ficam de fora).
TIPOS_PRINCIPAIS = {"PL", "PLP", "PEC", "MPV", "PDL", "PDC", "PRC", "PLV", "PLN", "PFC", "PRS"}


@dataclass(frozen=True)
class Proposicao:
    casa: str
    id_fonte: str
    sigla_tipo: str
    numero: int | None
    ano: int | None
    identificacao: str
    descricao_tipo: str | None
    ementa: str | None
    ementa_detalhada: str | None
    keywords: str | None
    apelido: str | None
    apresentada_em: date | None
    autoria_resumo: str | None
    situacao: str | None
    situacao_em: date | None
    sigla_orgao: str | None
    regime: str | None
    despacho: str | None
    tramitando: bool | None
    url_inteiro_teor: str | None
    proposicao_principal_id_fonte: str | None
    codigo_materia: int | None
    casa_iniciadora: str | None


@dataclass(frozen=True)
class Tramitacao:
    id_fonte: str
    sequencia: int
    data_hora: datetime
    sigla_orgao: str | None
    descricao: str
    cod_tipo: str | None
    situacao: str | None
    cod_situacao: str | None
    despacho: str | None
    regime: str | None
    relator_id_fonte: str | None
    url: str | None


@dataclass(frozen=True)
class Tema:
    cod_tema: int | None
    tema: str
    relevancia: int | None


@dataclass(frozen=True)
class Autor:
    ordem: int
    nome: str
    tipo: str | None
    id_fonte: str | None
    proponente: bool | None


@dataclass(frozen=True)
class ProposicaoCompleta:
    proposicao: Proposicao
    tramitacoes: tuple[Tramitacao, ...]
    temas: tuple[Tema, ...]
    autores: tuple[Autor, ...]

    def content_hash(self) -> str:
        payload = json.dumps(asdict(self), default=str, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(payload.encode()).hexdigest()


def _text(value: Any) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text or None


def _int(value: Any) -> int | None:
    text = _text(value)
    return int(text) if text and text.lstrip("-").isdigit() else None


def _date(value: Any) -> date | None:
    text = _text(value)
    return date.fromisoformat(text[:10]) if text else None


def _datetime(value: Any) -> datetime | None:
    text = _text(value)
    return datetime.fromisoformat(text.replace(" ", "T")) if text else None


def _id_from_uri(uri: Any) -> str | None:
    text = _text(uri)
    return text.rstrip("/").rsplit("/", 1)[-1] if text else None


# --- Câmara -----------------------------------------------------------------


def parse_camara(
    detalhe: dict[str, Any],
    tramitacoes: dict[str, Any],
    temas: dict[str, Any],
    autores: dict[str, Any],
) -> ProposicaoCompleta:
    dados = detalhe["dados"]
    status = dados.get("statusProposicao") or {}
    ano = _int(dados.get("ano"))
    numero = _int(dados.get("numero"))
    proposicao = Proposicao(
        casa=CAMARA,
        id_fonte=str(dados["id"]),
        sigla_tipo=_text(dados.get("siglaTipo")) or "",
        numero=numero,
        ano=ano,
        identificacao=f"{dados.get('siglaTipo')} {numero}/{ano}",
        descricao_tipo=_text(dados.get("descricaoTipo")),
        ementa=_text(dados.get("ementa")),
        ementa_detalhada=_text(dados.get("ementaDetalhada")),
        keywords=_text(dados.get("keywords")),
        apelido=None,
        apresentada_em=_date(dados.get("dataApresentacao")),
        autoria_resumo=None,
        situacao=_text(status.get("descricaoSituacao")),
        situacao_em=_date(status.get("dataHora")),
        sigla_orgao=_text(status.get("siglaOrgao")),
        regime=_text(status.get("regime")),
        despacho=_text(status.get("despacho")),
        tramitando=None,
        url_inteiro_teor=_text(dados.get("urlInteiroTeor")),
        proposicao_principal_id_fonte=_id_from_uri(dados.get("uriPropPrincipal")),
        codigo_materia=None,
        casa_iniciadora=None,
    )
    lista = []
    for item in tramitacoes["dados"]:
        sequencia = int(item["sequencia"])
        lista.append(
            Tramitacao(
                id_fonte=str(sequencia),
                sequencia=sequencia,
                data_hora=datetime.fromisoformat(item["dataHora"]),
                sigla_orgao=_text(item.get("siglaOrgao")),
                descricao=_text(item.get("descricaoTramitacao")) or "",
                cod_tipo=_text(item.get("codTipoTramitacao")),
                situacao=_text(item.get("descricaoSituacao")),
                cod_situacao=_text(item.get("codSituacao")),
                despacho=_text(item.get("despacho")),
                regime=_text(item.get("regime")),
                relator_id_fonte=_id_from_uri(item.get("uriUltimoRelator")),
                url=_text(item.get("url")),
            )
        )
    temas_lista = {
        t.tema: t
        for t in (
            Tema(
                cod_tema=_int(i.get("codTema")),
                tema=_text(i.get("tema")) or "",
                relevancia=_int(i.get("relevancia")),
            )
            for i in temas["dados"]
        )
        if t.tema
    }
    autores_lista = []
    for ordem, item in enumerate(autores["dados"], start=1):
        uri = _text(item.get("uri")) or ""
        autores_lista.append(
            Autor(
                ordem=_int(item.get("ordemAssinatura")) or ordem,
                nome=_text(item.get("nome")) or "",
                tipo=_text(item.get("tipo")),
                id_fonte=_id_from_uri(uri) if "/deputados/" in uri else None,
                proponente=None if item.get("proponente") is None else bool(item["proponente"]),
            )
        )
    autores_lista = list({a.ordem: a for a in autores_lista}.values())
    return ProposicaoCompleta(
        proposicao, tuple(lista), tuple(temas_lista.values()), tuple(autores_lista)
    )


# --- Senado -----------------------------------------------------------------


def parse_senado(processo: dict[str, Any]) -> ProposicaoCompleta:
    documento = processo.get("documento") or {}
    conteudo = processo.get("conteudo") or {}
    autuacoes = processo.get("autuacoes") or []
    principal = autuacoes[0] if autuacoes else {}
    situacoes = principal.get("situacoes") or []
    ultima = situacoes[-1] if situacoes else {}
    tramitando = _text(processo.get("tramitando"))
    proposicao = Proposicao(
        casa=SENADO,
        id_fonte=str(processo["id"]),
        sigla_tipo=_text(processo.get("sigla")) or "",
        numero=_int(processo.get("numero")),
        ano=_int(processo.get("ano")),
        identificacao=_text(processo.get("identificacao")) or "",
        descricao_tipo=_text(processo.get("descricaoSigla")) or _text(documento.get("tipo")),
        ementa=_text(conteudo.get("ementa")),
        ementa_detalhada=None,
        keywords=_text(documento.get("indexacao")),
        apelido=_text(processo.get("apelido")),
        apresentada_em=_date(documento.get("dataApresentacao"))
        or _date(processo.get("dataInicioEfetivo")),
        autoria_resumo=_text(documento.get("resumoAutoria")),
        situacao=_text(processo.get("situacaoAtual")),
        situacao_em=_date(processo.get("dataSituacaoAtual")),
        sigla_orgao=_text((ultima.get("colegiado") or {}).get("sigla"))
        or _text((ultima.get("enteAdministrativo") or {}).get("sigla")),
        regime=None,
        despacho=None,
        tramitando=None if tramitando is None else tramitando.lower() == "sim",
        url_inteiro_teor=_text(documento.get("url")),
        proposicao_principal_id_fonte=None,
        codigo_materia=_int(processo.get("codigoMateria")),
        casa_iniciadora=_text(processo.get("siglaCasaIniciadora")),
    )
    informes = sorted(
        (i for a in autuacoes for i in a.get("informesLegislativos") or []),
        key=lambda i: (str(i.get("data") or ""), int(i["id"])),
    )
    tramitacoes = []
    for sequencia, informe in enumerate(informes, start=1):
        documentos = informe.get("documentosAssociados") or []
        tramitacoes.append(
            Tramitacao(
                id_fonte=str(informe["id"]),
                sequencia=sequencia,
                data_hora=_datetime(informe.get("data")) or datetime.min,
                sigla_orgao=_text((informe.get("colegiado") or {}).get("sigla"))
                or _text((informe.get("enteAdministrativo") or {}).get("sigla")),
                descricao=_text(informe.get("descricao")) or "",
                cod_tipo=None,
                situacao=_text(informe.get("siglaSituacaoIniciada")),
                cod_situacao=_text(informe.get("idSituacaoIniciada")),
                despacho=None,
                regime=None,
                relator_id_fonte=None,
                url=_text(documentos[0].get("url")) if documentos else None,
            )
        )
    temas = {
        t.tema: t
        for t in (
            Tema(
                cod_tema=_int(c.get("codigo")),
                tema=_text(c.get("descricao")) or "",
                relevancia=None,
            )
            for c in processo.get("classificacoes") or []
        )
        if t.tema
    }
    autores = []
    for ordem, item in enumerate(processo.get("autoriaIniciativa") or [], start=1):
        autores.append(
            Autor(
                ordem=_int(item.get("ordem")) or ordem,
                nome=_text(item.get("autor")) or "",
                tipo=_text(item.get("descricaoTipo")),
                id_fonte=_text(item.get("codigoParlamentar")),
                proponente=None,
            )
        )
    autores = list({a.ordem: a for a in autores}.values())
    return ProposicaoCompleta(proposicao, tuple(tramitacoes), tuple(temas.values()), tuple(autores))


# --- Repositório -------------------------------------------------------------


@dataclass
class CollectStats:
    camara: int = 0
    senado: int = 0
    tramitacoes: int = 0
    alteradas: int = 0
    nao_encontradas: int = 0


class ProposicaoRepository:
    def __init__(self, conn: pg8000.native.Connection) -> None:
        self._conn = conn

    def interesse_camara(self) -> list[int]:
        """Ids da Câmara citados por votações e pautas: afetadas, relacionadas e
        itens de pauta dos tipos principais."""
        tipos = sorted(TIPOS_PRINCIPAIS)
        rows = self._conn.run(
            "SELECT DISTINCT id FROM ("
            " SELECT proposicao_id AS id FROM canon.camara_votacao_proposicao"
            "  WHERE papel = 'afetada'"
            " UNION SELECT proposicao_relacionada_id FROM canon.camara_pauta_item"
            "  WHERE proposicao_relacionada_id IS NOT NULL"
            " UNION SELECT proposicao_id FROM canon.camara_pauta_item"
            "  WHERE proposicao_id IS NOT NULL AND proposicao_sigla_tipo = ANY(:tipos)"
            ") ids ORDER BY id",
            tipos=tipos,
        )
        return [row[0] for row in rows]

    def interesse_senado(self) -> tuple[list[int], list[int]]:
        """Ids de processo do Senado citados por votações e reuniões, e códigos de
        matéria da pauta do Plenário ainda sem processo conhecido."""
        processos = self._conn.run(
            "SELECT DISTINCT id FROM ("
            " SELECT id_processo AS id FROM canon.senado_votacao WHERE id_processo IS NOT NULL"
            " UNION SELECT id_processo FROM canon.senado_reuniao_item WHERE id_processo IS NOT NULL"
            ") ids ORDER BY id"
        )
        materias = self._conn.run(
            "SELECT DISTINCT p.codigo_materia FROM canon.senado_pauta_item p"
            " WHERE p.codigo_materia IS NOT NULL AND NOT EXISTS ("
            "  SELECT 1 FROM canon.proposicao x"
            "  WHERE x.casa = 'senado' AND x.codigo_materia = p.codigo_materia)"
            " ORDER BY 1"
        )
        return [row[0] for row in processos], [row[0] for row in materias]

    def upsert(self, completa: ProposicaoCompleta, *, raw_object_id: UUID | None) -> bool:
        values = asdict(completa.proposicao)
        values["raw_object_id"] = raw_object_id
        values["content_hash"] = completa.content_hash()
        columns = list(values)
        sql = (
            f"INSERT INTO canon.proposicao ({', '.join(columns)})"  # noqa: S608 - nomes fixos
            f" VALUES ({', '.join(':' + c for c in columns)})"
            " ON CONFLICT (casa, id_fonte) DO UPDATE SET "
            + ", ".join(f"{c} = EXCLUDED.{c}" for c in columns if c not in ("casa", "id_fonte"))
            + ", atualizado_em = now()"
            " WHERE canon.proposicao.content_hash IS DISTINCT FROM EXCLUDED.content_hash"
            " RETURNING id"
        )
        with transaction(self._conn):
            rows = self._conn.run(sql, **values)
            if not rows:
                return False
            proposicao_id = rows[0][0]
            for tramitacao in completa.tramitacoes:
                self._conn.run(
                    "INSERT INTO canon.proposicao_tramitacao (proposicao_id, id_fonte, sequencia,"
                    " data_hora, sigla_orgao, descricao, cod_tipo, situacao, cod_situacao,"
                    " despacho, regime, relator_id_fonte, url)"
                    " VALUES (:proposicao_id, :id_fonte, :sequencia, :data_hora, :sigla_orgao,"
                    " :descricao, :cod_tipo, :situacao, :cod_situacao, :despacho, :regime,"
                    " :relator_id_fonte, :url) ON CONFLICT (proposicao_id, id_fonte) DO UPDATE SET"
                    " sequencia = EXCLUDED.sequencia, data_hora = EXCLUDED.data_hora,"
                    " sigla_orgao = EXCLUDED.sigla_orgao, descricao = EXCLUDED.descricao,"
                    " cod_tipo = EXCLUDED.cod_tipo, situacao = EXCLUDED.situacao,"
                    " cod_situacao = EXCLUDED.cod_situacao, despacho = EXCLUDED.despacho,"
                    " regime = EXCLUDED.regime, relator_id_fonte = EXCLUDED.relator_id_fonte,"
                    " url = EXCLUDED.url",
                    proposicao_id=proposicao_id,
                    **asdict(tramitacao),
                )
            for table in ("canon.proposicao_tema", "canon.proposicao_autor"):
                self._conn.run(
                    f"DELETE FROM {table} WHERE proposicao_id = :id",  # noqa: S608 - nome fixo
                    id=proposicao_id,
                )
            for tema in completa.temas:
                self._conn.run(
                    "INSERT INTO canon.proposicao_tema (proposicao_id, cod_tema, tema, relevancia)"
                    " VALUES (:proposicao_id, :cod_tema, :tema, :relevancia)",
                    proposicao_id=proposicao_id,
                    **asdict(tema),
                )
            for autor in completa.autores:
                self._conn.run(
                    "INSERT INTO canon.proposicao_autor"
                    " (proposicao_id, ordem, nome, tipo, id_fonte, proponente)"
                    " VALUES (:proposicao_id, :ordem, :nome, :tipo, :id_fonte, :proponente)",
                    proposicao_id=proposicao_id,
                    **asdict(autor),
                )
        return True


# --- Coleta ---------------------------------------------------------------------


def _fetch(client, storage, registry, *, source, dataset, url, params=None):
    response, stored = client.fetch_and_store(
        storage, registry, source=source, dataset=dataset, url=url, params=params
    )
    return response.json(), stored


def collect_camara(
    client: SourceClient,
    storage: RawStorage,
    registry: RawRegistry,
    repository: ProposicaoRepository,
    ids: Iterable[int],
    stats: CollectStats,
) -> None:
    api, source = camara_deputados.API, camara_deputados.SOURCE
    for id_camara in ids:
        base = f"{api}/proposicoes/{id_camara}"
        detalhe, stored = _fetch(
            client, storage, registry, source=source, dataset="proposicao-detalhe", url=base
        )
        tramitacoes, _ = _fetch(
            client,
            storage,
            registry,
            source=source,
            dataset="proposicao-tramitacoes",
            url=f"{base}/tramitacoes",
        )
        temas, _ = _fetch(
            client,
            storage,
            registry,
            source=source,
            dataset="proposicao-temas",
            url=f"{base}/temas",
        )
        autores, _ = _fetch(
            client,
            storage,
            registry,
            source=source,
            dataset="proposicao-autores",
            url=f"{base}/autores",
        )
        completa = parse_camara(detalhe, tramitacoes, temas, autores)
        stats.camara += 1
        stats.tramitacoes += len(completa.tramitacoes)
        if repository.upsert(completa, raw_object_id=stored.raw.id):
            stats.alteradas += 1


def collect_senado(
    client: SourceClient,
    storage: RawStorage,
    registry: RawRegistry,
    repository: ProposicaoRepository,
    ids_processo: Iterable[int],
    codigos_materia: Iterable[int],
    stats: CollectStats,
) -> None:
    api, source = senado_senadores.API, senado_senadores.SOURCE
    pendentes = list(dict.fromkeys(ids_processo))
    for codigo in codigos_materia:
        lista, _ = _fetch(
            client,
            storage,
            registry,
            source=source,
            dataset="processo-por-materia",
            url=f"{api}/processo",
            params={"codigoMateria": codigo},
        )
        encontrados = [int(item["id"]) for item in lista if item.get("id")]
        if not encontrados:
            stats.nao_encontradas += 1
        pendentes.extend(encontrados)
    for id_processo in dict.fromkeys(pendentes):
        processo, stored = _fetch(
            client,
            storage,
            registry,
            source=source,
            dataset="processo-detalhe",
            url=f"{api}/processo/{id_processo}",
        )
        completa = parse_senado(processo)
        stats.senado += 1
        stats.tramitacoes += len(completa.tramitacoes)
        if repository.upsert(completa, raw_object_id=stored.raw.id):
            stats.alteradas += 1


def collect(
    client: SourceClient,
    storage: RawStorage,
    registry: RawRegistry,
    repository: ProposicaoRepository,
    *,
    ids_camara: Iterable[int] = (),
    ids_senado: Iterable[int] = (),
    usar_interesse: bool = True,
) -> CollectStats:
    """Coleta as proposições pedidas e, por padrão, as da lista de interesse."""
    stats = CollectStats()
    camara = list(ids_camara)
    senado = list(ids_senado)
    materias: list[int] = []
    if usar_interesse:
        camara.extend(repository.interesse_camara())
        processos, materias = repository.interesse_senado()
        senado.extend(processos)
    collect_camara(client, storage, registry, repository, dict.fromkeys(camara), stats)
    collect_senado(client, storage, registry, repository, senado, materias, stats)
    logger.info("proposicoes: %s", stats)
    return stats
