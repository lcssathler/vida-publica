import { Inject, Injectable } from '@nestjs/common';
import { Db } from '../db/db';
import { Alvo, AlvoTipo } from '../seguir/alvo';
import { AlvoDoEvento, EventoFeed, TipoEvento } from './evento';
import { ConsultaFeed, FeedRepositorio, PaginaFeed } from './feed.repositorio';

interface LinhaEvento {
  id: string;
  tipo: TipoEvento;
  ocorrido_em: Date;
  cursor_em: string;
  titulo: string;
  resumo: string | null;
  valor: number | null;
  payload: Record<string, unknown>;
  visibilidade: 'geral' | 'seguidores';
  publicado_em: Date;
  fonte_url: string;
  fonte_dado_em: Date | null;
  coletado_em: Date;
  regra_versao: number;
  regra_descricao?: string;
}

const COLUNAS = `e.id, e.tipo, e.ocorrido_em, e.ocorrido_em::text AS cursor_em,
  e.titulo, e.resumo, e.valor::float8 AS valor, e.payload, e.visibilidade,
  e.publicado_em, e.fonte_url, e.fonte_dado_em, e.coletado_em, e.regra_versao`;

/** O usuário ($1) segue algum alvo do evento e. */
const SEGUE_ALVO = `EXISTS (
  SELECT 1 FROM feed.evento_alvo sa
    JOIN app.seguindo s ON s.alvo_tipo = sa.alvo_tipo AND s.alvo_id = sa.alvo_id
   WHERE sa.evento_id = e.id AND s.usuario_id = $1)`;

/**
 * Contrato do feed (Fase 4): só publicado, só com fonte, e "seguidores" só
 * para quem segue algum alvo do evento (em campanha, os de candidatos).
 */
const VISIVEL = `e.status = 'publicado' AND e.fonte_url IS NOT NULL
  AND (e.visibilidade = 'geral' OR ${SEGUE_ALVO})`;

/**
 * A lista mostra fatos até depois de amanhã: pauta marcada para os próximos
 * dias entra; datas mais à frente (erro de digitação na fonte, mês de despesa
 * ainda aberto) não ficam presas no topo. O detalhe do evento continua aberto.
 */
const HORIZONTE = `e.ocorrido_em <= now() + interval '2 days'`;

@Injectable()
export class PostgresFeedRepositorio extends FeedRepositorio {
  constructor(@Inject(Db) private readonly db: Db) {
    super();
  }

  async pagina(consulta: ConsultaFeed): Promise<PaginaFeed> {
    const params: unknown[] = [consulta.usuarioId];
    const param = (valor: unknown) => {
      params.push(valor);
      return `$${params.length}`;
    };
    const condicoes = [VISIVEL, HORIZONTE];
    if (consulta.escopo === 'seguindo') condicoes.push(SEGUE_ALVO);
    if (consulta.tipos.length > 0) {
      condicoes.push(`e.tipo = ANY(${param(consulta.tipos)}::text[])`);
    }
    if (consulta.assuntos.length > 0) {
      condicoes.push(`EXISTS (
        SELECT 1 FROM feed.evento_alvo fa
         WHERE fa.evento_id = e.id AND fa.alvo_tipo = 'assunto'
           AND fa.alvo_id = ANY(${param(consulta.assuntos)}::text[]))`);
    }
    if (consulta.alvo) {
      condicoes.push(`EXISTS (
        SELECT 1 FROM feed.evento_alvo fa
         WHERE fa.evento_id = e.id AND fa.alvo_tipo = ${param(consulta.alvo.tipo)}
           AND fa.alvo_id = ${param(consulta.alvo.id)})`);
    }
    if (consulta.depoisDe) {
      condicoes.push(
        `(e.ocorrido_em, e.id) < (${param(consulta.depoisDe.ocorridoEm)}::timestamptz, ${param(consulta.depoisDe.id)}::uuid)`,
      );
    }
    const linhas = await this.db.query<LinhaEvento>(
      `SELECT ${COLUNAS} FROM feed.evento e
        WHERE ${condicoes.join('\n          AND ')}
        ORDER BY e.ocorrido_em DESC, e.id DESC
        LIMIT ${param(consulta.limite + 1)}`,
      params,
    );
    const temMais = linhas.length > consulta.limite;
    const pagina = linhas.slice(0, consulta.limite);
    const eventos = await this.comAlvos(pagina, consulta.usuarioId);
    const ultima = pagina.at(-1);
    return {
      eventos,
      proximo:
        temMais && ultima
          ? { ocorridoEm: ultima.cursor_em, id: ultima.id }
          : null,
    };
  }

