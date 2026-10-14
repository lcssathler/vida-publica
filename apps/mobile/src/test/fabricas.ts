import type { EventoFeed } from '../api/tipos';

let sequencia = 0;

/** Evento fictício (pessoas e números inventados), com fonte. */
export function evento(parcial: Partial<EventoFeed> = {}): EventoFeed {
  sequencia += 1;
  const id = parcial.id ?? `00000000-0000-4000-8000-${String(sequencia).padStart(12, '0')}`;
  return {
    id,
    tipo: 'voto_nominal',
    ocorridoEm: '2026-10-14T17:32:00.000Z',
    titulo: `Maria Exemplo votou Sim — PL ${sequencia}/2026`,
    resumo: 'Aprovado. Sim: 300; Não: 100.',
    valor: null,
    payload: {},
    visibilidade: 'geral',
    publicadoEm: '2026-10-14T18:00:00.000Z',
    fonte: {
      url: 'https://dadosabertos.camara.leg.br/api/v2/votacoes/1',
      dadoEm: '2026-10-14T12:00:00.000Z',
      coletadoEm: '2026-10-14T13:00:00.000Z',
    },
    regra: { versao: 1 },
    alvos: [],
    ...parcial,
  };
}
