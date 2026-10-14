import type { ItemLinhaDoTempo } from '../api/tipos';

/** A situação só aparece na etapa em que mudou (a lista vai da mais recente à mais antiga). */
export function situacaoMudou(itens: ItemLinhaDoTempo[], indice: number): boolean {
  const item = itens[indice];
  if (item.tipo !== 'tramitacao' || !item.situacao) return false;
  const anterior = itens.slice(indice + 1).find((i) => i.tipo === 'tramitacao');
  return !anterior || anterior.tipo !== 'tramitacao' || anterior.situacao !== item.situacao;
}
