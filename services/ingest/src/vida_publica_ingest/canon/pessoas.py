"""Resolução de pessoas entre fontes.

Ordem, da regra mais forte para a mais fraca (para no primeiro acerto):
1. CPF igual (só o hash): TSE e Câmara. Confiança 1.0.
2. Nome civil normalizado + data de nascimento iguais a uma candidatura: Senado. 0.95.
3. Data de nascimento + UF + candidatura a senador ou suplente, com um único
   candidato possível: Senado. 0.90.
Nunca se casa só pelo nome. O que sobra vai para canon.match_review.
"""

import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from typing import Any

import pg8000.native

from ..adapters.postgres import rows_as_dicts, transaction
from ..identity import normalize_name

logger = logging.getLogger(__name__)

CARGOS_SENADO = {"SENADOR", "1º SUPLENTE", "2º SUPLENTE", "1O SUPLENTE", "2O SUPLENTE"}

# 1. Uma pessoa por hash de CPF visto no TSE ou na Câmara.
_CRIA_PESSOAS_POR_CPF = """
WITH novos AS MATERIALIZED (
  SELECT gen_random_uuid() AS id, cpf_hash
  FROM (
    SELECT cpf_hash FROM ident.tse_candidatura WHERE cpf_hash IS NOT NULL
    UNION
    SELECT cpf_hash FROM ident.camara_deputado WHERE cpf_hash IS NOT NULL
  ) todos
  WHERE NOT EXISTS (SELECT 1 FROM ident.pessoa p WHERE p.cpf_hash = todos.cpf_hash)
),
pessoas AS (INSERT INTO canon.pessoa (id) SELECT id FROM novos)
INSERT INTO ident.pessoa (pessoa_id, cpf_hash) SELECT id, cpf_hash FROM novos
RETURNING pessoa_id
"""

_VINCULA_TSE = """
INSERT INTO canon.pessoa_vinculo (fonte, id_fonte, pessoa_id, metodo, confianca)
SELECT 'tse', t.ano_eleicao || ':' || t.sq_candidato, p.pessoa_id, 'cpf', 1.0
FROM ident.tse_candidatura t JOIN ident.pessoa p USING (cpf_hash)
ON CONFLICT (fonte, id_fonte) DO UPDATE SET pessoa_id = EXCLUDED.pessoa_id
WHERE canon.pessoa_vinculo.metodo <> 'manual'
  AND canon.pessoa_vinculo.pessoa_id IS DISTINCT FROM EXCLUDED.pessoa_id
"""

_VINCULA_CAMARA = """
INSERT INTO canon.pessoa_vinculo (fonte, id_fonte, pessoa_id, metodo, confianca)
SELECT 'camara', c.id_camara::text, p.pessoa_id, 'cpf', 1.0
FROM ident.camara_deputado c JOIN ident.pessoa p USING (cpf_hash)
ON CONFLICT (fonte, id_fonte) DO UPDATE SET pessoa_id = EXCLUDED.pessoa_id
WHERE canon.pessoa_vinculo.metodo <> 'manual'
  AND canon.pessoa_vinculo.pessoa_id IS DISTINCT FROM EXCLUDED.pessoa_id
"""

# Atributos da pessoa: primeiro da Câmara e do Senado (mantidos pelas casas),
# depois da candidatura mais recente no TSE, que às vezes traz erros de digitação.
_ATUALIZA_ATRIBUTOS = """
WITH tse AS (
  SELECT DISTINCT ON (v.pessoa_id) v.pessoa_id, c.nm_candidato AS nome_civil,
    coalesce(c.nm_social_candidato, c.nm_urna_candidato) AS nome_exibicao,
    c.dt_nascimento, CASE c.ds_genero WHEN 'MASCULINO' THEN 'M' WHEN 'FEMININO' THEN 'F' END AS sexo
  FROM canon.pessoa_vinculo v
  JOIN canon.tse_candidatura c
    ON v.fonte = 'tse' AND v.id_fonte = c.ano_eleicao || ':' || c.sq_candidato
  ORDER BY v.pessoa_id, c.ano_eleicao DESC, c.nr_turno DESC
),
camara AS (
  SELECT v.pessoa_id, d.nome_civil, d.nome_parlamentar AS nome_exibicao, d.data_nascimento, d.sexo
  FROM canon.pessoa_vinculo v JOIN canon.camara_deputado d
    ON v.fonte = 'camara' AND v.id_fonte = d.id_camara::text
),
senado AS (
  SELECT v.pessoa_id, s.nome_completo AS nome_civil, s.nome_parlamentar AS nome_exibicao,
    s.data_nascimento, s.sexo
  FROM canon.pessoa_vinculo v JOIN canon.senado_senador s
    ON v.fonte = 'senado' AND v.id_fonte = s.codigo_senado::text
),
melhor AS (
  SELECT p.id,
    coalesce(camara.nome_civil, senado.nome_civil, tse.nome_civil) AS nome_civil,
    coalesce(camara.nome_exibicao, senado.nome_exibicao, tse.nome_exibicao) AS nome_exibicao,
    coalesce(camara.data_nascimento, senado.data_nascimento, tse.dt_nascimento)
      AS data_nascimento,
    coalesce(camara.sexo, senado.sexo, tse.sexo) AS sexo
  FROM canon.pessoa p LEFT JOIN tse ON tse.pessoa_id = p.id
  LEFT JOIN camara ON camara.pessoa_id = p.id
  LEFT JOIN senado ON senado.pessoa_id = p.id
)
UPDATE canon.pessoa p SET nome_civil = m.nome_civil, nome_exibicao = m.nome_exibicao,
  data_nascimento = m.data_nascimento, sexo = m.sexo, atualizado_em = now()
FROM melhor m
WHERE m.id = p.id AND (p.nome_civil, p.nome_exibicao, p.data_nascimento, p.sexo)
  IS DISTINCT FROM (m.nome_civil, m.nome_exibicao, m.data_nascimento, m.sexo)
"""


