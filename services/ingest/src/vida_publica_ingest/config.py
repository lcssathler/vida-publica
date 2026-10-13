from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuração lida de variáveis de ambiente com prefixo VP_."""

    model_config = SettingsConfigDict(env_prefix="VP_", extra="ignore")

    s3_endpoint: str = "http://localhost:9000"
    s3_region: str = "us-east-1"
    s3_access_key: str = "vp_s3"
    s3_secret_key: SecretStr = SecretStr("")
    s3_bucket_raw: str = "vp-raw"

    db_host: str = "127.0.0.1"
    db_port: int = 5433
    db_name: str = "vida_publica"
    db_user: str = "vp_ingest"
    db_password: SecretStr = SecretStr("")

    # Chave do HMAC que transforma CPFs em hash. O CPF em si nunca é guardado.
    cpf_hash_key: SecretStr = SecretStr("")

    # Liga a coleta da frequência diária do Plenário no serviço legado da Câmara
    # (SitCamaraWS, XML), que traz as justificativas de ausência. Desligada por
    # padrão: o serviço é antigo e pode ser descontinuado sem aviso.
    camara_presenca_legado: bool = False

    # Identifica o coletor para os servidores das fontes oficiais.
    user_agent: str = Field(
        default="VidaPublica/0.1 (+https://github.com/lcssathler/vida-publica)",
    )
    http_timeout_seconds: float = 60.0
