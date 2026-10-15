"""Adaptador S3: funciona com AWS S3, Cloudflare R2, RustFS ou qualquer serviço compatível."""

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from ..config import Settings


def s3_client_kwargs(settings: Settings) -> dict:
    """Argumentos do cliente S3.

    Sem endpoint, é o S3 da AWS; sem segredo, as credenciais vêm da cadeia
    padrão (em produção, o papel da máquina virtual), sem chave em variável.
    """
    kwargs: dict = {
        "region_name": settings.s3_region,
        "config": Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    }
    if settings.s3_endpoint:
        kwargs["endpoint_url"] = settings.s3_endpoint
    segredo = settings.s3_secret_key.get_secret_value()
    if segredo:
        kwargs["aws_access_key_id"] = settings.s3_access_key
        kwargs["aws_secret_access_key"] = segredo
    return kwargs


class S3RawStorage:
    def __init__(self, settings: Settings) -> None:
        self._bucket = settings.s3_bucket_raw
        self._client = boto3.client("s3", **s3_client_kwargs(settings))

    def ensure_bucket(self) -> None:
        """Cria o bucket de dados brutos se ainda não existir."""
        try:
            self._client.head_bucket(Bucket=self._bucket)
        except ClientError:
            self._client.create_bucket(Bucket=self._bucket)

    def put(self, key: str, content: bytes, content_type: str) -> None:
        self._client.put_object(
            Bucket=self._bucket, Key=key, Body=content, ContentType=content_type
        )

    def get(self, key: str) -> bytes:
        response = self._client.get_object(Bucket=self._bucket, Key=key)
        return response["Body"].read()