@dataclass(frozen=True)
class CandidatoTse:
    pessoa_id: str
    nome: str
    nascimento: date | None
    uf: str | None
    cargo: str | None


@dataclass(frozen=True)
class Senador:
    codigo: int
    nome_completo: str | None
    nascimento: date | None
    uf: str | None


@dataclass(frozen=True)
class Casamento:
    pessoa_id: str | None
    metodo: str | None
    confianca: float
    motivo: str | None = None
    candidatos: tuple[str, ...] = ()


def match_senador(senador: Senador, candidatos: list[CandidatoTse]) -> Casamento:
    """Casa um senador com candidaturas do TSE sem usar CPF."""
    if senador.nascimento is None:
        return Casamento(None, None, 0, "sem_data_nascimento")

    mesma_data = [c for c in candidatos if c.nascimento == senador.nascimento]
    nome = normalize_name(senador.nome_completo)
    por_nome = {c.pessoa_id for c in mesma_data if normalize_name(c.nome) == nome}
    if len(por_nome) == 1:
        return Casamento(por_nome.pop(), "nome_nascimento", 0.95)
    if len(por_nome) > 1:
        return Casamento(None, None, 0, "homonimos_mesma_data", tuple(sorted(por_nome)))

    por_cargo = {
        c.pessoa_id
        for c in mesma_data
        if c.uf == senador.uf and (c.cargo or "").upper() in CARGOS_SENADO
    }
    if len(por_cargo) == 1:
        return Casamento(por_cargo.pop(), "nascimento_cargo_uf", 0.90)
    if len(por_cargo) > 1:
        return Casamento(None, None, 0, "varios_candidatos_mesma_data_uf", tuple(sorted(por_cargo)))
    return Casamento(None, None, 0, "sem_candidatura_compativel")


@dataclass
class ResolveStats:
    pessoas_novas: int = 0
    vinculos_tse: int = 0
    vinculos_camara: int = 0
    senadores_casados: int = 0
    senadores_em_revisao: int = 0


