import { Inject, Injectable } from '@nestjs/common';
import { Db, Executor } from '../db/db';
import {
  Acao,
  Casamento,
  DetalheEvento,
  Errata,
  EventoRevisao,
  FiltroEventos,
  ItemRevisao,
  NovaErrata,
  Pagina,
  PessoaCandidata,
  RecusaRevisao,
  registrarAcao,
  Reporte,
  ResultadoRevisao,
  ResumoRevisao,
  RevisaoRepositorio,
  revisadoPor,
  Revisor,
} from './revisao.repositorio';

/** Nome de quem revisou: a conta do painel (admin:<id>) ou o processo. */
const NOME_REVISOR = (coluna: string) => `CASE
  WHEN ${coluna} LIKE 'admin:%' THEN (SELECT u.nome FROM admin.usuario u
                                       WHERE u.id::text = substr(${coluna}, 7))
  ELSE ${coluna} END`;

const COLUNAS_EVENTO = `e.id, e.tipo, e.regra_versao AS "regraVersao", e.titulo, e.resumo,
  e.valor::float8 AS valor, e.ocorrido_em AS "ocorridoEm", e.coletado_em AS "coletadoEm",
  e.status, e.motivo, e.visibilidade, e.fonte_url AS "fonteUrl",
  e.fonte_dado_em AS "fonteDadoEm", e.publicado_em AS "publicadoEm",
  e.revisado_em AS "revisadoEm", ${NOME_REVISOR('e.revisado_por')} AS "revisadoPor",
  e.content_hash AS "contentHash",
  (SELECT count(r.id)::integer FROM app.reporte r
    WHERE r.evento_id = e.id AND r.status = 'aberto') AS "reportesAbertos"`;

/** Nome do alvo do evento, como o feed mostra. */
const NOME_ALVO = `CASE a.alvo_tipo
  WHEN 'pessoa' THEN (SELECT coalesce(p.nome_exibicao, p.nome_civil) FROM canon.pessoa p
                       WHERE p.id = a.alvo_id::uuid)
  WHEN 'partido' THEN (SELECT pa.sigla FROM canon.partido pa WHERE pa.id = a.alvo_id::integer)
  WHEN 'proposicao' THEN (SELECT pr.identificacao FROM canon.proposicao pr
                           WHERE pr.id = a.alvo_id::uuid)
  ELSE a.alvo_id END`;

/** O registro da fonte que está na fila de casamentos. */
const REGISTRO_FONTE = `
  LEFT JOIN canon.senado_senador s
    ON m.fonte = 'senado' AND s.codigo_senado::text = m.id_fonte
  LEFT JOIN canon.camara_deputado d
    ON m.fonte = 'camara' AND d.id_camara::text = m.id_fonte
  LEFT JOIN LATERAL (
    SELECT * FROM canon.tse_candidatura t
     WHERE m.fonte = 'tse' AND t.ano_eleicao || ':' || t.sq_candidato = m.id_fonte
     ORDER BY t.nr_turno DESC LIMIT 1) t ON true`;

const COLUNAS_CASAMENTO = `m.fonte, m.id_fonte AS "idFonte", m.motivo, m.status,
  m.criado_em AS "criadoEm", m.candidatos::text[] AS candidatos,
  m.pessoa_id AS "pessoaId",
  (SELECT coalesce(p.nome_exibicao, p.nome_civil) FROM canon.pessoa p
    WHERE p.id = m.pessoa_id) AS "pessoaNome",
  m.resolvido_em AS "resolvidoEm", ${NOME_REVISOR('m.resolvido_por')} AS "resolvidoPor",
  m.nota,
  coalesce(s.nome_parlamentar, d.nome_parlamentar, t.nm_urna_candidato) AS nome,
  coalesce(s.nome_completo, d.nome_civil, t.nm_candidato) AS nome_completo,
  coalesce(s.data_nascimento, d.data_nascimento, t.dt_nascimento)::text AS nascimento,
  coalesce(s.uf_parlamentar, d.sigla_uf, t.sg_uf) AS uf,
  coalesce(s.sigla_partido, d.sigla_partido, t.sg_partido) AS partido,
  coalesce(s.url_pagina,
           CASE WHEN d.id_camara IS NOT NULL
                THEN 'https://www.camara.leg.br/deputados/' || d.id_camara END) AS url,
  coalesce(s.em_exercicio, d.situacao = 'Exercício') AS em_exercicio`;

