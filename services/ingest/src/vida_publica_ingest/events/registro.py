"""Geradores de eventos, na ordem em que o comando `eventos` os executa."""

from .engine import Gerador


def geradores() -> list[Gerador]:
    return []
