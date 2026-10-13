"""Motor de eventos: regras versionadas, deduplicação e status de publicação.

Cada gerador lê o esquema canon e devolve todos os fatos do seu tipo (não só os
novos). O motor compara com o que já está em feed.evento e grava apenas a
diferença: fatos novos entram, fatos alterados são atualizados, fatos que a
fonte removeu são arquivados. Assim rodar de novo nunca duplica nem muda nada.

Status de um evento novo, nesta ordem:
1. dinheiro acima do limite da regra (R$ 500 mil): segurado para revisão humana;
2. fato já publicado por uma versão anterior da regra: herda o status;
3. primeira execução do tipo (carga inicial): segurado, sem publicar;
4. caso contrário: publicado.
"""

import hashlib
import json
import logging
from collections.abc import Callable, Iterable, Iterator, Mapping
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any

import pg8000.native

from ..adapters.postgres import rows_as_dicts, transaction

logger = logging.getLogger(__name__)

# Horário de Brasília (sem horário de verão desde 2019). As fontes publicam data
# e hora locais sem fuso.
BRT = timezone(timedelta(hours=-3))

# Decisão de produto: eventos de dinheiro acima deste valor esperam revisão humana.
LIMITE_REVISAO = Decimal("500000")

_LOTE = 1000

SEGURADO, PUBLICADO, ARQUIVADO = "segurado", "publicado", "arquivado"
CARGA_INICIAL, REVISAO_VALOR = "carga_inicial", "revisao_valor"
FONTE_REMOVEU, REGRA_SUBSTITUIDA = "fonte_removeu", "regra_substituida"

ALVOS = ("pessoa", "partido", "proposicao", "assunto")
VISIBILIDADES = ("geral", "seguidores")


class RegraAlterada(RuntimeError):
    """A regra mudou sem ganhar versão nova: os eventos antigos deixariam de ser reproduzíveis."""


@dataclass(frozen=True)
class Regra:
    tipo: str
    versao: int
    descricao: str
    parametros: Mapping[str, Any] = field(default_factory=dict)

    @property
    def limite_revisao(self) -> Decimal | None:
        valor = self.parametros.get("revisao_acima_de")
        return None if valor is None else Decimal(str(valor))

    @property
    def arquivar_ausentes(self) -> bool:
        """Se o fato some da fonte, o evento é arquivado (padrão). Históricos guardam tudo."""
        return bool(self.parametros.get("arquivar_ausentes", True))

    def chave_dedup(self, chave_fato: str) -> str:
        return f"{self.tipo}:v{self.versao}:{chave_fato}"


@dataclass(frozen=True)
class Alvo:
    tipo: str
    id: str
    papel: str = ""

    def __post_init__(self) -> None:
        if self.tipo not in ALVOS:
            raise ValueError(f"alvo inválido: {self.tipo}")


@dataclass(frozen=True)
class Evento:
    """Um fato a publicar. chave: ids da fonte que identificam o fato, estáveis."""

    chave: str
    ocorrido_em: datetime
    titulo: str
    resumo: str | None = None
    payload: Mapping[str, Any] = field(default_factory=dict)
    alvos: tuple[Alvo, ...] = ()
    fonte_url: str | None = None
    fonte_dado_em: datetime | None = None
    valor: Decimal | None = None
    visibilidade: str = "geral"

    def __post_init__(self) -> None:
        if self.visibilidade not in VISIBILIDADES:
            raise ValueError(f"visibilidade inválida: {self.visibilidade}")
        if self.ocorrido_em.tzinfo is None:
            raise ValueError("ocorrido_em precisa de fuso; use momento()")

    def conteudo(self) -> dict[str, Any]:
        return {
            "ocorrido_em": self.ocorrido_em.isoformat(),
            "titulo": self.titulo,
            "resumo": self.resumo,
            "payload": self.payload,
            "alvos": sorted([a.tipo, a.id, a.papel] for a in set(self.alvos)),
            "fonte_url": self.fonte_url,
            "fonte_dado_em": self.fonte_dado_em.isoformat() if self.fonte_dado_em else None,
            "valor": None if self.valor is None else str(self.valor),
            "visibilidade": self.visibilidade,
        }

    def content_hash(self) -> str:
        return hashlib.sha256(_json(self.conteudo()).encode()).hexdigest()


@dataclass(frozen=True)
class Gerador:
    regra: Regra
    gerar: Callable[[pg8000.native.Connection], Iterable[Evento]]


