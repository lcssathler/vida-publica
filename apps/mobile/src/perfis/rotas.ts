import type { Alvo } from '../api/tipos';

/** Tela de cada alvo que tem página própria (assunto não tem). */
export function rotaDoAlvo(alvo: Alvo) {
  if (alvo.tipo === 'pessoa') return { pathname: '/pessoa/[id]' as const, params: { id: alvo.id } };
  if (alvo.tipo === 'partido') return { pathname: '/partido/[id]' as const, params: { id: alvo.id } };
  return null;
}
