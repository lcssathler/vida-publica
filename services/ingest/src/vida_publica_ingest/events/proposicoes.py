"""Eventos de proposições: pauta, etapas de tramitação, mudança de regime e proposta parada."""

import re
from collections.abc import Iterator
from datetime import date, datetime, timedelta
from itertools import pairwise
from typing import Any

import pg8000.native

from ..adapters.postgres import rows_as_dicts
from .comum import CAMARA_API, SENADO_API, Indices, carregar_indices, resumir
from .engine import BRT, Alvo, Evento, Gerador, Regra, momento

DIAS_PARADA = 180  # decisão de produto

ROTULOS = {
    "apresentacao": "apresentada",
    "envio_comissoes": "enviada às comissões",
    "relator": "relator designado",
    "parecer": "parecer",
    "votacao_plenario": "votação no Plenário",
    "envio_outra_casa": "enviada à outra Casa",
    "sancao": "sanção",
    "veto": "veto",
    "promulgacao": "promulgação",
    "arquivamento": "arquivada",
    "desarquivamento": "desarquivada",
}
# Etapas depois das quais a proposta não "fica parada": acabou ou foi arquivada.
FINAIS = {"arquivamento", "sancao", "promulgacao"}

# Câmara: código do tipo de tramitação (/referencias/tramitacoes) → etapa.
CAMARA_CODIGOS = {
    "100": "apresentacao",
    "110": "envio_comissoes",
    "320": "relator",
    "327": "relator",
    "322": "parecer",
    "335": "parecer",
    "336": "parecer",
    "1235": "votacao_plenario",
    "1236": "votacao_plenario",
    "251": "sancao",
    "1012": "veto",
    "502": "arquivamento",
    "503": "desarquivamento",
    "640": "desarquivamento",
}
# Senado: situação do informe legislativo → etapa (algumas pedem confirmação no texto).
SENADO_SITUACOES = {
    "APRVPAR": "parecer",
    "APRCD(DT)": "parecer",
    "RMCD": "envio_outra_casa",
    "RMCD(MPV)": "envio_outra_casa",
    "TNJRVETO": "veto",
    "ARQV": "arquivamento",
}

REGRA_TRAMITACAO = Regra(
    "tramitacao",
    1,
    "Etapas selecionadas da tramitação de proposições na Câmara e no Senado: apresentação,"
    " envio às comissões, designação de relator, parecer, votação no Plenário, envio à outra"
    " Casa, sanção, veto, promulgação, arquivamento e desarquivamento. A entrada em pauta é o"
    " evento pauta; a mudança de regime, o evento mudanca_regime.",
    {
        "etapas": sorted(ROTULOS),
        "camara_codigos": CAMARA_CODIGOS,
        "senado_situacoes": SENADO_SITUACOES,
    },
)
# A coluna de regime das tramitações da Câmara repete o regime atual em todas as linhas:
# a mudança vem do marco explícito (aprovação de urgência).
CAMARA_URGENCIA = ("196",)
REGRA_REGIME = Regra(
    "mudanca_regime",
    1,
    "Proposição que passa a tramitar em regime de urgência: na Câmara, a tramitação de"
    " aprovação de urgência (código 196); no Senado, o informe que registra a aprovação de"
    " requerimento de urgência. Um evento por proposição e dia.",
    {
        "camara_codigos": list(CAMARA_URGENCIA),
        "senado_texto": "requerimento ... urgência + aprovad",
    },
)
REGRA_PARADA = Regra(
    "proposta_parada",
    1,
    "Proposição sem nenhuma tramitação por 180 dias ou mais. O evento ocorre no 180º dia;"
    " quando a proposição volta a tramitar, o evento registra a data da retomada. Não vale"
    " depois de arquivamento, sanção ou promulgação, nem para proposição que não tramita mais.",
    {"dias": DIAS_PARADA, "etapas_finais": sorted(FINAIS)},
)
REGRA_PAUTA = Regra(
    "pauta",
    1,
    "Proposição na pauta de sessão deliberativa do Plenário ou de reunião deliberativa de"
    " comissão da Câmara ou do Senado, inclusive agenda futura. Sessão ou reunião cancelada ou"
    " não realizada não gera evento.",
    {"situacoes_ignoradas": ["Cancelada", "Sessão não realizada", "Não Realizada"]},
)

