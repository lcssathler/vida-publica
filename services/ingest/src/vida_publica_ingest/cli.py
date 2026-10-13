import argparse
import logging
import sys

from .adapters.s3 import S3RawStorage
from .config import Settings


def _check_storage(settings: Settings) -> int:
    storage = S3RawStorage(settings)
    storage.ensure_bucket()
    print(f"armazenamento ok: bucket {settings.s3_bucket_raw} em {settings.s3_endpoint}")
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    parser = argparse.ArgumentParser(prog="vp-ingest", description="Coleta de dados públicos")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("check-storage", help="confere o acesso ao S3 e cria o bucket bruto")

    args = parser.parse_args(argv)
    settings = Settings()
    if args.command == "check-storage":
        return _check_storage(settings)
    return 1


if __name__ == "__main__":
    sys.exit(main())
