"""Geradores de eventos, na ordem em que o comando `eventos` os executa."""

from . import proposicoes, votacoes
from .engine import Gerador


def geradores() -> list[Gerador]:
    return [*votacoes.GERADORES, *proposicoes.GERADORES]
