import argparse
import logging
import sys

from .adapters.postgres import PgJobRecorder, PgRawRegistry, connect
from .adapters.s3 import S3RawStorage
from .config import Settings
from .http import SourceClient
from .jobs import run_job
from .sources import camara_deputados


def _check_storage(settings: Settings) -> int:
    storage = S3RawStorage(settings)
    storage.ensure_bucket()
    print(f"armazenamento ok: bucket {settings.s3_bucket_raw} em {settings.s3_endpoint}")
    return 0


def _check_db(settings: Settings) -> int:
    conn = connect(settings)
    try:
        [[collected]] = conn.run("SELECT count(*) FROM raw.raw_object")
    finally:
        conn.close()
    print(f"banco ok: {collected} coletas registradas, usuário {settings.db_user}")
    return 0


def _camara_deputados(settings: Settings, legislaturas: list[int]) -> int:
    conn = connect(settings)
    try:
        with SourceClient(settings) as client:
            run_job(
                "camara-deputados",
                lambda: camara_deputados.collect(
                    client,
                    S3RawStorage(settings),
                    PgRawRegistry(conn),
                    camara_deputados.CamaraDeputadoRepository(conn),
                    cpf_hash_key=settings.cpf_hash_key.get_secret_value(),
                    legislaturas=legislaturas,
                ),
                PgJobRecorder(conn),
            )
    finally:
        conn.close()
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    parser = argparse.ArgumentParser(prog="vp-ingest", description="Coleta de dados públicos")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("check-storage", help="confere o acesso ao S3 e cria o bucket bruto")
    commands.add_parser("check-db", help="confere o acesso ao banco com o usuário do worker")
    deputados = commands.add_parser("camara-deputados", help="coleta deputados da Câmara")
    deputados.add_argument(
        "--legislatura", type=int, action="append", help="padrão: 57 (2023-2027)"
    )

    args = parser.parse_args(argv)
    settings = Settings()
    if args.command == "check-storage":
        return _check_storage(settings)
    if args.command == "check-db":
        return _check_db(settings)
    if args.command == "camara-deputados":
        return _camara_deputados(settings, args.legislatura or [57])
    return 1


if __name__ == "__main__":
    sys.exit(main())
