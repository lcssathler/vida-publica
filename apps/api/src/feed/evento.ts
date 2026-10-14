import { AlvoTipo } from '../seguir/alvo';

/** Os 15 tipos de evento da regra v1 (feed.regra). */
export const TIPOS_EVENTO = [
  'voto_nominal',
  'voto_contra_orientacao',
  'pauta',
  'tramitacao',
  'mudanca_regime',
  'proposta_parada',
  'presenca',
  'ausencia',
  'despesa_mensal',
  'fundo_recebido',
  'repasse',
  'doacao',
  'troca_partido',
  'situacao_candidatura',
  'resultado',
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export interface AlvoDoEvento {
  tipo: AlvoTipo;
  id: string;
  /** votante, autor, relator, candidato, origem, destino... (vazio quando não se aplica) */
  papel: string;
  /** Nome no canon: pessoa, sigla do partido, identificação da proposta ou tema. */
  nome: string;
  /** O usuário segue este alvo. */
  seguindo: boolean;
}

/** Evento publicado, como o app recebe. Sempre com a fonte. */
export interface EventoFeed {
  id: string;
  tipo: TipoEvento;
  ocorridoEm: Date;
  titulo: string;
  resumo: string | null;
  valor: number | null;
  payload: Record<string, unknown>;
  visibilidade: 'geral' | 'seguidores';
  publicadoEm: Date;
  fonte: { url: string; dadoEm: Date | null; coletadoEm: Date };
  regra: { versao: number; descricao?: string };
  alvos: AlvoDoEvento[];
}

/** Posição no feed: o último evento da página anterior. */
export interface Cursor {
  /** ocorrido_em como o Postgres escreve (precisão de microssegundos). */
  ocorridoEm: string;
  id: string;
}
