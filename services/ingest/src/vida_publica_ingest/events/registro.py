"""Geradores de eventos, na ordem em que o comando `eventos` os executa."""

from . import dinheiro_campanha, presenca_gastos, proposicoes, votacoes
from .engine import Gerador


def geradores() -> list[Gerador]:
    return [
        *votacoes.GERADORES,
        *proposicoes.GERADORES,
        *presenca_gastos.GERADORES,
        *dinheiro_campanha.GERADORES,
    ]
