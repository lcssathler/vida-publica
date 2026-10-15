"""Logs estruturados, Sentry e avisos de alerta (healthchecks.io).

Sem credenciais, nada sai da máquina: os logs registram tudo e os adaptadores
de fora ficam desligados, como o FCM na API. Nenhum dado pessoal vai ao
Sentry: sem variáveis locais nem corpo de requisição, e o que parece CPF é
trocado antes de enviar.
"""

import json
import logging
import re
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any, Protocol

import httpx
import sentry_sdk

from .config import Settings

logger = logging.getLogger(__name__)

_PARECE_CPF = re.compile(r"(?<![\d./-])(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})(?![\d/-]|\.\d)")


def sem_cpf(texto: str) -> str:
    return _PARECE_CPF.sub("[CPF removido]", texto)


class FormatoJson(logging.Formatter):
    """Uma linha JSON por registro: instante em UTC, nível, logger, mensagem e extras."""

    _PADRAO = frozenset(vars(logging.makeLogRecord({})).keys()) | {"message", "asctime"}

    def format(self, record: logging.LogRecord) -> str:
        linha: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "nivel": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for chave, valor in vars(record).items():
            if chave not in self._PADRAO and not chave.startswith("_"):
                linha[chave] = valor
        if record.exc_info:
            linha["erro"] = self.formatException(record.exc_info)
        return json.dumps(linha, ensure_ascii=False, default=str)


def configurar_logs(settings: Settings) -> None:
    handler = logging.StreamHandler()
    if settings.log_json:
        handler.setFormatter(FormatoJson())
    else:
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)
    logging.getLogger("httpx").setLevel(logging.WARNING)


def _sem_dados_pessoais(evento: dict[str, Any], _hint: dict[str, Any]) -> dict[str, Any]:
    evento.pop("request", None)
    evento.pop("user", None)
    for chave in ("message", "logentry"):
        valor = evento.get(chave)
        if isinstance(valor, str):
            evento[chave] = sem_cpf(valor)
        elif isinstance(valor, dict) and isinstance(valor.get("message"), str):
            valor["message"] = sem_cpf(valor["message"])
    for excecao in (evento.get("exception") or {}).get("values", []):
        if isinstance(excecao.get("value"), str):
            excecao["value"] = sem_cpf(excecao["value"])
    return evento


def iniciar_sentry(settings: Settings) -> bool:
    """Liga o Sentry quando há DSN. Devolve se ligou."""
    dsn = settings.sentry_dsn.get_secret_value()
    if not dsn:
        logger.info("Sentry desligado (sem VP_SENTRY_DSN)")
        return False
    sentry_sdk.init(
        dsn=dsn,
        environment=settings.ambiente,
        release=f"vida-publica-ingest@{_versao()}",
        traces_sample_rate=1.0,
        send_default_pii=False,
        include_local_variables=False,
        max_request_body_size="never",
        before_send=_sem_dados_pessoais,
    )
    logger.info("Sentry ligado", extra={"ambiente": settings.ambiente})
    return True


def _versao() -> str:
    from importlib.metadata import PackageNotFoundError, version

    try:
        return version("vida-publica-ingest")
    except PackageNotFoundError:
        return "dev"


@contextmanager
def transacao_do_job(nome: str) -> Iterator[None]:
    """Mede o job no Sentry (sem Sentry ligado, não faz nada)."""
    with sentry_sdk.start_transaction(op="job", name=nome):
        yield


# ---------------------------------------------------------------------------
# Avisos de alerta (porta e adaptadores)


class Alertador(Protocol):
    def aberto(self, chave: str, detalhe: dict[str, Any], lembrete: bool) -> None: ...

    def resolvido(self, chave: str, detalhe: dict[str, Any]) -> None: ...

    def situacao(self, nome: str, ok: bool, texto: str) -> None:
        """Sinal de vida de um conjunto (ex.: "fontes"): tudo certo ou com falha."""