interface LinhaCasamento {
  fonte: string;
  idFonte: string;
  motivo: string;
  status: Casamento['status'];
  criadoEm: Date;
  candidatos: string[];
  pessoaId: string | null;
  pessoaNome: string | null;
  resolvidoEm: Date | null;
  resolvidoPor: string | null;
  nota: string | null;
  nome: string | null;
  nome_completo: string | null;
  nascimento: string | null;
  uf: string | null;
  partido: string | null;
  url: string | null;
  em_exercicio: boolean | null;
}

/** Pessoas com as fontes ligadas e as candidaturas mais recentes. */
const DETALHE_PESSOAS = `
  SELECT p.id, coalesce(p.nome_exibicao, p.nome_civil, 'Sem nome') AS nome,
         p.nome_civil AS "nomeCivil", p.data_nascimento::text AS nascimento,
         coalesce((SELECT array_agg(DISTINCT v.fonte ORDER BY v.fonte)
                     FROM canon.pessoa_vinculo v WHERE v.pessoa_id = p.id), '{}') AS fontes,
         coalesce((SELECT array_agg(c.linha ORDER BY c.ano DESC)
                     FROM (SELECT DISTINCT t.ano_eleicao AS ano,
                                  t.ano_eleicao || ' · ' || t.ds_cargo || ' · ' || t.sg_uf
                                  || ' · ' || t.sg_partido AS linha
                             FROM canon.pessoa_vinculo v
                             JOIN canon.tse_candidatura t
                               ON v.fonte = 'tse'
                              AND v.id_fonte = t.ano_eleicao || ':' || t.sq_candidato
                            WHERE v.pessoa_id = p.id
                            ORDER BY 1 DESC LIMIT 4) c), '{}') AS candidaturas
    FROM canon.pessoa p`;

@Injectable()
export class PostgresRevisaoRepositorio extends RevisaoRepositorio {
  constructor(@Inject(Db) private readonly db: Db) {
    super();
  }

  async resumo(): Promise<ResumoRevisao> {
    const segurados = await this.db.query<ResumoRevisao['segurados'][number]>(
      `SELECT motivo, tipo, count(*)::integer AS eventos, sum(valor)::float8 AS valor
         FROM feed.evento WHERE status = 'segurado'
        GROUP BY 1, 2 ORDER BY 1, 3 DESC`,
    );
    const [contagens] = await this.db.query<{
      casamentos: number;
      reportes: number;
      erratas: number;
    }>(
      `SELECT (SELECT count(*)::integer FROM canon.match_review
                WHERE status = 'pendente') AS casamentos,
              (SELECT count(r.id)::integer FROM app.reporte r
                WHERE r.status = 'aberto') AS reportes,
              (SELECT count(*)::integer FROM feed.errata) AS erratas`,
    );
    return {
      segurados,
      casamentosPendentes: contagens.casamentos,
      reportesAbertos: contagens.reportes,
      erratas: contagens.erratas,
    };
  }

  async eventos(filtro: FiltroEventos): Promise<Pagina<EventoRevisao>> {
    const params: unknown[] = [filtro.status];
    const param = (valor: unknown) => {
      params.push(valor);
      return `$${params.length}`;
    };
    const condicoes = ['e.status = $1'];
    if (filtro.motivo) condicoes.push(`e.motivo = ${param(filtro.motivo)}`);
    if (filtro.tipo) condicoes.push(`e.tipo = ${param(filtro.tipo)}`);
    if (filtro.q) {
      condicoes.push(
        `canon.normaliza(e.titulo) LIKE '%' || canon.normaliza(${param(filtro.q)}) || '%'`,
      );
    } else if (filtro.status !== 'segurado') {
      // Publicados e arquivados: sem busca, só os que passaram pelo painel.
      condicoes.push(`e.revisado_por LIKE 'admin:%'`);
    }
    const ordem =
      filtro.status === 'segurado'
        ? 'e.valor DESC NULLS LAST, e.ocorrido_em DESC, e.id'
        : 'e.revisado_em DESC NULLS LAST, e.ocorrido_em DESC, e.id';
    const linhas = await this.db.query<EventoRevisao & { total: number }>(
      `SELECT ${COLUNAS_EVENTO}, count(*) OVER ()::integer AS total
         FROM feed.evento e
        WHERE ${condicoes.join(' AND ')}
        ORDER BY ${ordem}
        LIMIT ${param(filtro.porPagina)} OFFSET ${param((filtro.pagina - 1) * filtro.porPagina)}`,
      params,
    );
    return {
      itens: linhas.map((linha) => {
        const evento: EventoRevisao & { total?: number } = { ...linha };
        delete evento.total;
        return evento;
      }),
      total: linhas[0]?.total ?? 0,
    };
  }

