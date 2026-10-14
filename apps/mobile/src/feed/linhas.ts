import type { EventoFeed } from '../api/tipos';
import { diaIso } from '../comum/formato';
import type { Marco } from '../sessao/local';

/** Ordem do feed: (ocorridoEm, id) decrescente. Positivo se `a` vem antes (é mais novo). */
export function maisNovo(a: Marco, b: Marco): number {
  const ta = Date.parse(a.ocorridoEm);
  const tb = Date.parse(b.ocorridoEm);
  if (ta !== tb) return ta - tb;
  return a.id === b.id ? 0 : a.id > b.id ? 1 : -1;
}

export type Linha =
  | { tipo: 'dia'; chave: string; iso: string }
  | { tipo: 'parou'; chave: 'parou' }
  | { tipo: 'evento'; chave: string; evento: EventoFeed; novo: boolean };

/**
 * Linhas da lista: cabeçalho a cada dia (de Brasília), os registros e, se
 * houver algo mais novo que o marco da última visita, o divisor "Você parou
 * aqui" antes do primeiro registro já visto. Os mais novos ficam grifados.
 */
export function montarLinhas(eventos: EventoFeed[], marco: Marco | null): Linha[] {
  const linhas: Linha[] = [];
  let diaAtual: string | null = null;
  let viuNovo = false;
  let divisor = false;
  const vistos = new Set<string>();
  for (const evento of eventos) {
    if (vistos.has(evento.id)) continue;
    vistos.add(evento.id);
    const novo = marco !== null && maisNovo(evento, marco) > 0;
    if (novo) viuNovo = true;
    if (marco && !novo && viuNovo && !divisor) {
      linhas.push({ tipo: 'parou', chave: 'parou' });
      divisor = true;
      diaAtual = null; // repete o dia depois do divisor
    }
    const dia = diaIso(evento.ocorridoEm);
    if (dia !== diaAtual) {
      linhas.push({ tipo: 'dia', chave: `dia:${dia}:${linhas.length}`, iso: evento.ocorridoEm });
      diaAtual = dia;
    }
    linhas.push({ tipo: 'evento', chave: evento.id, evento, novo });
  }
  return linhas;
}