class AlertadorLog:
    """Sempre ligado: o alerta fica no log estruturado."""

    def aberto(self, chave: str, detalhe: dict[str, Any], lembrete: bool) -> None:
        logger.warning(
            "alerta aberto" if not lembrete else "alerta continua aberto",
            extra={"alerta": chave, **detalhe},
        )

    def resolvido(self, chave: str, detalhe: dict[str, Any]) -> None:
        logger.info("alerta resolvido", extra={"alerta": chave, **detalhe})

    def situacao(self, nome: str, ok: bool, texto: str) -> None:
        logger.info("sinal de vida", extra={"sinal": nome, "ok": ok})


class AlertadorSentry:
    """Cada alerta aberto vira um aviso no Sentry, agrupado por chave."""

    def aberto(self, chave: str, detalhe: dict[str, Any], lembrete: bool) -> None:
        with sentry_sdk.new_scope() as escopo:
            escopo.fingerprint = ["alerta", chave]
            escopo.set_tag("alerta", chave)
            escopo.set_context("alerta", detalhe)
            sentry_sdk.capture_message(f"Alerta: {chave}", level="warning")

    def resolvido(self, chave: str, detalhe: dict[str, Any]) -> None:
        return None

    def situacao(self, nome: str, ok: bool, texto: str) -> None:
        return None


class AlertadorHealthchecks:
    """healthchecks.io: um check por conjunto (slug), criado no primeiro ping.

    O check "fontes" recebe sucesso quando todas as fontes estão no prazo e
    /fail quando alguma passou, com a lista no corpo; o healthchecks.io avisa
    na mudança e também quando o vigia para de pingar.
    """

    def __init__(self, ping_key: str, base_url: str, client: httpx.Client | None = None) -> None:
        self._base = f"{base_url.rstrip('/')}/{ping_key}"
        self._client = client or httpx.Client(timeout=10)

    def aberto(self, chave: str, detalhe: dict[str, Any], lembrete: bool) -> None:
        return None

    def resolvido(self, chave: str, detalhe: dict[str, Any]) -> None:
        return None

    def situacao(self, nome: str, ok: bool, texto: str) -> None:
        url = f"{self._base}/{nome}{'' if ok else '/fail'}?create=1"
        try:
            resposta = self._client.post(url, content=texto.encode()[:10_000])
            resposta.raise_for_status()
        except httpx.HTTPError as erro:
            # Sem a chave na mensagem: só o tipo do erro e o status.
            status = getattr(getattr(erro, "response", None), "status_code", None)
            logger.error(
                "ping ao healthchecks.io falhou",
                extra={"sinal": nome, "erro": type(erro).__name__, "status": status},
            )


class Alertadores:
    """Envia a todos os adaptadores ligados; a falha de um não para os outros."""

    def __init__(self, adaptadores: Sequence[Alertador]) -> None:
        self._adaptadores = list(adaptadores)

    def _todos(self, metodo: str, *args: Any) -> None:
        for adaptador in self._adaptadores:
            try:
                getattr(adaptador, metodo)(*args)
            except Exception:
                logger.exception(
                    "adaptador de alerta falhou", extra={"adaptador": type(adaptador).__name__}
                )

    def aberto(self, chave: str, detalhe: dict[str, Any], lembrete: bool) -> None:
        self._todos("aberto", chave, detalhe, lembrete)

    def resolvido(self, chave: str, detalhe: dict[str, Any]) -> None:
        self._todos("resolvido", chave, detalhe)

    def situacao(self, nome: str, ok: bool, texto: str) -> None:
        self._todos("situacao", nome, ok, texto)


def alertadores(settings: Settings, sentry_ligado: bool) -> Alertadores:
    lista: list[Alertador] = [AlertadorLog()]
    if sentry_ligado:
        lista.append(AlertadorSentry())
    ping_key = settings.healthchecks_ping_key.get_secret_value()
    if ping_key:
        lista.append(AlertadorHealthchecks(ping_key, settings.healthchecks_url))
    else:
        logger.info("healthchecks.io desligado (sem VP_HEALTHCHECKS_PING_KEY)")
    return Alertadores(lista)