  async evento(id: string): Promise<DetalheEvento | null> {
    const [linha] = await this.db.query<
      Omit<DetalheEvento, 'alvos' | 'erratas' | 'acoes'>
    >(
      `SELECT ${COLUNAS_EVENTO}, e.payload, r.descricao AS "regraDescricao",
              r.parametros AS "regraParametros"
         FROM feed.evento e
         JOIN feed.regra r ON r.tipo = e.tipo AND r.versao = e.regra_versao
        WHERE e.id = $1`,
      [id],
    );
    if (!linha) return null;
    const alvos = await this.db.query<DetalheEvento['alvos'][number]>(
      `SELECT a.alvo_tipo AS tipo, a.alvo_id AS id, a.papel,
              coalesce(${NOME_ALVO}, a.alvo_id) AS nome
         FROM feed.evento_alvo a WHERE a.evento_id = $1
        ORDER BY a.alvo_tipo, a.papel, a.alvo_id`,
      [id],
    );
    const erratas = await this.listarErratas('WHERE x.evento_id = $1', [id]);
    const acoes = await this.listarAcoes(
      `WHERE a.alvo_tipo = 'evento' AND a.alvo_id = $1`,
      [id],
    );
    return { ...linha, alvos, erratas, acoes };
  }

  async revisarEventos(
    acao: 'publicar' | 'arquivar',
    itens: ItemRevisao[],
    revisor: Revisor,
    nota: string | null,
  ): Promise<ResultadoRevisao> {
    return this.db.transacao(async (tx) => {
      const resultado: ResultadoRevisao = { revisados: [], recusados: [] };
      for (const item of itens) {
        // Publicar: só segurado, com fonte e na versão que o revisor viu. Um
        // evento já publicado antes (voltou a ser segurado porque o valor
        // mudou) mantém o publicado_em: a fila de avisos não o vê de novo.
        // Arquivar: segurado ou publicado (retira do app).
        const sql =
          acao === 'publicar'
            ? `UPDATE feed.evento
                  SET status = 'publicado', motivo = NULL,
                      publicado_em = coalesce(publicado_em, now()),
                      revisado_em = now(), revisado_por = $3, atualizado_em = now()
                WHERE id = $1 AND content_hash = $2 AND status = 'segurado'
                  AND fonte_url IS NOT NULL
                RETURNING tipo, valor::float8 AS valor, titulo, publicado_em`
            : `UPDATE feed.evento
                  SET status = 'arquivado', motivo = 'admin',
                      revisado_em = now(), revisado_por = $3, atualizado_em = now()
                WHERE id = $1 AND content_hash = $2 AND status <> 'arquivado'
                RETURNING tipo, valor::float8 AS valor, titulo, publicado_em`;
        const [feito] = await tx.query<{
          tipo: string;
          valor: number | null;
          titulo: string;
          publicado_em: Date | null;
        }>(sql, [item.id, item.contentHash, revisadoPor(revisor)]);
        if (!feito) {
          resultado.recusados.push({
            id: item.id,
            motivo: await this.porQueRecusou(tx, acao, item),
          });
          continue;
        }
        await registrarAcao(tx, revisor, `evento.${acao}`, 'evento', item.id, {
          tipo: feito.tipo,
          valor: feito.valor,
          titulo: feito.titulo,
          ...(nota ? { nota } : {}),
        });
        resultado.revisados.push(item.id);
      }
      return resultado;
    });
  }