class PessoaRepository:
    def __init__(self, conn: pg8000.native.Connection) -> None:
        self._conn = conn

    def transaction(self):
        return transaction(self._conn)

    def run(self, sql: str, **params: Any) -> int:
        return len(self._conn.run(sql, **params) or [])

    def candidatos_tse(self) -> list[CandidatoTse]:
        rows = rows_as_dicts(
            self._conn,
            "SELECT DISTINCT v.pessoa_id::text AS pessoa_id, c.nm_candidato AS nome,"
            " c.dt_nascimento AS nascimento, c.sg_uf AS uf, c.ds_cargo AS cargo"
            " FROM canon.pessoa_vinculo v JOIN canon.tse_candidatura c"
            " ON v.fonte = 'tse' AND v.id_fonte = c.ano_eleicao || ':' || c.sq_candidato"
            " WHERE c.dt_nascimento IS NOT NULL",
        )
        return [CandidatoTse(**row) for row in rows]

    def senadores(self) -> list[Senador]:
        rows = rows_as_dicts(
            self._conn,
            "SELECT codigo_senado AS codigo, nome_completo, data_nascimento AS nascimento,"
            " uf_parlamentar AS uf FROM canon.senado_senador",
        )
        return [Senador(**row) for row in rows]

    def vincula(self, fonte: str, id_fonte: str, casamento: Casamento) -> None:
        self._conn.run(
            "INSERT INTO canon.pessoa_vinculo (fonte, id_fonte, pessoa_id, metodo, confianca)"
            " VALUES (:fonte, :id, :pessoa::uuid, :metodo, :confianca)"
            " ON CONFLICT (fonte, id_fonte) DO UPDATE SET pessoa_id = EXCLUDED.pessoa_id,"
            " metodo = EXCLUDED.metodo, confianca = EXCLUDED.confianca"
            " WHERE canon.pessoa_vinculo.metodo <> 'manual'",
            fonte=fonte,
            id=id_fonte,
            pessoa=casamento.pessoa_id,
            metodo=casamento.metodo,
            confianca=casamento.confianca,
        )
        self._conn.run(
            "UPDATE canon.match_review SET status = 'resolvido', atualizado_em = now()"
            " WHERE fonte = :fonte AND id_fonte = :id AND status = 'pendente'",
            fonte=fonte,
            id=id_fonte,
        )

    def envia_para_revisao(self, fonte: str, id_fonte: str, casamento: Casamento) -> None:
        self._conn.run(
            "INSERT INTO canon.match_review (fonte, id_fonte, motivo, candidatos)"
            " VALUES (:fonte, :id, :motivo, CAST(:candidatos AS uuid[]))"
            " ON CONFLICT (fonte, id_fonte) DO UPDATE SET motivo = EXCLUDED.motivo,"
            " candidatos = EXCLUDED.candidatos, atualizado_em = now()"
            " WHERE canon.match_review.status = 'pendente'",
            fonte=fonte,
            id=id_fonte,
            motivo=casamento.motivo,
            candidatos="{" + ",".join(casamento.candidatos) + "}",
        )

    def tem_vinculo_manual(self, fonte: str, id_fonte: str) -> bool:
        return bool(
            self._conn.run(
                "SELECT 1 FROM canon.pessoa_vinculo WHERE fonte = :fonte AND id_fonte = :id"
                " AND metodo = 'manual'",
                fonte=fonte,
                id=id_fonte,
            )
        )


def resolve(repository: PessoaRepository) -> ResolveStats:
    stats = ResolveStats()
    with repository.transaction():
        stats.pessoas_novas = repository.run(_CRIA_PESSOAS_POR_CPF)
        stats.vinculos_tse = repository.run(_VINCULA_TSE + " RETURNING 1")
        stats.vinculos_camara = repository.run(_VINCULA_CAMARA + " RETURNING 1")

        candidatos = repository.candidatos_tse()
        por_data: dict[date | None, list[CandidatoTse]] = defaultdict(list)
        for candidato in candidatos:
            por_data[candidato.nascimento].append(candidato)

        for senador in repository.senadores():
            id_fonte = str(senador.codigo)
            if repository.tem_vinculo_manual("senado", id_fonte):
                stats.senadores_casados += 1
                continue
            casamento = match_senador(senador, por_data.get(senador.nascimento, []))
            if casamento.pessoa_id:
                repository.vincula("senado", id_fonte, casamento)
                stats.senadores_casados += 1
            else:
                repository.envia_para_revisao("senado", id_fonte, casamento)
                stats.senadores_em_revisao += 1

        repository.run(_ATUALIZA_ATRIBUTOS + " RETURNING 1")
    logger.info("resolver-pessoas: %s", stats)
    return stats


COBERTURA_SQL = """
SELECT 'deputados_legislatura' AS grupo, count(*) AS total,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM canon.pessoa_vinculo vc JOIN canon.pessoa_vinculo vt
      ON vt.pessoa_id = vc.pessoa_id AND vt.fonte = 'tse'
    WHERE vc.fonte = 'camara' AND vc.id_fonte = d.id_camara::text)) AS com_tse
FROM canon.camara_deputado d
WHERE EXISTS (SELECT 1 FROM canon.camara_deputado_legislatura l
              WHERE l.id_camara = d.id_camara AND l.id_legislatura = :legislatura)
UNION ALL
SELECT 'senadores_em_exercicio', count(*),
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM canon.pessoa_vinculo vs JOIN canon.pessoa_vinculo vt
      ON vt.pessoa_id = vs.pessoa_id AND vt.fonte = 'tse'
    WHERE vs.fonte = 'senado' AND vs.id_fonte = s.codigo_senado::text))
FROM canon.senado_senador s WHERE s.em_exercicio
UNION ALL
SELECT 'senado_legislatura', count(*),
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM canon.pessoa_vinculo vs
    WHERE vs.fonte = 'senado' AND vs.id_fonte = s.codigo_senado::text))
FROM canon.senado_senador s
"""


def coverage(conn: pg8000.native.Connection, legislatura: int = 57) -> list[dict[str, Any]]:
    """Quantos parlamentares foram ligados a uma pessoa com candidatura no TSE."""
    rows = rows_as_dicts(conn, COBERTURA_SQL, legislatura=legislatura)
    for row in rows:
        row["percentual"] = round(100 * row["com_tse"] / row["total"], 1) if row["total"] else 0.0
    return rows