_ESPACOS = re.compile(r"\s+")


def _texto(valor: str | None) -> str:
    return _ESPACOS.sub(" ", valor or "").strip()


def classificar(
    casa: str, cod_tipo: str | None, situacao: str | None, descricao: str | None,
    despacho: str | None,
) -> str | None:  # fmt: skip
    """Etapa da tramitação que vira evento, ou None."""
    desc = _texto(descricao).lower()
    if casa == "camara":
        desp = _texto(despacho).lower()
        if "remessa ao senado" in desp or "envio ao senado" in desp:
            return "envio_outra_casa"
        if "à sanção" in desp:
            return "sancao"
        if "promulga" in desp:
            return "promulgacao"
        etapa = CAMARA_CODIGOS.get(cod_tipo or "")
        if etapa == "envio_comissoes" and not desp.startswith(("à comiss", "às comiss")):
            return None  # distribuição por apensação, sem envio a comissão
        return etapa
    situacao = (situacao or "").strip()
    if situacao == "TNJR":
        return "promulgacao" if "promulgad" in desc else "sancao"
    if situacao.startswith("APRVD") or situacao == "RJTDA":
        return "votacao_plenario" if "sessão deliberativa" in desc else None
    if situacao in SENADO_SITUACOES:
        return SENADO_SITUACOES[situacao]
    if desc.startswith(("distribuído ao senador", "distribuído à senadora")):
        return "relator"
    if desc.startswith("a matéria vai à"):
        return "envio_comissoes"
    if desc.startswith("remetido ofício") and "câmara dos deputados" in desc:
        return "envio_outra_casa"
    if "à sanção" in desc:
        return "sancao"
    if "desarquiv" in desc:
        return "desarquivamento"
    if desc.startswith("arquivad"):
        return "arquivamento"
    return None


_TRAMITACOES = """
SELECT p.id::text AS proposicao_id, p.casa, p.id_fonte AS prop_fonte, p.identificacao,
  p.tramitando, t.id_fonte, t.sequencia, t.data_hora, t.sigla_orgao, t.descricao, t.cod_tipo,
  t.situacao, t.despacho, t.regime, t.relator_id_fonte, r.fetched_at
FROM canon.proposicao_tramitacao t
JOIN canon.proposicao p ON p.id = t.proposicao_id
LEFT JOIN raw.raw_object r ON r.id = p.raw_object_id
ORDER BY p.id, t.data_hora, t.sequencia, t.id_fonte
"""


def _fonte_url(casa: str, prop_fonte: str) -> str:
    if casa == "camara":
        return f"{CAMARA_API}/proposicoes/{prop_fonte}/tramitacoes"
    return f"{SENADO_API}/processo/{prop_fonte}"


def _alvos(indices: Indices, row: dict[str, Any], relator: bool = False) -> tuple[Alvo, ...]:
    alvos = [
        *indices.alvos_proposicao(row["proposicao_id"]),
        *indices.autores(row["proposicao_id"]),
    ]
    if relator and row.get("relator_id_fonte"):
        alvos += indices.pessoa(row["casa"], row["relator_id_fonte"], "relator")
    return tuple(alvos)


def _por_proposicao(conn: pg8000.native.Connection) -> Iterator[list[dict[str, Any]]]:
    atual: list[dict[str, Any]] = []
    for row in rows_as_dicts(conn, _TRAMITACOES):
        if atual and atual[0]["proposicao_id"] != row["proposicao_id"]:
            yield atual
            atual = []
        atual.append(row)
    if atual:
        yield atual


def gerar_tramitacoes(conn: pg8000.native.Connection) -> Iterator[Evento]:
    indices = carregar_indices(conn)
    for grupo in _por_proposicao(conn):
        for row in grupo:
            etapa = classificar(
                row["casa"], row["cod_tipo"], row["situacao"], row["descricao"], row["despacho"]
            )
            if etapa is None:
                continue
            texto = row["despacho"] if row["casa"] == "camara" else row["descricao"]
            yield Evento(
                chave=f"{row['casa']}:{row['prop_fonte']}:{row['id_fonte']}",
                ocorrido_em=momento(row["data_hora"]),
                titulo=f"{row['identificacao']}: {ROTULOS[etapa]}",
                resumo=resumir(texto or row["descricao"]),
                payload={
                    "casa": row["casa"],
                    "etapa": etapa,
                    "proposicao": row["identificacao"],
                    "orgao": row["sigla_orgao"],
                    "descricao": _texto(row["descricao"]),
                },
                alvos=_alvos(indices, row, relator=etapa in ("relator", "parecer")),
                fonte_url=_fonte_url(row["casa"], row["prop_fonte"]),
                fonte_dado_em=row["fetched_at"],
            )
    yield from _apresentacoes_senado(conn, indices)