@dataclass(frozen=True)
class Estado:
    """Situação de um evento já gravado."""

    id: str
    chave_fato: str
    regra_versao: int
    status: str
    motivo: str | None
    publicado_em: datetime | None
    revisado_em: datetime | None
    valor: Decimal | None
    content_hash: str


@dataclass(frozen=True)
class Decisao:
    status: str
    motivo: str | None
    publicado_em: datetime | None
    revisado_em: datetime | None


@dataclass
class Stats:
    tipo: str
    versao: int
    carga_inicial: bool = False
    gerados: int = 0
    novos: int = 0
    alterados: int = 0
    arquivados: int = 0
    substituidos: int = 0
    segurados: int = 0


def momento(valor: date | datetime) -> datetime:
    """Data ou data e hora locais da fonte como instante no horário de Brasília."""
    if isinstance(valor, datetime):
        return valor if valor.tzinfo else valor.replace(tzinfo=BRT)
    return datetime.combine(valor, time(), tzinfo=BRT)


def _padrao_json(valor: Any) -> Any:
    if isinstance(valor, Decimal):
        return float(valor)
    if isinstance(valor, datetime | date):
        return valor.isoformat()
    raise TypeError(f"tipo não serializável: {type(valor).__name__}")


def _json(valor: Any) -> str:
    return json.dumps(
        valor, default=_padrao_json, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )


def _precisa_revisao(regra: Regra, valor: Decimal | None) -> bool:
    limite = regra.limite_revisao
    return limite is not None and valor is not None and abs(valor) > limite


def _revisado_com(estado: Estado, valor: Decimal | None) -> bool:
    return estado.revisado_em is not None and estado.valor == valor


def decidir_novo(
    regra: Regra,
    evento: Evento,
    *,
    carga_inicial: bool,
    anterior: Estado | None,
    agora: datetime,
) -> Decisao:
    """Status de um fato que ainda não tem evento nesta versão da regra."""
    if _precisa_revisao(regra, evento.valor) and not (
        anterior is not None and _revisado_com(anterior, evento.valor)
    ):
        return Decisao(SEGURADO, REVISAO_VALOR, None, None)
    if anterior is not None and anterior.status != ARQUIVADO:
        a = anterior
        return Decisao(a.status, a.motivo, a.publicado_em, a.revisado_em)
    if carga_inicial:
        return Decisao(SEGURADO, CARGA_INICIAL, None, None)
    return Decisao(PUBLICADO, None, agora, None)


def decidir_alterado(regra: Regra, evento: Evento, atual: Estado, *, agora: datetime) -> Decisao:
    """Status de um evento cujo conteúdo mudou na fonte."""
    manter = Decisao(atual.status, atual.motivo, atual.publicado_em, atual.revisado_em)
    if atual.status == ARQUIVADO and atual.motivo != FONTE_REMOVEU:
        return manter  # arquivado pelo admin ou por versão nova da regra
    if _precisa_revisao(regra, evento.valor) and not _revisado_com(atual, evento.valor):
        # o que o admin aprovou era outro número
        return Decisao(SEGURADO, REVISAO_VALOR, atual.publicado_em, None)
    if atual.status == ARQUIVADO:  # a fonte trouxe o fato de volta
        if atual.publicado_em is None:
            return Decisao(SEGURADO, CARGA_INICIAL, None, None)
        return Decisao(PUBLICADO, None, atual.publicado_em, atual.revisado_em)
    if atual.status == SEGURADO and atual.motivo == REVISAO_VALOR:
        return Decisao(PUBLICADO, None, atual.publicado_em or agora, atual.revisado_em)
    return manter


def registrar_regra(conn: pg8000.native.Connection, regra: Regra) -> None:
    """Grava a regra na primeira execução; depois, confere que ela não mudou."""
    parametros = json.loads(_json(regra.parametros))
    rows = rows_as_dicts(
        conn,
        "SELECT descricao, parametros FROM feed.regra WHERE tipo = :tipo AND versao = :versao",
        tipo=regra.tipo,
        versao=regra.versao,
    )
    if not rows:
        conn.run(
            "INSERT INTO feed.regra (tipo, versao, descricao, parametros)"
            " VALUES (:tipo, :versao, :descricao, CAST(:parametros AS jsonb))",
            tipo=regra.tipo,
            versao=regra.versao,
            descricao=regra.descricao,
            parametros=_json(parametros),
        )
        return
    [gravada] = rows
    if gravada["descricao"] != regra.descricao or gravada["parametros"] != parametros:
        raise RegraAlterada(
            f"regra {regra.tipo} v{regra.versao} mudou; crie a versão {regra.versao + 1}"
        )