  private async porQueRecusou(
    tx: Executor,
    acao: 'publicar' | 'arquivar',
    item: ItemRevisao,
  ): Promise<RecusaRevisao> {
    const [atual] = await tx.query<{
      status: string;
      content_hash: string;
      fonte_url: string | null;
    }>(
      'SELECT status, content_hash, fonte_url FROM feed.evento WHERE id = $1',
      [item.id],
    );
    if (!atual) return 'nao_encontrado';
    if (atual.content_hash !== item.contentHash) return 'mudou';
    if (acao === 'arquivar') return 'ja_arquivado';
    if (atual.status !== 'segurado') return 'nao_segurado';
    return 'sem_fonte';
  }

  async casamentos(status: Casamento['status']): Promise<Casamento[]> {
    const linhas = await this.db.query<LinhaCasamento>(
      `SELECT ${COLUNAS_CASAMENTO} FROM canon.match_review m ${REGISTRO_FONTE}
        WHERE m.status = $1
        ORDER BY coalesce(m.resolvido_em, m.criado_em) DESC, m.fonte, m.id_fonte`,
      [status],
    );
    return this.comCandidatos(linhas);
  }

  async casamento(fonte: string, idFonte: string): Promise<Casamento | null> {
    const linhas = await this.db.query<LinhaCasamento>(
      `SELECT ${COLUNAS_CASAMENTO} FROM canon.match_review m ${REGISTRO_FONTE}
        WHERE m.fonte = $1 AND m.id_fonte = $2`,
      [fonte, idFonte],
    );
    const [casamento] = await this.comCandidatos(linhas);
    return casamento ?? null;
  }

  private async comCandidatos(linhas: LinhaCasamento[]): Promise<Casamento[]> {
    const ids = [...new Set(linhas.flatMap((l) => l.candidatos))];
    const pessoas = ids.length
      ? await this.db.query<PessoaCandidata>(
          `${DETALHE_PESSOAS} WHERE p.id = ANY($1::uuid[])`,
          [ids],
        )
      : [];
    const porId = new Map(pessoas.map((p) => [p.id, p]));
    return linhas.map((l) => ({
      fonte: l.fonte,
      idFonte: l.idFonte,
      motivo: l.motivo,
      status: l.status,
      criadoEm: l.criadoEm,
      registro: {
        nome: l.nome,
        nomeCompleto: l.nome_completo,
        nascimento: l.nascimento,
        uf: l.uf,
        partido: l.partido,
        url: l.url,
        emExercicio: l.em_exercicio,
      },
      candidatos: l.candidatos
        .map((id) => porId.get(id))
        .filter((p): p is PessoaCandidata => Boolean(p)),
      pessoaId: l.pessoaId,
      pessoaNome: l.pessoaNome,
      resolvidoEm: l.resolvidoEm,
      resolvidoPor: l.resolvidoPor,
      nota: l.nota,
    }));
  }

  /** Nome parecido (trigramas, sem acento), como a busca do app. */
  buscarPessoas(q: string): Promise<PessoaCandidata[]> {
    return this.db.query<PessoaCandidata>(
      `WITH achados AS (
         SELECT p.id,
                similarity(canon.normaliza($1),
                           canon.normaliza(coalesce(p.nome_exibicao, '') || ' '
                                           || coalesce(p.nome_civil, ''))) AS nota
           FROM canon.pessoa p
          WHERE canon.normaliza($1) <% canon.normaliza(coalesce(p.nome_exibicao, '') || ' '
                                                       || coalesce(p.nome_civil, ''))
          ORDER BY nota DESC LIMIT 20)
       ${DETALHE_PESSOAS} JOIN achados ON achados.id = p.id
        ORDER BY achados.nota DESC`,
      [q],
    );
  }

