from vida_publica_ingest.config import Settings


def test_le_variaveis_com_prefixo(monkeypatch):
    monkeypatch.setenv("VP_S3_ENDPOINT", "http://s3.exemplo:9000")
    monkeypatch.setenv("VP_S3_SECRET_KEY", "valor-de-teste")
    settings = Settings()
    assert settings.s3_endpoint == "http://s3.exemplo:9000"
    assert settings.s3_secret_key.get_secret_value() == "valor-de-teste"


def test_segredo_nao_aparece_na_representacao(monkeypatch):
    monkeypatch.setenv("VP_S3_SECRET_KEY", "nao-mostrar")
    assert "nao-mostrar" not in repr(Settings())
