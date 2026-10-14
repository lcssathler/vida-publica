import { z } from 'zod';

export const ALVO_TIPOS = [
  'pessoa',
  'partido',
  'proposicao',
  'assunto',
] as const;
export type AlvoTipo = (typeof ALVO_TIPOS)[number];

/**
 * O que pode ser seguido e filtrado: os mesmos alvos de feed.evento_alvo.
 * pessoa e proposicao = uuid do canon; partido = id numérico de canon.partido;
 * assunto = nome do tema oficial.
 */
export interface Alvo {
  tipo: AlvoTipo;
  id: string;
}

const idPorTipo: Record<AlvoTipo, z.ZodType<string>> = {
  pessoa: z.uuid(),
  proposicao: z.uuid(),
  partido: z.string().regex(/^[1-9][0-9]{0,8}$/, 'id de partido numérico'),
  assunto: z.string().trim().min(1).max(200),
};

/** Valida tipo e id juntos (o formato do id depende do tipo). */
export const alvoSchema = z
  .object({ tipo: z.enum(ALVO_TIPOS), id: z.string() })
  .transform((alvo, ctx): Alvo => {
    const id = idPorTipo[alvo.tipo].safeParse(alvo.id);
    if (!id.success) {
      ctx.addIssue({
        code: 'custom',
        path: ['id'],
        message: `id inválido para ${alvo.tipo}`,
      });
      return z.NEVER;
    }
    return { tipo: alvo.tipo, id: id.data };
  });
