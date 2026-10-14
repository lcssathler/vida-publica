import { CATEGORIAS, type Categoria } from './rotulos';

export interface FiltrosFeed {
  escopo: 'seguindo' | 'todos';
  categorias: Categoria[];
  assuntos: string[];
}

export const FILTROS_PADRAO: FiltrosFeed = { escopo: 'seguindo', categorias: [], assuntos: [] };

export function semFiltros(f: FiltrosFeed): boolean {
  return f.categorias.length === 0 && f.assuntos.length === 0;
}

/** /feed com escopo, tipos (das categorias) e assuntos repetidos (têm vírgula no nome). */
export function caminhoFeed(f: FiltrosFeed, cursor: string | null, limite = 20): string {
  const partes = [`escopo=${f.escopo}`, `limite=${limite}`];
  const tipos = f.categorias.flatMap((c) => CATEGORIAS[c].tipos);
  if (tipos.length) partes.push(`tipo=${tipos.join(',')}`);
  for (const assunto of f.assuntos) partes.push(`assunto=${encodeURIComponent(assunto)}`);
  if (cursor) partes.push(`cursor=${encodeURIComponent(cursor)}`);
  return `/feed?${partes.join('&')}`;
}