def _apresentacoes_senado(conn: pg8000.native.Connection, indices: Indices) -> Iterator[Evento]:
    """No Senado a apresentação não vem como informe: usa a data da proposição.

    Só para matérias iniciadas no Senado ou no Congresso; as da Câmara já têm a sua.
    """
    rows = rows_as_dicts(
        conn,
        "SELECT p.id::text AS proposicao_id, p.casa, p.id_fonte, p.identificacao, p.ementa,"
        " p.apresentada_em, r.fetched_at FROM canon.proposicao p"
        " LEFT JOIN raw.raw_object r ON r.id = p.raw_object_id"
        " WHERE p.casa = 'senado' AND p.apresentada_em IS NOT NULL"
        " AND coalesce(p.casa_iniciadora, '') <> 'CD'",
    )
    for row in rows:
        yield Evento(
            chave=f"senado:{row['id_fonte']}:apresentacao",
            ocorrido_em=momento(row["apresentada_em"]),
            titulo=f"{row['identificacao']}: {ROTULOS['apresentacao']}",
            resumo=resumir(row["ementa"]),
            payload={"casa": "senado", "etapa": "apresentacao", "proposicao": row["identificacao"]},
            alvos=_alvos(indices, row),
            fonte_url=_fonte_url("senado", row["id_fonte"]),
            fonte_dado_em=row["fetched_at"],
        )


_URGENCIA_SENADO = re.compile(r"requerimento.{0,40}urg[eê]ncia", re.IGNORECASE | re.DOTALL)


def urgencia(casa: str, cod_tipo: str | None, descricao: str | None) -> bool:
    """Tramitação que muda o regime para urgência."""
    if casa == "camara":
        return cod_tipo in CAMARA_URGENCIA
    texto = _texto(descricao)
    return bool(_URGENCIA_SENADO.search(texto)) and "aprovad" in texto.lower()


def gerar_mudancas_regime(conn: pg8000.native.Connection) -> Iterator[Evento]:
    indices = carregar_indices(conn)
    for grupo in _por_proposicao(conn):
        dias: set[date] = set()
        for row in grupo:
            dia = row["data_hora"].date()
            if dia in dias or not urgencia(row["casa"], row["cod_tipo"], row["descricao"]):
                continue
            dias.add(dia)  # a Câmara registra a aprovação e a alteração do regime
            yield Evento(
                chave=f"{row['casa']}:{row['prop_fonte']}:{row['id_fonte']}",
                ocorrido_em=momento(row["data_hora"]),
                titulo=f"{row['identificacao']}: passa a tramitar em regime de urgência",
                resumo=resumir(row["despacho"] or row["descricao"]),
                payload={
                    "casa": row["casa"],
                    "proposicao": row["identificacao"],
                    "para": "urgência",
                    "regime_atual": _texto(row["regime"]) or None,
                },
                alvos=_alvos(indices, row),
                fonte_url=_fonte_url(row["casa"], row["prop_fonte"]),
                fonte_dado_em=row["fetched_at"],
            )


def paradas(
    datas: list[tuple[date, str | None]], *, hoje: date, tramitando: bool | None
) -> list[tuple[date, date | None]]:
    """Intervalos de 180 dias ou mais sem tramitação: (início, retomada ou None).

    datas: (data, etapa) de cada tramitação, em ordem. Depois de etapa final não conta;
    o intervalo em aberto só conta se a proposição ainda tramita.
    """
    resultado = []
    limite = timedelta(days=DIAS_PARADA)
    for (inicio, etapa), (fim, _) in pairwise(datas):
        if etapa not in FINAIS and fim - inicio >= limite:
            resultado.append((inicio, fim))
    if datas:
        inicio, etapa = datas[-1]
        if etapa not in FINAIS and tramitando is not False and hoje - inicio >= limite:
            resultado.append((inicio, None))
    return resultado