  async resolverCasamento(
    fonte: string,
    idFonte: string,
    decisao:
      | { tipo: 'vincular'; pessoaId: string }
      | { tipo: 'nova' }
      | { tipo: 'descartar' },
    revisor: Revisor,
    nota: string | null,
  ): Promise<{ ok: boolean; pessoaId: string | null }> {
    return this.db.transacao(async (tx) => {
      const [pendente] = await tx.query(
        `SELECT 1 FROM canon.match_review
          WHERE fonte = $1 AND id_fonte = $2 AND status = 'pendente' FOR UPDATE`,
        [fonte, idFonte],
      );
      if (!pendente) return { ok: false, pessoaId: null };
      let pessoaId: string | null = null;
      if (decisao.tipo === 'vincular') pessoaId = decisao.pessoaId;
      if (decisao.tipo === 'nova') {
        // Nome e data do próprio registro; a próxima resolução do worker
        // confere com a fonte.
        const [nova] = await tx.query<{ id: string }>(
          `INSERT INTO canon.pessoa (nome_civil, nome_exibicao, data_nascimento)
           SELECT coalesce(s.nome_completo, d.nome_civil, t.nm_candidato),
                  coalesce(s.nome_parlamentar, d.nome_parlamentar, t.nm_urna_candidato),
                  coalesce(s.data_nascimento, d.data_nascimento, t.dt_nascimento)
             FROM canon.match_review m ${REGISTRO_FONTE}
            WHERE m.fonte = $1 AND m.id_fonte = $2
           RETURNING id`,
          [fonte, idFonte],
        );
        pessoaId = nova.id;
      }
      if (pessoaId) {
        // 'manual': o worker nunca sobrescreve este vínculo.
        await tx.query(
          `INSERT INTO canon.pessoa_vinculo (fonte, id_fonte, pessoa_id, metodo, confianca)
           VALUES ($1, $2, $3, 'manual', 1.0)
           ON CONFLICT (fonte, id_fonte) DO UPDATE
             SET pessoa_id = EXCLUDED.pessoa_id, metodo = 'manual', confianca = 1.0`,
          [fonte, idFonte, pessoaId],
        );
      }
      await tx.query(
        `UPDATE canon.match_review
            SET status = $3, pessoa_id = $4, resolvido_em = now(), resolvido_por = $5,
                nota = $6, atualizado_em = now()
          WHERE fonte = $1 AND id_fonte = $2`,
        [
          fonte,
          idFonte,
          decisao.tipo === 'descartar' ? 'descartado' : 'resolvido',
          pessoaId,
          revisadoPor(revisor),
          nota,
        ],
      );
      await registrarAcao(
        tx,
        revisor,
        `casamento.${decisao.tipo}`,
        'casamento',
        `${fonte}:${idFonte}`,
        { pessoaId, ...(nota ? { nota } : {}) },
      );
      return { ok: true, pessoaId };
    });
  }

  reportes(status: Reporte['status']): Promise<Reporte[]> {
    return this.db.query<Reporte>(
      `SELECT r.id, r.evento_id AS "eventoId", e.titulo AS "eventoTitulo",
              e.status AS "eventoStatus", r.motivo, r.texto, r.criado_em AS "criadoEm",
              r.status, r.resolvido_em AS "resolvidoEm",
              (SELECT u.nome FROM admin.usuario u WHERE u.id = r.resolvido_por)
                AS "resolvidoPor",
              r.errata_id AS "errataId"
         FROM app.reporte r JOIN feed.evento e ON e.id = r.evento_id
        WHERE r.status = $1
        ORDER BY ${status === 'aberto' ? 'r.criado_em' : 'r.resolvido_em DESC'}
        LIMIT 500`,
      [status],
    );
  }

  async descartarReporte(
    id: string,
    revisor: Revisor,
    nota: string | null,
  ): Promise<boolean> {
    return this.db.transacao(async (tx) => {
      const linhas = await tx.query(
        `UPDATE app.reporte SET status = 'descartado', resolvido_em = now(),
                resolvido_por = $2
          WHERE id = $1 AND status = 'aberto' RETURNING id`,
        [id, revisor.id],
      );
      if (linhas.length === 0) return false;
      await registrarAcao(tx, revisor, 'reporte.descartar', 'reporte', id, {
        ...(nota ? { nota } : {}),
      });
      return true;
    });
  }

