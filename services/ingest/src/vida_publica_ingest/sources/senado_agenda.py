"""Agenda do Senado: sessões do Plenário com pauta e reuniões das comissões com itens."""

import hashlib
import json
import logging
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta
from typing import Any

import pg8000.native

from ..adapters.postgres import transaction, upsert_if_changed_sql
from ..http import SourceClient
from ..ports import RawRegistry, RawStorage
from .senado_senadores import API, SOURCE, _as_list, _text

logger = logging.getLogger(__name__)


def _int(value: Any) -> int | None:
    text = _text(value)
    return int(text) if text and text.lstrip("-").isdigit() else None


def _bool(value: Any) -> bool | None:
    text = (_text(value) or "").lower()
    if text in {"sim", "true", "s"}:
        return True
    if text in {"não", "nao", "false", "n"}:
        return False
    return None


def _datetime(value: Any) -> datetime | None:
    text = _text(value)
    return datetime.fromisoformat(text) if text else None


@dataclass(frozen=True)
class SenadoSessao:
    codigo: int
    data: date
    hora: str | None
    numero: str | None
    tipo: str | None
    local: str | None
    casa: str | None
    legislatura: int | None
    sessao_legislativa: int | None
    cod_situacao: int | None
    situacao: str | None
    realizada: bool | None
    pauta_confirmada: bool | None
    tipo_presenca: str | None
    comunicado: str | None


@dataclass(frozen=True)
class SessaoPautaItem:
    codigo_materia: int | None
    identificacao: str | None
    sigla: str | None
    numero: str | None
    ano: int | None
    descricao_identificacao: str | None
    objetivo: str | None
    casa_iniciadora: str | None
    ementa: str | None
    parecer: str | None
    apreciacao: str | None
    autor: str | None
    tipo_pauta: str | None
    descricao_tipo_pauta: str | None
    sequencia_ordem: int | None