def gerar_paradas(conn: pg8000.native.Connection, hoje: date | None = None) -> Iterator[Evento]:
    indices = carregar_indices(conn)
    hoje = hoje or datetime.now(BRT).date()
    for grupo in _por_proposicao(conn):
        por_dia: dict[date, tuple[str | None, dict[str, Any]]] = {}
        for row in grupo:
            etapa = classificar(
                row["casa"], row["cod_tipo"], row["situacao"], row["descricao"], row["despacho"]
            )
            dia = row["data_hora"].date()
            if dia not in por_dia or etapa is not None:
                por_dia[dia] = (etapa, row)
        datas = sorted((dia, etapa) for dia, (etapa, _) in por_dia.items())
        primeira = grupo[0]
        for inicio, retomada in paradas(datas, hoje=hoje, tramitando=primeira["tramitando"]):
            ultima = por_dia[inicio][1]
            descricao = _texto(ultima["descricao"]).rstrip(".")
            resumo = f"Última tramitação em {inicio:%d/%m/%Y}: {descricao}."
            if retomada:
                resumo += f" Voltou a tramitar em {retomada:%d/%m/%Y}."
            yield Evento(
                chave=f"{primeira['casa']}:{primeira['prop_fonte']}:{inicio:%Y-%m-%d}",
                ocorrido_em=momento(inicio + timedelta(days=DIAS_PARADA)),
                titulo=f"{primeira['identificacao']}: {DIAS_PARADA} dias sem tramitação",
                resumo=resumir(resumo),
                payload={
                    "casa": primeira["casa"],
                    "proposicao": primeira["identificacao"],
                    "desde": inicio,
                    "retomada_em": retomada,
                    "dias": (retomada - inicio).days if retomada else None,
                },
                alvos=_alvos(indices, primeira),
                fonte_url=_fonte_url(primeira["casa"], primeira["prop_fonte"]),
                fonte_dado_em=primeira["fetched_at"],
            )


_IGNORAR = tuple(REGRA_PAUTA.parametros["situacoes_ignoradas"])

# Na pauta da Câmara o item costuma ser o parecer ou o requerimento; a proposição
# principal vem em proposicao_relacionada_id.
_PAUTA_CAMARA = """
SELECT DISTINCT ON (e.id, coalesce(i.proposicao_relacionada_id, i.proposicao_id))
  e.id AS id_evento, e.inicio, e.sigla_orgao, e.situacao,
  coalesce(i.proposicao_relacionada_id, i.proposicao_id) AS principal_id,
  i.proposicao_id AS item_id, i.regime, i.relator_id, i.titulo, i.proposicao_ementa,
  r.fetched_at
FROM canon.camara_pauta_item i
JOIN canon.camara_evento e ON e.id = i.id_evento
LEFT JOIN raw.raw_object r ON r.id = e.raw_object_id
WHERE i.proposicao_id IS NOT NULL
ORDER BY e.id, coalesce(i.proposicao_relacionada_id, i.proposicao_id), i.posicao
"""

_PAUTA_SENADO_PLENARIO = """
SELECT DISTINCT ON (s.codigo, i.codigo_materia) s.codigo, s.data, s.situacao, s.tipo,
  i.codigo_materia, i.identificacao, i.ementa, r.fetched_at
FROM canon.senado_pauta_item i
JOIN canon.senado_sessao s ON s.codigo = i.codigo_sessao
LEFT JOIN raw.raw_object r ON r.id = s.raw_object_id
WHERE i.codigo_materia IS NOT NULL
ORDER BY s.codigo, i.codigo_materia, i.posicao
"""

_PAUTA_SENADO_COMISSAO = """
SELECT DISTINCT ON (m.codigo, i.id_processo) m.codigo, m.inicio, m.situacao, m.sigla_colegiado,
  i.id_processo, i.identificacao, i.ementa, i.relator_codigo, r.fetched_at
FROM canon.senado_reuniao_item i
JOIN canon.senado_reuniao m ON m.codigo = i.codigo_reuniao
LEFT JOIN raw.raw_object r ON r.id = m.raw_object_id
WHERE i.id_processo IS NOT NULL
ORDER BY m.codigo, i.id_processo, i.posicao
"""


