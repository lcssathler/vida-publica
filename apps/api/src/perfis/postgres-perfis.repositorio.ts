import { Inject, Injectable } from '@nestjs/common';
import { Db } from '../db/db';
import {
  Candidatura,
  DoadoresCandidatura,
  Filiacao,
  GastoAnual,
  Mandato,
  PartidoDados,
  PerfisRepositorio,
  PessoaDados,
} from './perfis.repositorio';

/** Receita vigente: a da prestação de contas mais recente (como no motor). */
const RECEITA_VIGENTE = `
  SELECT r.*, row_number() OVER (
    PARTITION BY r.ano_eleicao, r.sq_candidato, coalesce(r.sq_receita::text, r.id)
    ORDER BY CASE upper(coalesce(r.tp_prestacao, ''))
               WHEN 'FINAL' THEN 3
               WHEN 'RELATÓRIO FINANCEIRO' THEN 2
               WHEN 'RELATORIO FINANCEIRO' THEN 2
               WHEN 'PARCIAL' THEN 1
               ELSE 0 END DESC,
             r.dt_prestacao DESC NULLS LAST, r.id
  ) AS ordem
  FROM canon.tse_receita r
  WHERE r.removido_em IS NULL AND r.ano_eleicao = $1 AND r.sq_candidato = $2`;

const data = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

@Injectable()
export class PostgresPerfisRepositorio extends PerfisRepositorio {
  constructor(@Inject(Db) private readonly db: Db) {
    super();
  }

