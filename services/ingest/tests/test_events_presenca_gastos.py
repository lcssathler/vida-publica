from datetime import date
from decimal import Decimal

from vida_publica_ingest.events.comum import reais
from vida_publica_ingest.events.presenca_gastos import fim_do_mes, incompleto


def test_mes_incompleto_ate_90_dias_depois_do_fim():
    assert fim_do_mes(2026, 2) == date(2026, 2, 28)
    assert fim_do_mes(2024, 2) == date(2024, 2, 29)
    # junho termina em 30/06; o prazo vai até 28/09
    assert incompleto(2026, 6, hoje=date(2026, 9, 28))
    assert not incompleto(2026, 6, hoje=date(2026, 9, 29))
    assert incompleto(2026, 10, hoje=date(2026, 10, 14))


def test_reais_no_formato_brasileiro():
    assert reais(Decimal("1234567.8")) == "R$ 1.234.567,80"
    assert reais(Decimal("0.5")) == "R$ 0,50"
