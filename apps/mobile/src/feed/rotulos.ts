import { diaIso } from '../comum/formato';
import type { EventoFeed, TipoEvento } from '../api/tipos';

/** Nome de cada tipo, como aparece no alto do registro. */
export const NOME_TIPO: Record<TipoEvento, string> = {
  voto_nominal: 'Votação nominal',
  voto_contra_orientacao: 'Voto contra a orientação',
  pauta: 'Pauta',
  tramitacao: 'Tramitação',
  mudanca_regime: 'Mudança de regime',
  proposta_parada: 'Proposta parada',
  presenca: 'Presença',
  ausencia: 'Ausência',
  despesa_mensal: 'Despesas da cota',
  fundo_recebido: 'Fundo recebido',
  repasse: 'Repasse',
  doacao: 'Doações',
  troca_partido: 'Troca de partido',
  situacao_candidatura: 'Candidatura',
  resultado: 'Resultado da eleição',
};

/** As mesmas categorias dos perfis na API: cada tipo cai em uma. */
export const CATEGORIAS = {
  votos: { nome: 'Votos', tipos: ['voto_nominal', 'voto_contra_orientacao'] },
  presenca: { nome: 'Presença', tipos: ['presenca', 'ausencia'] },
  gastos: { nome: 'Gastos', tipos: ['despesa_mensal'] },
  propostas: { nome: 'Propostas', tipos: ['pauta', 'tramitacao', 'mudanca_regime', 'proposta_parada'] },
  campanha: { nome: 'Campanha', tipos: ['fundo_recebido', 'repasse', 'doacao'] },
  eleicoes: { nome: 'Eleições', tipos: ['troca_partido', 'situacao_candidatura', 'resultado'] },
} as const satisfies Record<string, { nome: string; tipos: readonly TipoEvento[] }>;

export type Categoria = keyof typeof CATEGORIAS;
export const NOMES_CATEGORIAS = Object.keys(CATEGORIAS) as Categoria[];

export interface Fonte {
  sigla: string;
  nome: string;
}

/** Quem publicou o dado, pelo endereço da fonte. */
export function fonteDaUrl(url: string): Fonte {
  const host = url.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
  if (host.endsWith('camara.leg.br')) return { sigla: 'Câmara', nome: 'Câmara dos Deputados' };
  if (host.endsWith('senado.leg.br') || host.endsWith('senado.gov.br')) {
    return { sigla: 'Senado', nome: 'Senado Federal' };
  }
  if (host.endsWith('tse.jus.br')) return { sigla: 'TSE', nome: 'Tribunal Superior Eleitoral' };
  return { sigla: host, nome: host };
}

/** Número de protocolo do registro: ano · mês e dia · início do id. */
export function protocolo(evento: EventoFeed): string {
  const [ano, mes, dia] = diaIso(evento.ocorridoEm).split('-');
  return `${ano}·${mes}${dia}·${evento.id.replace(/-/g, '').slice(0, 4).toUpperCase()}`;
}

/** Assunto do evento para o sobretítulo: um que a pessoa segue, senão o primeiro. */
export function assuntoDoEvento(evento: EventoFeed): string | null {
  const assuntos = evento.alvos.filter((a) => a.tipo === 'assunto');
  return (assuntos.find((a) => a.seguindo) ?? assuntos[0])?.nome ?? null;
}