def _onde(casa: str, orgao: str | None) -> str:
    nome_casa = "da Câmara" if casa == "camara" else "do Senado"
    if orgao in (None, "PLEN"):
        return f"do Plenário {nome_casa}"
    return f"da {orgao} {nome_casa}"


def _evento_pauta(
    indices: Indices, *, casa: str, chave: str, quando: date | datetime, orgao: str | None,
    proposicao: tuple[str, str] | None, ident: str | None, ementa: str | None,
    relator: list[Alvo], fonte_url: str, fonte_dado_em: datetime | None,
    extra: dict[str, Any],
) -> Evento:  # fmt: skip
    proposicao_id, ident = proposicao or (None, ident)
    alvos = [*relator]
    if proposicao_id:
        alvos += [*indices.alvos_proposicao(proposicao_id), *indices.autores(proposicao_id)]
    dia = quando.date() if isinstance(quando, datetime) else quando
    return Evento(
        chave=chave,
        ocorrido_em=momento(quando),
        titulo=f"{ident or 'Proposição'} na pauta {_onde(casa, orgao)} em {dia:%d/%m/%Y}",
        resumo=resumir(ementa),
        payload={"casa": casa, "orgao": orgao or "PLEN", "proposicao": ident, **extra},
        alvos=tuple(alvos),
        fonte_url=fonte_url,
        fonte_dado_em=fonte_dado_em,
    )


def gerar_pautas(conn: pg8000.native.Connection) -> Iterator[Evento]:
    indices = carregar_indices(conn)
    for row in rows_as_dicts(conn, _PAUTA_CAMARA):
        if row["situacao"] in _IGNORAR:
            continue
        yield _evento_pauta(
            indices,
            casa="camara",
            chave=f"camara:{row['id_evento']}:{row['principal_id']}",
            quando=row["inicio"],
            orgao=row["sigla_orgao"],
            proposicao=indices.proposicao("camara", row["principal_id"]),
            ident=row["titulo"],
            ementa=row["proposicao_ementa"],
            relator=indices.pessoa("camara", row["relator_id"], "relator")
            if row["relator_id"]
            else [],
            fonte_url=f"{CAMARA_API}/eventos/{row['id_evento']}/pauta",
            fonte_dado_em=row["fetched_at"],
            extra={"evento_id": row["id_evento"], "item": row["item_id"], "regime": row["regime"]},
        )
    for row in rows_as_dicts(conn, _PAUTA_SENADO_PLENARIO):
        if row["situacao"] in _IGNORAR:
            continue
        yield _evento_pauta(
            indices,
            casa="senado",
            chave=f"senado:sessao:{row['codigo']}:{row['codigo_materia']}",
            quando=row["data"],
            orgao=None,
            proposicao=indices.materia(row["codigo_materia"]),
            ident=row["identificacao"],
            ementa=row["ementa"],
            relator=[],
            fonte_url=f"{SENADO_API}/plenario/agenda/mes/{row['data']:%Y%m}01",
            fonte_dado_em=row["fetched_at"],
            extra={"sessao": row["codigo"]},
        )
    for row in rows_as_dicts(conn, _PAUTA_SENADO_COMISSAO):
        if row["situacao"] in _IGNORAR:
            continue
        dia = row["inicio"].date()
        yield _evento_pauta(
            indices,
            casa="senado",
            chave=f"senado:reuniao:{row['codigo']}:{row['id_processo']}",
            quando=row["inicio"],
            orgao=row["sigla_colegiado"],
            proposicao=indices.proposicao("senado", row["id_processo"]),
            ident=row["identificacao"],
            ementa=row["ementa"],
            relator=indices.pessoa("senado", row["relator_codigo"], "relator")
            if row["relator_codigo"]
            else [],
            fonte_url=f"{SENADO_API}/comissao/agenda/{dia:%Y%m%d}/{dia:%Y%m%d}",
            fonte_dado_em=row["fetched_at"],
            extra={"reuniao": row["codigo"]},
        )


GERADORES = [
    Gerador(REGRA_PAUTA, gerar_pautas),
    Gerador(REGRA_TRAMITACAO, gerar_tramitacoes),
    Gerador(REGRA_REGIME, gerar_mudancas_regime),
    Gerador(REGRA_PARADA, gerar_paradas),
]