  async pessoa(id: string): Promise<PessoaDados | null> {
    const [pessoa] = await this.db.query<{
      id: string;
      nome: string;
      nome_civil: string | null;
    }>(
      `SELECT id, coalesce(nome_exibicao, nome_civil, 'Sem nome') AS nome, nome_civil
         FROM canon.pessoa WHERE id = $1`,
      [id],
    );
    if (!pessoa) return null;
    const [fotos, mandatos, filiacoes, candidaturas] = await Promise.all([
      this.db.query<{ url: string; credito: string }>(
        `SELECT d.url_foto AS url, 'Câmara dos Deputados' AS credito, 1 AS ordem
           FROM canon.pessoa_vinculo v
           JOIN canon.camara_deputado d
             ON d.id_camara = CASE WHEN v.fonte = 'camara' THEN v.id_fonte::integer END
          WHERE v.pessoa_id = $1 AND v.fonte = 'camara' AND d.url_foto IS NOT NULL
         UNION ALL
         SELECT s.url_foto, 'Senado Federal', 2
           FROM canon.pessoa_vinculo v
           JOIN canon.senado_senador s
             ON s.codigo_senado = CASE WHEN v.fonte = 'senado' THEN v.id_fonte::integer END
          WHERE v.pessoa_id = $1 AND v.fonte = 'senado' AND s.url_foto IS NOT NULL
         ORDER BY ordem LIMIT 1`,
        [id],
      ),
      this.db.query<{
        casa: Mandato['casa'];
        cargo: string;
        uf: string | null;
        id_legislatura: number;
        condicao: string;
        inicio: Date | null;
        fim: Date | null;
        em_exercicio: boolean;
      }>(
        `SELECT casa, cargo, uf, id_legislatura, condicao, inicio, fim, em_exercicio
           FROM canon.mandato WHERE pessoa_id = $1
          ORDER BY em_exercicio DESC, id_legislatura DESC, inicio DESC NULLS LAST`,
        [id],
      ),
      this.db.query<{
        sigla: string;
        partido_id: number | null;
        desde: Date;
        ate: Date | null;
      }>(
        `SELECT DISTINCT ON (sigla, desde) sigla, partido_id, desde, ate
           FROM canon.filiacao WHERE pessoa_id = $1
          ORDER BY desde DESC, sigla, ate DESC NULLS FIRST`,
        [id],
      ),
      this.db.query<{
        ano_eleicao: number;
        nr_turno: number;
        sq_candidato: string;
        ds_cargo: string | null;
        sg_uf: string | null;
        nm_urna_candidato: string | null;
        nr_candidato: number | null;
        partido_id: number | null;
        sg_partido: string | null;
        ds_situacao_candidatura: string | null;
        ds_sit_tot_turno: string | null;
      }>(
        `SELECT c.ano_eleicao, c.nr_turno, c.sq_candidato::text AS sq_candidato, c.ds_cargo,
                c.sg_uf, c.nm_urna_candidato, c.nr_candidato, cp.partido_id, c.sg_partido,
                c.ds_situacao_candidatura, c.ds_sit_tot_turno
           FROM canon.candidatura_partido cp
           JOIN canon.tse_candidatura c
             ON c.ano_eleicao = cp.ano_eleicao AND c.sq_candidato = cp.sq_candidato
            AND c.nr_turno = cp.nr_turno
          WHERE cp.pessoa_id = $1
          ORDER BY c.ano_eleicao DESC, c.nr_turno DESC`,
        [id],
      ),
    ]);
    return {
      id: pessoa.id,
      nome: pessoa.nome,
      nomeCivil: pessoa.nome_civil,
      foto: fotos[0] ? { url: fotos[0].url, credito: fotos[0].credito } : null,
      mandatos: mandatos.map((m): Mandato => ({
        casa: m.casa,
        cargo: m.cargo,
        uf: m.uf,
        legislatura: m.id_legislatura,
        condicao: m.condicao,
        inicio: data(m.inicio),
        fim: data(m.fim),
        emExercicio: m.em_exercicio,
      })),
      filiacoes: filiacoes.map((f): Filiacao => ({
        sigla: f.sigla,
        partidoId: f.partido_id === null ? null : String(f.partido_id),
        desde: data(f.desde) ?? '',
        ate: data(f.ate),
      })),
      candidaturas: candidaturas.map((c): Candidatura => ({
        ano: c.ano_eleicao,
        turno: c.nr_turno,
        sqCandidato: c.sq_candidato,
        cargo: c.ds_cargo,
        uf: c.sg_uf,
        nomeUrna: c.nm_urna_candidato,
        numero: c.nr_candidato,
        partido: {
          id: c.partido_id === null ? null : String(c.partido_id),
          sigla: c.sg_partido,
        },
        situacao: c.ds_situacao_candidatura,
        resultado: c.ds_sit_tot_turno,
      })),
    };
  }

  async gastos(pessoaId: string, anos: number): Promise<GastoAnual[]> {
    const linhas = await this.db.query<{
      ano: number;
      casa: GastoAnual['casa'];
      categoria: string;
      total: number;
      documentos: number;
    }>(
      `WITH despesas AS (
         SELECT d.ano, 'camara' AS casa, coalesce(d.descricao, 'Outras') AS categoria,
                d.valor_liquido AS valor
           FROM canon.pessoa_vinculo v
           JOIN canon.camara_despesa d
             ON d.id_camara = CASE WHEN v.fonte = 'camara' THEN v.id_fonte::integer END
          WHERE v.pessoa_id = $1 AND v.fonte = 'camara' AND d.removido_em IS NULL
         UNION ALL
         SELECT d.ano, 'senado', coalesce(d.tipo_despesa, 'Outras'), d.valor
           FROM canon.pessoa_vinculo v
           JOIN canon.senado_despesa d
             ON d.codigo_senado = CASE WHEN v.fonte = 'senado' THEN v.id_fonte::integer END
          WHERE v.pessoa_id = $1 AND v.fonte = 'senado' AND d.removido_em IS NULL
       ), recentes AS (
         SELECT DISTINCT ano FROM despesas ORDER BY ano DESC LIMIT $2
       )
       SELECT d.ano, d.casa, d.categoria, sum(d.valor)::float8 AS total,
              count(*)::integer AS documentos
         FROM despesas d JOIN recentes r USING (ano)
        GROUP BY d.ano, d.casa, d.categoria
        ORDER BY d.ano DESC, d.casa, total DESC`,
      [pessoaId, anos],
    );
    const porAno = new Map<string, GastoAnual>();
    for (const l of linhas) {
      const chave = `${l.ano}:${l.casa}`;
      const gasto = porAno.get(chave) ?? {
        ano: l.ano,
        casa: l.casa,
        total: 0,
        documentos: 0,
        categorias: [],
      };
      gasto.total += l.total;
      gasto.documentos += l.documentos;
      if (gasto.categorias.length < 5) {
        gasto.categorias.push({ categoria: l.categoria, total: l.total });
      }
      porAno.set(chave, gasto);
    }
    return [...porAno.values()].map((g) => ({
      ...g,
      total: Math.round(g.total * 100) / 100,
    }));
  }

