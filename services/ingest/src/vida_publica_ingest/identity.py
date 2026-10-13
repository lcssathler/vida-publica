"""Identificadores sensíveis viram hash antes de chegar ao banco.

O CPF nunca é guardado em claro: só o HMAC-SHA256 com uma chave secreta, o
que permite casar a mesma pessoa entre fontes sem expor o número.
"""

import hashlib
import hmac
import re
import unicodedata

_DIGITS = re.compile(r"\D")


def hash_document(value: str | None, key: str, *, length: int) -> str | None:
    """HMAC de um documento numérico (CPF: 11 dígitos). Valores inválidos viram None."""
    if not key:
        raise ValueError("chave de hash não configurada (VP_CPF_HASH_KEY)")
    digits = _DIGITS.sub("", value or "")
    if len(digits) != length or len(set(digits)) == 1:
        return None
    return hmac.new(key.encode(), digits.encode(), hashlib.sha256).hexdigest()


def hash_cpf(value: str | None, key: str) -> str | None:
    return hash_document(value, key, length=11)


def normalize_name(value: str | None) -> str:
    """Nome em caixa alta, sem acentos e com espaços simples, para comparar entre fontes."""
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(char for char in text if not unicodedata.combining(char))
    return " ".join(text.upper().split())
