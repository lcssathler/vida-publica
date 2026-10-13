from vida_publica_ingest.snapshot import row_id, sync, with_ids


class FakeTable:
    def __init__(self, existentes):
        self.existentes = existentes
        self.inseridas = []
        self.removidas = []
        self.restauradas = []

    def ids(self):
        return dict(self.existentes)

    def insert_many(self, items, *, raw_object_id):
        self.inseridas.extend(items)

    def mark_removed(self, ids):
        self.removidas.extend(ids)

    def restore(self, ids):
        self.restauradas.extend(ids)


def test_with_ids_numera_chaves_repetidas():
    ids = [i for i, _ in with_ids("x", [("a", 1), ("a", 2), ("b", 3)])]
    assert ids == [row_id("x", "a", 1), row_id("x", "a", 2), row_id("x", "b", 1)]
    assert len(set(ids)) == 3


def test_sync_aplica_a_diferenca():
    antiga, sumida, voltou = (row_id("x", k, 1) for k in ("antiga", "sumida", "voltou"))
    table = FakeTable({antiga: False, sumida: False, voltou: True})
    vistos = []
    stats = sync(
        table,
        with_ids("x", [("antiga", "A"), ("voltou", "V"), ("nova", "N")]),
        raw_object_id=None,
        on_new=vistos.append,
    )
    assert (stats.linhas, stats.novas, stats.removidas, stats.restauradas) == (3, 1, 1, 1)
    assert [item for _, item in table.inseridas] == ["N"] and vistos == ["N"]
    assert table.removidas == [sumida] and table.restauradas == [voltou]