  async anosDeCandidatura(pessoaId: string): Promise<number[]> {
    const linhas = await this.db.query<{ ano: number }>(
      `SELECT DISTINCT ano_eleicao AS ano FROM canon.candidatura_partido
        WHERE pessoa_id = $1 ORDER BY ano DESC`,
      [pessoaId],
    );
    return linhas.map((l) => l.ano);
  }

  async doadores(
    pessoaId: string,
    ano: number,
  ): Promise<DoadoresCandidatura[]> {
    const candidaturas = await this.db.query<{
      sq_candidato: string;
      ds_cargo: string | null;
      sg_uf: string | null;
      sg_partido: string | null;
    }>(
      `SELECT DISTINCT ON (sq_candidato) sq_candidato::text AS sq_candidato, ds_cargo,
              sg_uf, sg_partido
         FROM canon.candidatura_partido
        WHERE pessoa_id = $1 AND ano_eleicao = $2
        ORDER BY sq_candidato, nr_turno DESC`,
      [pessoaId, ano],
    );
    return Promise.all(
      candidaturas.map(async (c) => {
        const params = [ano, c.sq_candidato];
        const [origens, comCnpj, pessoasFisicas] = await Promise.all([
          this.db.query<{ origem: string; total: number; receitas: number }>(
            `WITH vigente AS (${RECEITA_VIGENTE})
             SELECT coalesce(ds_origem, 'Origem não informada') AS origem,
                    sum(valor)::float8 AS total, count(*)::integer AS receitas
               FROM vigente WHERE ordem = 1
              GROUP BY 1 ORDER BY total DESC`,
            params,
          ),
          this.db.query<{
            nome: string;
            cnpj: string;
            total: number;
            receitas: number;
          }>(
            `WITH vigente AS (${RECEITA_VIGENTE})
             SELECT max(coalesce(doador_nome_rfb, doador_nome)) AS nome, doador_cnpj AS cnpj,
                    sum(valor)::float8 AS total, count(*)::integer AS receitas
               FROM vigente WHERE ordem = 1 AND doador_cnpj IS NOT NULL
              GROUP BY doador_cnpj ORDER BY total DESC LIMIT 20`,
            params,
          ),
          // Doadores pessoa física vêm da visão do canon: nome só acima de
          // R$ 10 mil, nunca o CPF nem o hash.
          this.db.query<{
            doador_nome: string | null;
            doacoes: number;
            total: number;
          }>(
            `SELECT doador_nome, doacoes, total::float8 AS total
               FROM canon.tse_doador_pessoa_fisica
              WHERE ano_eleicao = $1 AND sq_candidato = $2
              ORDER BY total DESC`,
            params,
          ),
        ]);
        const nomeadas = pessoasFisicas
          .filter((p) => p.doador_nome !== null)
          .map((p) => ({
            nome: p.doador_nome as string,
            total: p.total,
            doacoes: p.doacoes,
          }));
        const outras = pessoasFisicas.filter((p) => p.doador_nome === null);
        const soma = (valores: number[]) =>
          Math.round(valores.reduce((a, b) => a + b, 0) * 100) / 100;
        return {
          ano,
          sqCandidato: c.sq_candidato,
          cargo: c.ds_cargo,
          uf: c.sg_uf,
          partido: c.sg_partido,
          total: soma(origens.map((o) => o.total)),
          receitas: origens.reduce((a, o) => a + o.receitas, 0),
          porOrigem: origens,
          comCnpj,
          pessoasFisicas: {
            nomeadas,
            outras: {
              doadores: outras.length,
              total: soma(outras.map((o) => o.total)),
            },
          },
        };
      }),
    );
  }