@dataclass(frozen=True)
class SessaoCompleta:
    sessao: SenadoSessao
    pauta: tuple[SessaoPautaItem, ...]

    def content_hash(self) -> str:
        payload = json.dumps(asdict(self), default=str, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(payload.encode()).hexdigest()


def parse_sessoes(payload: dict[str, Any]) -> list[SessaoCompleta]:
    """Converte /plenario/agenda/mes/{data} ou /plenario/agenda/dia/{data}."""
    result = []
    sessoes = (payload.get("AgendaPlenario") or {}).get("Sessoes") or {}
    for item in _as_list(sessoes.get("Sessao")):
        realizada = item.get("Realizada") or {}
        sessao = SenadoSessao(
            codigo=int(item["CodigoSessao"]),
            data=date.fromisoformat(item["Data"][:10]),
            hora=_text(item.get("Hora")),
            numero=_text(item.get("NumeroSessao")),
            tipo=_text(item.get("TipoSessao")),
            local=_text(item.get("LocalSessao")),
            casa=_text(item.get("Casa")),
            legislatura=_int(item.get("Legislatura")),
            sessao_legislativa=_int(item.get("SessaoLegislativa")),
            cod_situacao=_int(item.get("CodigoSituacaoSessao")),
            situacao=_text(item.get("SituacaoSessao")),
            realizada=_bool(realizada.get("Status")),
            pauta_confirmada=_bool(item.get("PautaConfirmada")),
            tipo_presenca=_text(item.get("DescricaoTipoPresenca")),
            comunicado=_text(item.get("Comunicado")),
        )
        pauta = []
        for materia in _as_list((item.get("Materias") or {}).get("Materia")):
            pauta.append(
                SessaoPautaItem(
                    codigo_materia=_int(materia.get("CodigoMateria")),
                    identificacao=_text(materia.get("Identificacao")),
                    sigla=_text(materia.get("SiglaMateria")),
                    numero=_text(materia.get("NumeroMateria")),
                    ano=_int(materia.get("AnoMateria")),
                    descricao_identificacao=_text(materia.get("DescricaoIdentificacaoMateria")),
                    objetivo=_text(materia.get("DescricaoObjetivoProcesso")),
                    casa_iniciadora=_text(materia.get("SiglaCasaIniciadora")),
                    ementa=_text(materia.get("Ementa")),
                    parecer=_text(materia.get("Parecer")),
                    apreciacao=_text(materia.get("Apreciacao")),
                    autor=_text(materia.get("NomeAutor")),
                    tipo_pauta=_text(materia.get("TipoPauta")),
                    descricao_tipo_pauta=_text(materia.get("DescricaoTipoPauta")),
                    sequencia_ordem=_int(materia.get("SequenciaOrdem")),
                )
            )
        result.append(SessaoCompleta(sessao, tuple(pauta)))
    return result


@dataclass(frozen=True)
class SenadoReuniao:
    codigo: int
    titulo: str | None
    descricao: str | None
    inicio: datetime
    codigo_colegiado: int | None
    sigla_colegiado: str | None
    nome_colegiado: str | None
    tipo: str | None
    cod_situacao: int | None
    situacao: str | None
    realizada: bool | None
    local: str | None
    tipo_presenca: str | None
    secreta: bool | None
    url_pauta: str | None
    url_resultado: str | None


@dataclass(frozen=True)
class ReuniaoItem:
    parte: int | None
    parte_nome: str | None
    deliberativa: bool
    codigo_item: int | None
    ordem: int | None
    tipo: str | None
    nome: str | None
    descricao: str | None
    id_processo: int | None
    codigo_materia: int | None
    identificacao: str | None
    sigla: str | None
    numero: str | None
    ano: int | None
    ementa: str | None
    autoria: str | None
    relatorio: str | None
    resultado: str | None
    resultado_texto: str | None
    relator_codigo: int | None
    relator_nome: str | None
    relator_casa: str | None


@dataclass(frozen=True)
class ReuniaoCompleta:
    reuniao: SenadoReuniao
    itens: tuple[ReuniaoItem, ...]

    def content_hash(self) -> str:
        payload = json.dumps(asdict(self), default=str, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(payload.encode()).hexdigest()


def _parse_item(parte: dict[str, Any], item: dict[str, Any]) -> ReuniaoItem:
    doma = item.get("doma") or {}
    relatorias = _as_list(doma.get("relatorias"))
    relator = ((relatorias[0] if relatorias else {}).get("relator") or {}).get("parlamentar") or {}
    resultado = item.get("resultado") or {}
    autor = item.get("autorItemPauta") or {}
    return ReuniaoItem(
        parte=_int(parte.get("sequencial")),
        parte_nome=_text(parte.get("nome")),
        deliberativa=_bool(parte.get("isDeliberativa")) or False,
        codigo_item=_int(item.get("codigo")),
        ordem=_int(item.get("ordem")),
        tipo=_text(item.get("tipo")),
        nome=_text(item.get("nome")),
        descricao=_text(item.get("descricao")),
        id_processo=_int(doma.get("idProcesso")),
        codigo_materia=_int(doma.get("codigoMateria")),
        identificacao=_text(doma.get("identificacao")),
        sigla=_text(doma.get("sigla")),
        numero=_text(doma.get("numero")),
        ano=_int(doma.get("ano")),
        ementa=_text(doma.get("ementa")),
        autoria=_text(doma.get("autoria")) or _text(autor.get("nomeAutoria")),
        relatorio=_text(item.get("relatorio")),
        resultado=_text(resultado.get("descricao")) or _text(item.get("siglaResultado")),
        resultado_texto=_text(resultado.get("texto")) or _text(item.get("descricaoResultado")),
        relator_codigo=_int(relator.get("codigo")),
        relator_nome=_text(relator.get("nomeComCargo")) or _text(relator.get("nome")),
        relator_casa=_text(relator.get("casa")),
    )


def parse_reunioes(payload: dict[str, Any]) -> list[ReuniaoCompleta]:
    """Converte /comissao/agenda/{inicio}/{fim}. Partes e itens vêm como objeto ou lista."""
    result = []
    reunioes = (payload.get("AgendaReuniao") or {}).get("reunioes") or {}
    for item in _as_list(reunioes.get("reuniao")):
        colegiado = item.get("colegiadoCriador") or {}
        tipo = item.get("tipo") or {}
        reuniao = SenadoReuniao(
            codigo=int(item["codigo"]),
            titulo=_text(item.get("titulo")),
            descricao=_text(item.get("descricao")),
            inicio=datetime.fromisoformat(item["dataInicio"]),
            codigo_colegiado=_int(colegiado.get("codigo")),
            sigla_colegiado=_text(colegiado.get("sigla")),
            nome_colegiado=_text(colegiado.get("nome")),
            tipo=_text(tipo.get("descricao")),
            cod_situacao=_int(item.get("codigoSituacao")),
            situacao=_text(item.get("situacao")),
            realizada=_bool(item.get("realizada")),
            local=_text(item.get("local")),
            tipo_presenca=_text(item.get("tipoPresenca")),
            secreta=_bool(item.get("secreta")),
            url_pauta=_text(item.get("urlUltimaPautaCheiaPublicada"))
            or _text(item.get("urlUltimaPautaSimplesPublicada")),
            url_resultado=_text(item.get("urlUltimoResultadoPublicado")),
        )
        itens = [
            _parse_item(parte, subitem)
            for parte in _as_list(item.get("partes"))
            for subitem in _as_list(parte.get("itens"))
        ]
        result.append(ReuniaoCompleta(reuniao, tuple(itens)))
    return result


def month_starts(desde: date, ate: date) -> list[date]:
    """A data inicial e o primeiro dia de cada mês seguinte até `ate`."""
    if ate < desde:
        raise ValueError(f"intervalo inválido: {desde} > {ate}")
    datas = [desde]
    proximo = (desde.replace(day=1) + timedelta(days=32)).replace(day=1)
    while proximo <= ate:
        datas.append(proximo)
        proximo = (proximo + timedelta(days=32)).replace(day=1)
    return datas


@dataclass
class CollectStats:
    sessoes: int = 0
    itens_pauta: int = 0
    reunioes: int = 0
    itens_reuniao: int = 0
    alteradas: int = 0


class SenadoAgendaRepository:
    def __init__(self, conn: pg8000.native.Connection) -> None:
        self._conn = conn

    def _replace_children(self, table: str, parent_column: str, parent_id: int, rows) -> None:
        self._conn.run(
            f"DELETE FROM {table} WHERE {parent_column} = :id",  # noqa: S608 - nomes fixos
            id=parent_id,
        )
        for posicao, row in enumerate(rows, start=1):
            values = asdict(row)
            columns = [parent_column, "posicao", *values]
            self._conn.run(
                f"INSERT INTO {table} ({', '.join(columns)})"  # noqa: S608 - nomes fixos
                f" VALUES ({', '.join(':' + c for c in columns)})",
                posicao=posicao,
                **{parent_column: parent_id},
                **values,
            )

    def upsert_sessao(self, completa: SessaoCompleta, *, raw_object_id: Any) -> bool:
        values = asdict(completa.sessao)
        values["raw_object_id"] = raw_object_id
        values["content_hash"] = completa.content_hash()
        sql = upsert_if_changed_sql("canon.senado_sessao", list(values), "codigo")
        with transaction(self._conn):
            if not self._conn.run(sql, **values):
                return False
            self._replace_children(
                "canon.senado_pauta_item", "codigo_sessao", completa.sessao.codigo, completa.pauta
            )
        return True

    def upsert_reuniao(self, completa: ReuniaoCompleta, *, raw_object_id: Any) -> bool:
        values = asdict(completa.reuniao)
        values["raw_object_id"] = raw_object_id
        values["content_hash"] = completa.content_hash()
        sql = upsert_if_changed_sql("canon.senado_reuniao", list(values), "codigo")
        with transaction(self._conn):
            if not self._conn.run(sql, **values):
                return False
            self._replace_children(
                "canon.senado_reuniao_item",
                "codigo_reuniao",
                completa.reuniao.codigo,
                completa.itens,
            )
        return True


def collect(
    client: SourceClient,
    storage: RawStorage,
    registry: RawRegistry,
    repository: SenadoAgendaRepository,
    *,
    desde: date,
    ate: date,
) -> CollectStats:
    """Coleta a agenda do Plenário (por mês, até o fim de cada mês) e das comissões."""
    stats = CollectStats()
    vistas: set[int] = set()
    for inicio in month_starts(desde, ate):
        response, stored = client.fetch_and_store(
            storage,
            registry,
            source=SOURCE,
            dataset="agenda-plenario",
            url=f"{API}/plenario/agenda/mes/{inicio:%Y%m%d}",
        )
        for completa in parse_sessoes(response.json()):
            if completa.sessao.codigo in vistas:
                continue
            vistas.add(completa.sessao.codigo)
            stats.sessoes += 1
            stats.itens_pauta += len(completa.pauta)
            if repository.upsert_sessao(completa, raw_object_id=stored.raw.id):
                stats.alteradas += 1

    response, stored = client.fetch_and_store(
        storage,
        registry,
        source=SOURCE,
        dataset="agenda-comissoes",
        url=f"{API}/comissao/agenda/{desde:%Y%m%d}/{ate:%Y%m%d}",
    )
    for completa in parse_reunioes(response.json()):
        stats.reunioes += 1
        stats.itens_reuniao += len(completa.itens)
        if repository.upsert_reuniao(completa, raw_object_id=stored.raw.id):
            stats.alteradas += 1

    logger.info("senado-agenda: %s", stats)
    return stats
