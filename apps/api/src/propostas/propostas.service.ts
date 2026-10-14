import { Inject, Injectable } from '@nestjs/common';
import { EventoFeed, TipoEvento } from '../feed/evento';
import { FeedService } from '../feed/feed.service';
import { Alvo } from '../seguir/alvo';
import { SeguirService } from '../seguir/seguir.service';
import {
  ItemTramitacao,
  ItemVotacao,
  PropostaDados,
  PropostasRepositorio,
} from './propostas.repositorio';

/**
 * Eventos do feed que entram na linha do tempo como eles mesmos. Tramitação e
 * mudança de regime já aparecem como etapa (ligada ao evento); votos
 * individuais ficam no placar da votação.
 */
export const TIPOS_NA_LINHA_DO_TEMPO: TipoEvento[] = [
  'pauta',
  'proposta_parada',
];

/** Teto de eventos do feed por proposta na linha do tempo. */
const MAX_EVENTOS = 200;

export interface ItemEvento {
  tipo: 'evento';
  data: Date;
  evento: EventoFeed;
}

export type ItemLinhaDoTempo = ItemTramitacao | ItemVotacao | ItemEvento;

export interface Proposta extends PropostaDados {
  seguindo: boolean;
  /** Do mais recente ao mais antigo. */
  linhaDoTempo: ItemLinhaDoTempo[];
}

@Injectable()
export class PropostasService {
  constructor(
    @Inject(PropostasRepositorio)
    private readonly propostas: PropostasRepositorio,
    @Inject(FeedService) private readonly feed: FeedService,
    @Inject(SeguirService) private readonly seguir: SeguirService,
  ) {}

  async proposta(id: string, usuarioId: string): Promise<Proposta | null> {
    const dados = await this.propostas.proposta(id);
    if (!dados) return null;
    const alvo: Alvo = { tipo: 'proposicao', id };
    const [historico, eventos, seguindo] = await Promise.all([
      this.propostas.historico(id),
      this.feed.pagina({
        usuarioId,
        escopo: 'todos',
        tipos: TIPOS_NA_LINHA_DO_TEMPO,
        assuntos: [],
        alvo,
        cursor: null,
        limite: MAX_EVENTOS,
      }),
      this.seguir.segue(usuarioId, alvo),
    ]);
    const linhaDoTempo: ItemLinhaDoTempo[] = [
      ...historico,
      ...eventos.itens.map((evento): ItemEvento => ({
        tipo: 'evento',
        data: evento.ocorridoEm,
        evento,
      })),
    ].sort((a, b) => b.data.getTime() - a.data.getTime());
    return { ...dados, seguindo, linhaDoTempo };
  }
}