def _estados(conn: pg8000.native.Connection, tipo: str) -> list[Estado]:
    rows = rows_as_dicts(
        conn,
        "SELECT id::text AS id, chave_fato, regra_versao, status, motivo, publicado_em,"
        " revisado_em, valor, content_hash FROM feed.evento WHERE tipo = :tipo",
        tipo=tipo,
    )
    return [Estado(**row) for row in rows]


def _lotes(itens: list[Any]) -> Iterator[list[Any]]:
    for inicio in range(0, len(itens), _LOTE):
        yield itens[inicio : inicio + _LOTE]


_COLUNAS = """
  chave_fato text, chave_dedup text, ocorrido_em timestamptz, fonte_url text,
  fonte_dado_em timestamptz, titulo text, resumo text, payload jsonb, valor numeric,
  visibilidade text, status text, motivo text, publicado_em timestamptz,
  revisado_em timestamptz, content_hash text
"""

_INSERIR = f"""
INSERT INTO feed.evento (tipo, regra_versao, chave_fato, chave_dedup, ocorrido_em, fonte_url,
  fonte_dado_em, titulo, resumo, payload, valor, visibilidade, status, motivo, publicado_em,
  revisado_em, content_hash)
SELECT CAST(:tipo AS text), CAST(:versao AS smallint), x.chave_fato, x.chave_dedup,
  x.ocorrido_em, x.fonte_url, x.fonte_dado_em, x.titulo, x.resumo, x.payload, x.valor,
  x.visibilidade, x.status, x.motivo, x.publicado_em, x.revisado_em, x.content_hash
FROM jsonb_to_recordset(CAST(:dados AS jsonb)) AS x({_COLUNAS})
"""  # noqa: S608 - constantes do módulo

_ATUALIZAR = f"""
UPDATE feed.evento e SET ocorrido_em = x.ocorrido_em, fonte_url = x.fonte_url,
  fonte_dado_em = x.fonte_dado_em, titulo = x.titulo, resumo = x.resumo, payload = x.payload,
  valor = x.valor, visibilidade = x.visibilidade, status = x.status, motivo = x.motivo,
  publicado_em = x.publicado_em, revisado_em = x.revisado_em, content_hash = x.content_hash,
  atualizado_em = now()
FROM jsonb_to_recordset(CAST(:dados AS jsonb)) AS x(id uuid, {_COLUNAS})
WHERE e.id = x.id
"""  # noqa: S608 - constantes do módulo

_ALVOS = """
INSERT INTO feed.evento_alvo (evento_id, alvo_tipo, alvo_id, papel)
SELECT e.id, x.alvo_tipo, x.alvo_id, x.papel
FROM jsonb_to_recordset(CAST(:dados AS jsonb))
  AS x(chave_dedup text, alvo_tipo text, alvo_id text, papel text)
JOIN feed.evento e ON e.chave_dedup = x.chave_dedup
ON CONFLICT DO NOTHING
"""

_APAGAR_ALVOS = """
DELETE FROM feed.evento_alvo
WHERE evento_id IN (SELECT CAST(jsonb_array_elements_text(CAST(:ids AS jsonb)) AS uuid))
"""

_ARQUIVAR = """
UPDATE feed.evento SET status = 'arquivado', motivo = CAST(:motivo AS text), atualizado_em = now()
WHERE id IN (SELECT CAST(jsonb_array_elements_text(CAST(:ids AS jsonb)) AS uuid))
"""


def _linha(regra: Regra, evento: Evento, decisao: Decisao, content_hash: str) -> dict[str, Any]:
    return {
        "chave_fato": evento.chave,
        "chave_dedup": regra.chave_dedup(evento.chave),
        "ocorrido_em": evento.ocorrido_em,
        "fonte_url": evento.fonte_url,
        "fonte_dado_em": evento.fonte_dado_em,
        "titulo": evento.titulo,
        "resumo": evento.resumo,
        "payload": evento.payload,
        "valor": None if evento.valor is None else str(evento.valor),
        "visibilidade": evento.visibilidade,
        "status": decisao.status,
        "motivo": decisao.motivo,
        "publicado_em": decisao.publicado_em,
        "revisado_em": decisao.revisado_em,
        "content_hash": content_hash,
    }


def _alvos(regra: Regra, evento: Evento) -> list[dict[str, str]]:
    chave = regra.chave_dedup(evento.chave)
    return [
        {"chave_dedup": chave, "alvo_tipo": a.tipo, "alvo_id": a.id, "papel": a.papel}
        for a in sorted(set(evento.alvos), key=lambda a: (a.tipo, a.id, a.papel))
    ]


