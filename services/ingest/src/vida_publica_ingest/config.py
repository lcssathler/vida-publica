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

    # Identifica o coletor para os servidores das fontes oficiais.
    user_agent: str = Field(
        default="VidaPublica/0.1 (+https://github.com/lcssathler/vida-publica)",
    )
    http_timeout_seconds: float = 60.0
