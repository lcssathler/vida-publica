import argparse
import logging
import sys

from .adapters.postgres import PgJobRecorder, PgRawRegistry, connect
from .adapters.s3 import S3RawStorage
from .canon import mandatos, pessoas
from .config import Settings
from .http import SourceClient
from .jobs import run_job
from .sources import (
    camara_deputados,
    camara_historico,
    partidos,
    senado_senadores,
    tse_candidaturas,
)


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


def _senado_senadores(settings: Settings, legislaturas: list[int]) -> int:
    conn = connect(settings)
    try:
        with SourceClient(settings) as client:
            run_job(
                "senado-senadores",
                lambda: senado_senadores.collect(
                    client,
                    S3RawStorage(settings),
                    PgRawRegistry(conn),
                    senado_senadores.SenadoSenadorRepository(conn),
                    legislaturas=legislaturas,
                ),
                PgJobRecorder(conn),
            )
    finally:
        conn.close()
    return 0


def _tse_candidaturas(settings: Settings, anos: list[int]) -> int:
    conn = connect(settings)
    try:
        with SourceClient(settings) as client:
            run_job(
                "tse-candidaturas",
                lambda: tse_candidaturas.collect(
                    client,
                    S3RawStorage(settings),
                    PgRawRegistry(conn),
                    tse_candidaturas.TseCandidaturaRepository(conn),
                    cpf_hash_key=settings.cpf_hash_key.get_secret_value(),
                    anos=anos,
                ),
                PgJobRecorder(conn),
            )
    finally:
        conn.close()
    return 0


def _partidos(settings: Settings) -> int:
    conn = connect(settings)
    try:
        with SourceClient(settings) as client:
            run_job(
                "partidos",
                lambda: partidos.build(
                    client,
                    S3RawStorage(settings),
                    PgRawRegistry(conn),
                    partidos.PartidoRepository(conn),
                ),
                PgJobRecorder(conn),
            )
    finally:
        conn.close()
    return 0


def _resolver_pessoas(settings: Settings) -> int:
    conn = connect(settings)
    try:
        run_job(
            "resolver-pessoas",
            lambda: pessoas.resolve(pessoas.PessoaRepository(conn)),
            PgJobRecorder(conn),
        )
        for row in pessoas.coverage(conn):
            print(f"{row['grupo']}: {row['com_tse']}/{row['total']} ({row['percentual']}%)")
    finally:
        conn.close()
    return 0


def _camara_historico(settings: Settings) -> int:
    conn = connect(settings)
    try:
        with SourceClient(settings) as client:
            run_job(
                "camara-historico",
                lambda: camara_historico.collect(
                    client,
                    S3RawStorage(settings),
                    PgRawRegistry(conn),
                    camara_historico.CamaraHistoricoRepository(conn),
                ),
                PgJobRecorder(conn),
            )
    finally:
        conn.close()
    return 0


def _mandatos_filiacoes(settings: Settings) -> int:
    conn = connect(settings)
    try:
        run_job("mandatos-filiacoes", lambda: mandatos.build(conn), PgJobRecorder(conn))
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
    commands.add_parser(
        "camara-historico", help="coleta legislaturas e o histórico de cada deputado"
    )
    commands.add_parser(
        "mandatos-filiacoes", help="constrói mandatos e períodos de filiação por pessoa"
    )
    commands.add_parser(
        "resolver-pessoas", help="casa registros de TSE, Câmara e Senado numa mesma pessoa"
    )
    commands.add_parser("partidos", help="reconstrói partidos a partir do TSE e da Câmara")
    candidaturas = commands.add_parser("tse-candidaturas", help="coleta candidaturas do TSE")
    candidaturas.add_argument("--ano", type=int, action="append", help="padrão: 2018, 2022, 2026")
    senadores = commands.add_parser("senado-senadores", help="coleta senadores do Senado")
    senadores.add_argument(
        "--legislatura", type=int, action="append", help="padrão: 57 (2023-2027)"
    )

    args = parser.parse_args(argv)
    settings = Settings()
    if args.command == "check-storage":
        return _check_storage(settings)
    if args.command == "check-db":
        return _check_db(settings)
    if args.command == "camara-historico":
        return _camara_historico(settings)
    if args.command == "mandatos-filiacoes":
        return _mandatos_filiacoes(settings)
    if args.command == "resolver-pessoas":
        return _resolver_pessoas(settings)
    if args.command == "partidos":
        return _partidos(settings)
    if args.command == "tse-candidaturas":
        return _tse_candidaturas(settings, args.ano or [2018, 2022, 2026])
    if args.command == "senado-senadores":
        return _senado_senadores(settings, args.legislatura or [57])
    if args.command == "camara-deputados":
        return _camara_deputados(settings, args.legislatura or [57])
    return 1


if __name__ == "__main__":
    sys.exit(main())
