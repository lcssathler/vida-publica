import { Inject, Injectable } from '@nestjs/common';
import { Db } from '../db/db';
import {
  ErratasRepositorio,
  MotivoReporte,
  PaginaErratas,
  ResultadoReporte,
} from './erratas.repositorio';

/** O usuário ($1) vê o evento e (mesma regra do feed). */
const VISIVEL = `e.status = 'publicado' AND e.fonte_url IS NOT NULL
  AND (e.visibilidade = 'geral' OR EXISTS (
    SELECT 1 FROM feed.evento_alvo sa
      JOIN app.seguindo s ON s.alvo_tipo = sa.alvo_tipo AND s.alvo_id = sa.alvo_id
     WHERE sa.evento_id = e.id AND s.usuario_id = $1))`;

@Injectable()
export class PostgresErratasRepositorio extends ErratasRepositorio {
  constructor(@Inject(Db) private readonly db: Db) {
    super();
  }

  async pagina(
    usuarioId: string,
    depoisDe: { publicadaEm: string; id: string } | null,
    limite: number,
  ): Promise<PaginaErratas> {
    const linhas = await this.db.query<{
      id: string;
      titulo: string;
      texto: string;
      publicada_em: Date;
      cursor_em: string;
      evento_id: string | null;
      evento_titulo: string | null;
      evento_tipo: string | null;
      evento_ocorrido_em: Date | null;
    }>(
      `SELECT x.id, x.titulo, x.texto, x.publicada_em, x.publicada_em::text AS cursor_em,
              e.id AS evento_id, e.titulo AS evento_titulo, e.tipo AS evento_tipo,
              e.ocorrido_em AS evento_ocorrido_em
         FROM feed.errata x
         LEFT JOIN feed.evento e ON e.id = x.evento_id AND ${VISIVEL}
        WHERE ($2::timestamptz IS NULL OR (x.publicada_em, x.id) < ($2::timestamptz, $3::uuid))
        ORDER BY x.publicada_em DESC, x.id DESC
        LIMIT $4`,
      [
        usuarioId,
        depoisDe?.publicadaEm ?? null,
        depoisDe?.id ?? null,
        limite + 1,
      ],
    );
    const pagina = linhas.slice(0, limite);
    const ultima = pagina.at(-1);
    return {
      erratas: pagina.map((l) => ({
        id: l.id,
        titulo: l.titulo,
        texto: l.texto,
        publicadaEm: l.publicada_em,
        evento:
          l.evento_id &&
          l.evento_titulo &&
          l.evento_tipo &&
          l.evento_ocorrido_em
            ? {
                id: l.evento_id,
                titulo: l.evento_titulo,
                tipo: l.evento_tipo,
                ocorridoEm: l.evento_ocorrido_em,
              }
            : null,
      })),
      proximo:
        linhas.length > limite && ultima
          ? { publicadaEm: ultima.cursor_em, id: ultima.id }
          : null,
    };
  }

  async reportar(
    usuarioId: string,
    eventoId: string,
    motivo: MotivoReporte,
    texto: string | null,
  ): Promise<ResultadoReporte> {
    const linhas = await this.db.query<{ criado: boolean }>(
      `WITH visivel AS (
         SELECT e.id FROM feed.evento e WHERE e.id = $2 AND ${VISIVEL}
       ), novo AS (
         INSERT INTO app.reporte (usuario_id, evento_id, motivo, texto)
         SELECT $1, id, $3, $4 FROM visivel
         ON CONFLICT (usuario_id, evento_id) DO NOTHING
         RETURNING 1
       )
       SELECT EXISTS (SELECT 1 FROM novo) AS criado FROM visivel`,
      [usuarioId, eventoId, motivo, texto],
    );
    if (linhas.length === 0) return 'invisivel';
    return linhas[0].criado ? 'criado' : 'repetido';
  }
}
