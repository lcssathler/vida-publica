/** Errata como o app recebe: sem quem publicou. */
export interface ErrataPublica {
  id: string;
  titulo: string;
  texto: string;
  publicadaEm: Date;
  /** O evento corrigido, só se continua visível para quem pede. */
  evento: { id: string; titulo: string; tipo: string; ocorridoEm: Date } | null;
}

export const MOTIVOS_REPORTE = [
  'fato_errado',
  'pessoa_errada',
  'valor_errado',
  'fonte_quebrada',
  'outro',
] as const;
export type MotivoReporte = (typeof MOTIVOS_REPORTE)[number];

export type ResultadoReporte = 'criado' | 'repetido' | 'invisivel';

export interface PaginaErratas {
  erratas: ErrataPublica[];
  /** Cursor da próxima página (publicada_em e id); null quando acabou. */
  proximo: { publicadaEm: string; id: string } | null;
}

/**
 * Porta das erratas públicas (escritas pelo painel) e dos reportes de erro
 * (escritos pelo app). A API só lê as erratas e só grava reportes.
 */
export abstract class ErratasRepositorio {
  abstract pagina(
    usuarioId: string,
    depoisDe: { publicadaEm: string; id: string } | null,
    limite: number,
  ): Promise<PaginaErratas>;

  /**
   * Grava o reporte da conta sobre um evento que ela consegue ver (um por
   * conta e evento; repetir não grava de novo).
   */
  abstract reportar(
    usuarioId: string,
    eventoId: string,
    motivo: MotivoReporte,
    texto: string | null,
  ): Promise<ResultadoReporte>;
}
