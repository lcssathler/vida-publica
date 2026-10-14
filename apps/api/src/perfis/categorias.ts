import { TipoEvento } from '../feed/evento';

/** Categorias do perfil: cada tipo de evento cai em exatamente uma. */
export const CATEGORIAS = {
  votos: ['voto_nominal', 'voto_contra_orientacao'],
  presenca: ['presenca', 'ausencia'],
  gastos: ['despesa_mensal'],
  propostas: ['pauta', 'tramitacao', 'mudanca_regime', 'proposta_parada'],
  campanha: ['fundo_recebido', 'repasse', 'doacao'],
  eleicoes: ['troca_partido', 'situacao_candidatura', 'resultado'],
} as const satisfies Record<string, readonly TipoEvento[]>;

export type Categoria = keyof typeof CATEGORIAS;

export const NOMES_CATEGORIAS = Object.keys(CATEGORIAS) as [
  Categoria,
  ...Categoria[],
];

export interface ContagemCategoria {
  categoria: Categoria;
  /** Eventos publicados e visíveis ao usuário, por tipo. */
  eventos: number;
  porTipo: Partial<Record<TipoEvento, number>>;
}

/** Agrupa a contagem por tipo nas categorias, na ordem de CATEGORIAS. */
export function porCategoria(
  porTipo: Partial<Record<TipoEvento, number>>,
): ContagemCategoria[] {
  return NOMES_CATEGORIAS.map((categoria) => {
    const tipos: readonly TipoEvento[] = CATEGORIAS[categoria];
    const daCategoria: Partial<Record<TipoEvento, number>> = {};
    let eventos = 0;
    for (const tipo of tipos) {
      const n = porTipo[tipo] ?? 0;
      if (n > 0) daCategoria[tipo] = n;
      eventos += n;
    }
    return { categoria, eventos, porTipo: daCategoria };
  });
}