  async contarPorTipo(
    alvo: Alvo,
    usuarioId: string,
  ): Promise<Partial<Record<TipoEvento, number>>> {
    const linhas = await this.db.query<{ tipo: TipoEvento; n: number }>(
      `SELECT e.tipo, count(*)::integer AS n
         FROM feed.evento_alvo fa
         JOIN feed.evento e ON e.id = fa.evento_id
        WHERE fa.alvo_tipo = $2 AND fa.alvo_id = $3
          AND ${VISIVEL} AND ${HORIZONTE}
        GROUP BY e.tipo`,
      [usuarioId, alvo.tipo, alvo.id],
    );
    return Object.fromEntries(linhas.map((l) => [l.tipo, l.n]));
  }

  async evento(id: string, usuarioId: string): Promise<EventoFeed | null> {
    const linhas = await this.db.query<LinhaEvento>(
      `SELECT ${COLUNAS}, r.descricao AS regra_descricao
         FROM feed.evento e
         JOIN feed.regra r ON r.tipo = e.tipo AND r.versao = e.regra_versao
        WHERE e.id = $2 AND ${VISIVEL}`,
      [usuarioId, id],
    );
    const [evento] = await this.comAlvos(linhas, usuarioId);
    return evento ?? null;
  }

  private async comAlvos(
    linhas: LinhaEvento[],
    usuarioId: string,
  ): Promise<EventoFeed[]> {
    if (linhas.length === 0) return [];
    const alvos = await this.db.query<{
      evento_id: string;
      alvo_tipo: AlvoTipo;
      alvo_id: string;
      papel: string;
      nome: string | null;
      seguindo: boolean;
    }>(
      `SELECT a.evento_id, a.alvo_tipo, a.alvo_id, a.papel,
              CASE a.alvo_tipo
                WHEN 'pessoa' THEN coalesce(pe.nome_exibicao, pe.nome_civil)
                WHEN 'partido' THEN pa.sigla
                WHEN 'proposicao' THEN pr.identificacao
                ELSE a.alvo_id
              END AS nome,
              s.usuario_id IS NOT NULL AS seguindo
         FROM feed.evento_alvo a
         LEFT JOIN canon.pessoa pe
           ON pe.id = CASE WHEN a.alvo_tipo = 'pessoa' THEN a.alvo_id::uuid END
         LEFT JOIN canon.partido pa
           ON pa.id = CASE WHEN a.alvo_tipo = 'partido' THEN a.alvo_id::integer END
         LEFT JOIN canon.proposicao pr
           ON pr.id = CASE WHEN a.alvo_tipo = 'proposicao' THEN a.alvo_id::uuid END
         LEFT JOIN app.seguindo s
           ON s.usuario_id = $2 AND s.alvo_tipo = a.alvo_tipo AND s.alvo_id = a.alvo_id
        WHERE a.evento_id = ANY($1::uuid[])
        ORDER BY a.alvo_tipo, a.papel, a.alvo_id`,
      [linhas.map((l) => l.id), usuarioId],
    );
    const porEvento = new Map<string, AlvoDoEvento[]>();
    for (const a of alvos) {
      const lista = porEvento.get(a.evento_id) ?? [];
      lista.push({
        tipo: a.alvo_tipo,
        id: a.alvo_id,
        papel: a.papel,
        nome: a.nome ?? a.alvo_id,
        seguindo: a.seguindo,
      });
      porEvento.set(a.evento_id, lista);
    }
    return linhas.map((l) => ({
      id: l.id,
      tipo: l.tipo,
      ocorridoEm: l.ocorrido_em,
      titulo: l.titulo,
      resumo: l.resumo,
      valor: l.valor,
      payload: l.payload,
      visibilidade: l.visibilidade,
      publicadoEm: l.publicado_em,
      fonte: {
        url: l.fonte_url,
        dadoEm: l.fonte_dado_em,
        coletadoEm: l.coletado_em,
      },
      regra: {
        versao: l.regra_versao,
        ...(l.regra_descricao ? { descricao: l.regra_descricao } : {}),
      },
      alvos: porEvento.get(l.id) ?? [],
    }));
  }
}