  async partido(id: string): Promise<PartidoDados | null> {
    const [partido] = await this.db.query<{
      id: number;
      sigla: string;
      nome: string | null;
      numero_tse: number;
      primeiro_ano: number | null;
      ultimo_ano: number | null;
      sucessor_id: number | null;
      sucessor_sigla: string | null;
      tipo_sucessao: string | null;
      ano_sucessao: number | null;
    }>(
      `SELECT p.id, p.sigla, p.nome, p.numero_tse, p.primeiro_ano, p.ultimo_ano,
              p.sucessor_id, s.sigla AS sucessor_sigla, p.tipo_sucessao, p.ano_sucessao
         FROM canon.partido p
         LEFT JOIN canon.partido s ON s.id = p.sucessor_id
        WHERE p.id = $1::integer`,
      [id],
    );
    if (!partido) return null;
    const [antecessores, emExercicio, repasses] = await Promise.all([
      this.db.query<{
        id: number;
        sigla: string;
        tipo_sucessao: string;
        ano_sucessao: number | null;
      }>(
        `SELECT id, sigla, tipo_sucessao, ano_sucessao FROM canon.partido
          WHERE sucessor_id = $1 ORDER BY ano_sucessao DESC NULLS LAST, sigla`,
        [partido.id],
      ),
      this.db.query<PartidoDados['emExercicio'][number]>(
        `SELECT DISTINCT ON (p.id) p.id, coalesce(p.nome_exibicao, p.nome_civil) AS nome,
                m.casa, m.cargo, m.uf
           FROM canon.filiacao f
           JOIN canon.mandato m ON m.pessoa_id = f.pessoa_id AND m.em_exercicio
           JOIN canon.pessoa p ON p.id = f.pessoa_id
          WHERE f.partido_id = $1 AND f.ate IS NULL
          ORDER BY p.id, m.inicio DESC NULLS LAST`,
        [partido.id],
      ),
      this.db.query<PartidoDados['repasses'][number]>(
        `SELECT ano_eleicao AS ano, fonte, esfera, sum(valor)::float8 AS total,
                sum(repasses)::integer AS repasses,
                count(DISTINCT sq_candidato)::integer AS candidatos
           FROM canon.repasse_total
          WHERE partido_id = $1
          GROUP BY ano_eleicao, fonte, esfera
          ORDER BY ano_eleicao DESC, total DESC`,
        [partido.id],
      ),
    ]);
    return {
      id: String(partido.id),
      sigla: partido.sigla,
      nome: partido.nome,
      numero: partido.numero_tse,
      primeiroAno: partido.primeiro_ano,
      ultimoAno: partido.ultimo_ano,
      sucessor:
        partido.sucessor_id !== null
          ? {
              id: String(partido.sucessor_id),
              sigla: partido.sucessor_sigla ?? '',
              tipo: partido.tipo_sucessao ?? '',
              ano: partido.ano_sucessao,
            }
          : null,
      antecessores: antecessores.map((a) => ({
        id: String(a.id),
        sigla: a.sigla,
        tipo: a.tipo_sucessao,
        ano: a.ano_sucessao,
      })),
      emExercicio: emExercicio.sort((a, b) => a.nome.localeCompare(b.nome)),
      repasses,
    };
  }
}