def processar(
    conn: pg8000.native.Connection,
    gerador: Gerador,
    *,
    carga_inicial: bool | None = None,
    agora: datetime | None = None,
) -> Stats:
    """Gera os eventos de uma regra e grava só a diferença em feed.evento.

    carga_inicial=None decide sozinho: é carga inicial quando o tipo ainda não
    tem nenhum evento gravado.
    """
    regra = gerador.regra
    agora = agora or datetime.now(UTC)
    stats = Stats(tipo=regra.tipo, versao=regra.versao)

    eventos: dict[str, Evento] = {}
    for evento in gerador.gerar(conn):
        if evento.chave in eventos:
            raise ValueError(f"{regra.tipo}: chave repetida {evento.chave}")
        eventos[evento.chave] = evento
    stats.gerados = len(eventos)

    with transaction(conn):
        registrar_regra(conn, regra)
        estados = _estados(conn, regra.tipo)
        if any(e.regra_versao > regra.versao for e in estados):
            raise RegraAlterada(f"{regra.tipo}: já há eventos de versão maior que {regra.versao}")
        stats.carga_inicial = not estados if carga_inicial is None else carga_inicial
        atuais = {e.chave_fato: e for e in estados if e.regra_versao == regra.versao}
        anteriores: dict[str, Estado] = {}
        for estado in sorted(estados, key=lambda e: e.regra_versao):
            if estado.regra_versao < regra.versao and estado.status != ARQUIVADO:
                anteriores[estado.chave_fato] = estado

        novos: list[dict[str, Any]] = []
        alterados: list[dict[str, Any]] = []
        alvos: list[dict[str, str]] = []
        for chave, evento in eventos.items():
            content_hash = evento.content_hash()
            atual = atuais.get(chave)
            if atual is None:
                decisao = decidir_novo(
                    regra,
                    evento,
                    carga_inicial=stats.carga_inicial,
                    anterior=anteriores.get(chave),
                    agora=agora,
                )
                novos.append(_linha(regra, evento, decisao, content_hash))
            elif atual.content_hash != content_hash:
                decisao = decidir_alterado(regra, evento, atual, agora=agora)
                alterados.append({"id": atual.id, **_linha(regra, evento, decisao, content_hash)})
            else:
                continue
            alvos.extend(_alvos(regra, evento))
            stats.segurados += decisao.status == SEGURADO

        ausentes = []
        if regra.arquivar_ausentes:
            ausentes = [
                e.id for c, e in atuais.items() if c not in eventos and e.status != ARQUIVADO
            ]
        substituidos = [e.id for e in anteriores.values()]

        for lote in _lotes(novos):
            conn.run(_INSERIR, tipo=regra.tipo, versao=regra.versao, dados=_json(lote))
        for lote in _lotes(alterados):
            conn.run(_APAGAR_ALVOS, ids=_json([linha["id"] for linha in lote]))
            conn.run(_ATUALIZAR, dados=_json(lote))
        for lote in _lotes(alvos):
            conn.run(_ALVOS, dados=_json(lote))
        for motivo, ids in ((FONTE_REMOVEU, ausentes), (REGRA_SUBSTITUIDA, substituidos)):
            for lote in _lotes(ids):
                conn.run(_ARQUIVAR, motivo=motivo, ids=_json(lote))

    stats.novos, stats.alterados = len(novos), len(alterados)
    stats.arquivados, stats.substituidos = len(ausentes), len(substituidos)
    logger.info("eventos: %s", stats)
    return stats


def liberar_carga_inicial(conn: pg8000.native.Connection, tipo: str | None = None) -> int:
    """Publica os eventos segurados pela carga inicial. Os segurados por valor continuam."""
    rows = conn.run(
        "UPDATE feed.evento SET status = 'publicado', motivo = NULL,"
        " publicado_em = coalesce(publicado_em, now()), revisado_em = now(),"
        " revisado_por = 'vp-ingest', atualizado_em = now()"
        " WHERE status = 'segurado' AND motivo = 'carga_inicial'"
        " AND (CAST(:tipo AS text) IS NULL OR tipo = CAST(:tipo AS text)) RETURNING 1",
        tipo=tipo,
    )
    return len(rows)


def resumo(conn: pg8000.native.Connection) -> list[dict[str, Any]]:
    """Contagem por tipo, versão, status e motivo, para conferência."""
    return rows_as_dicts(
        conn,
        "SELECT tipo, regra_versao, status, coalesce(motivo, '') AS motivo, count(*) AS eventos,"
        " sum(valor) AS valor FROM feed.evento GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4",
    )
