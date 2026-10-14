import { Inject, Injectable } from '@nestjs/common';
import { codificarCursor, decodificarCursor } from './cursor';
import { EventoFeed } from './evento';
import { ConsultaFeed, FeedRepositorio } from './feed.repositorio';

export interface PedidoFeed extends Omit<ConsultaFeed, 'depoisDe'> {
  cursor: string | null;
}

export interface RespostaFeed {
  itens: EventoFeed[];
  /** Passe em `cursor` para a próxima página; null quando acabou. */
  proximoCursor: string | null;
}

@Injectable()
export class FeedService {
  constructor(
    @Inject(FeedRepositorio) private readonly feed: FeedRepositorio,
  ) {}

  /** Lança CursorInvalido se o cursor não veio de uma página anterior. */
  async pagina(pedido: PedidoFeed): Promise<RespostaFeed> {
    const { cursor, ...resto } = pedido;
    const pagina = await this.feed.pagina({
      ...resto,
      depoisDe: cursor ? decodificarCursor(cursor) : null,
    });
    return {
      itens: pagina.eventos,
      proximoCursor: pagina.proximo ? codificarCursor(pagina.proximo) : null,
    };
  }

  evento(id: string, usuarioId: string): Promise<EventoFeed | null> {
    return this.feed.evento(id, usuarioId);
  }
}