  async erratas(pagina: number, porPagina: number): Promise<Pagina<Errata>> {
    const itens = await this.listarErratas('', [], pagina, porPagina);
    const [{ total }] = await this.db.query<{ total: number }>(
      'SELECT count(*)::integer AS total FROM feed.errata',
    );
    return { itens, total };
  }

  private listarErratas(
    onde: string,
    params: unknown[],
    pagina = 1,
    porPagina = 100,
  ): Promise<Errata[]> {
    const n = params.length;
    return this.db.query<Errata>(
      `SELECT x.id, x.titulo, x.texto, x.evento_id AS "eventoId", e.titulo AS "eventoTitulo",
              x.pessoa_id AS "pessoaId",
              coalesce(p.nome_exibicao, p.nome_civil) AS "pessoaNome",
              x.publicada_em AS "publicadaEm",
              coalesce((SELECT u.nome FROM admin.usuario u WHERE u.id = x.publicada_por), '')
                AS "publicadaPor"
         FROM feed.errata x
         LEFT JOIN feed.evento e ON e.id = x.evento_id
         LEFT JOIN canon.pessoa p ON p.id = x.pessoa_id
         ${onde}
        ORDER BY x.publicada_em DESC, x.id DESC
        LIMIT $${n + 1} OFFSET $${n + 2}`,
      [...params, porPagina, (pagina - 1) * porPagina],
    );
  }

  async publicarErrata(dados: NovaErrata, revisor: Revisor): Promise<string> {
    return this.db.transacao(async (tx) => {
      const [errata] = await tx.query<{ id: string }>(
        `INSERT INTO feed.errata (evento_id, pessoa_id, titulo, texto, publicada_por)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [dados.eventoId, dados.pessoaId, dados.titulo, dados.texto, revisor.id],
      );
      if (dados.reporteIds.length > 0) {
        await tx.query(
          `UPDATE app.reporte SET status = 'corrigido', resolvido_em = now(),
                  resolvido_por = $2, errata_id = $3
            WHERE id = ANY($1::uuid[]) AND status = 'aberto'`,
          [dados.reporteIds, revisor.id, errata.id],
        );
      }
      if (dados.eventoId && dados.arquivarEvento) {
        const arquivado = await tx.query(
          `UPDATE feed.evento
              SET status = 'arquivado', motivo = 'admin', revisado_em = now(),
                  revisado_por = $2, atualizado_em = now()
            WHERE id = $1 AND status <> 'arquivado' RETURNING id`,
          [dados.eventoId, revisadoPor(revisor)],
        );
        if (arquivado.length > 0) {
          await registrarAcao(
            tx,
            revisor,
            'evento.arquivar',
            'evento',
            dados.eventoId,
            { errataId: errata.id },
          );
        }
      }
      await registrarAcao(tx, revisor, 'errata.publicar', 'errata', errata.id, {
        titulo: dados.titulo,
        eventoId: dados.eventoId,
        pessoaId: dados.pessoaId,
        reportes: dados.reporteIds.length,
        arquivarEvento: dados.arquivarEvento,
      });
      return errata.id;
    });
  }

  async acoes(pagina: number, porPagina: number): Promise<Pagina<Acao>> {
    const itens = await this.listarAcoes('', [], pagina, porPagina);
    const [{ total }] = await this.db.query<{ total: number }>(
      'SELECT count(*)::integer AS total FROM admin.acao',
    );
    return { itens, total };
  }

  private listarAcoes(
    onde: string,
    params: unknown[],
    pagina = 1,
    porPagina = 100,
  ): Promise<Acao[]> {
    const n = params.length;
    return this.db.query<Acao>(
      `SELECT a.id::float8 AS id, u.nome AS admin, a.acao, a.alvo_tipo AS "alvoTipo",
              a.alvo_id AS "alvoId", a.detalhe, a.criada_em AS "criadaEm"
         FROM admin.acao a JOIN admin.usuario u ON u.id = a.usuario_id
         ${onde}
        ORDER BY a.criada_em DESC, a.id DESC
        LIMIT $${n + 1} OFFSET $${n + 2}`,
      [...params, porPagina, (pagina - 1) * porPagina],
    );
  }
}
