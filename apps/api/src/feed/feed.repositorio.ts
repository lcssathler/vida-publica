import { Alvo } from '../seguir/alvo';
import { Cursor, EventoFeed, TipoEvento } from './evento';

export interface ConsultaFeed {
  usuarioId: string;
  /** seguindo: só eventos de alvos seguidos; todos: o feed geral. */
  escopo: 'seguindo' | 'todos';
  tipos: TipoEvento[];
  assuntos: string[];
  /** Só eventos deste alvo (linha do tempo de perfil ou proposta). */
  alvo: Alvo | null;
  depoisDe: Cursor | null;
  limite: number;
}

export interface PaginaFeed {
  eventos: EventoFeed[];
  /** Cursor para a próxima página; null quando acabou. */
  proximo: Cursor | null;
}

/**
 * Porta de leitura do feed. Regras que todo adaptador cumpre:
 * - só eventos com status publicado e com fonte;
 * - visibilidade "seguidores" só para quem segue algum alvo do evento;
 * - ordem (ocorrido_em, id) decrescente, com cursor estável.
 */
export abstract class FeedRepositorio {
  abstract pagina(consulta: ConsultaFeed): Promise<PaginaFeed>;

  /** Quantos eventos visíveis ao usuário (na lista) o alvo tem, por tipo. */
  abstract contarPorTipo(
    alvo: Alvo,
    usuarioId: string,
  ): Promise<Partial<Record<TipoEvento, number>>>;

  /** Um evento visível ao usuário, com a descrição da regra; null se não. */
  abstract evento(id: string, usuarioId: string): Promise<EventoFeed | null>;
}
