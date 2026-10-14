import { randomUUID } from 'node:crypto';
import { AlvoDoEvento, EventoFeed, TipoEvento } from '../../src/feed/evento';
import {
  ConsultaFeed,
  FeedRepositorio,
  PaginaFeed,
} from '../../src/feed/feed.repositorio';
import { Alvo } from '../../src/seguir/alvo';
import { MemoriaSeguindo } from './memoria-seguindo';

interface EventoGuardado {
  evento: Omit<EventoFeed, 'alvos'>;
  status: 'segurado' | 'publicado' | 'arquivado';
  alvos: Array<Alvo & { papel: string }>;
}

/** Feed em memória que cumpre o mesmo contrato do adaptador Postgres. */
export class MemoriaFeed extends FeedRepositorio {
  readonly eventos: EventoGuardado[] = [];

  constructor(private readonly seguindo: MemoriaSeguindo) {
    super();
  }

  adicionar(dados: {
    tipo?: TipoEvento;
    ocorridoEm: Date;
    status?: EventoGuardado['status'];
    visibilidade?: 'geral' | 'seguidores';
    alvos?: Array<Alvo & { papel?: string }>;
  }): string {
    const id = randomUUID();
    this.eventos.push({
      status: dados.status ?? 'publicado',
      alvos: (dados.alvos ?? []).map((a) => ({ ...a, papel: a.papel ?? '' })),
      evento: {
        id,
        tipo: dados.tipo ?? 'voto_nominal',
        ocorridoEm: dados.ocorridoEm,
        titulo: `Evento ${id.slice(0, 8)}`,
        resumo: null,
        valor: null,
        payload: {},
        visibilidade: dados.visibilidade ?? 'geral',
        publicadoEm: dados.ocorridoEm,
        fonte: {
          url: 'https://dadosabertos.camara.leg.br/',
          dadoEm: null,
          coletadoEm: dados.ocorridoEm,
        },
        regra: { versao: 1 },
      },
    });
    return id;
  }

  private async segue(usuarioId: string, g: EventoGuardado): Promise<boolean> {
    const seguidos = await this.seguindo.listar(usuarioId);
    return g.alvos.some((a) =>
      seguidos.some((s) => s.tipo === a.tipo && s.id === a.id),
    );
  }

  private async visivel(usuarioId: string, g: EventoGuardado) {
    return (
      g.status === 'publicado' &&
      (g.evento.visibilidade === 'geral' || (await this.segue(usuarioId, g)))
    );
  }

  private async montar(
    usuarioId: string,
    g: EventoGuardado,
  ): Promise<EventoFeed> {
    const seguidos = await this.seguindo.listar(usuarioId);
    const alvos: AlvoDoEvento[] = g.alvos.map((a) => ({
      ...a,
      nome: a.id,
      seguindo: seguidos.some((s) => s.tipo === a.tipo && s.id === a.id),
    }));
    return { ...g.evento, alvos };
  }

  async pagina(c: ConsultaFeed): Promise<PaginaFeed> {
    const chave = (g: EventoGuardado) =>
      `${g.evento.ocorridoEm.toISOString()}|${g.evento.id}`;
    const ordenados = [...this.eventos].sort((a, b) =>
      chave(a) < chave(b) ? 1 : -1,
    );
    const selecionados: EventoGuardado[] = [];
    for (const g of ordenados) {
      if (!(await this.visivel(c.usuarioId, g))) continue;
      if (g.evento.ocorridoEm.getTime() > Date.now() + 2 * 86_400_000) {
        continue;
      }
      if (c.escopo === 'seguindo' && !(await this.segue(c.usuarioId, g))) {
        continue;
      }
      if (c.tipos.length && !c.tipos.includes(g.evento.tipo)) continue;
      if (
        c.assuntos.length &&
        !g.alvos.some((a) => a.tipo === 'assunto' && c.assuntos.includes(a.id))
      ) {
        continue;
      }
      if (
        c.alvo &&
        !g.alvos.some((a) => a.tipo === c.alvo?.tipo && a.id === c.alvo.id)
      ) {
        continue;
      }
      if (
        c.depoisDe &&
        chave(g) >=
          `${new Date(c.depoisDe.ocorridoEm).toISOString()}|${c.depoisDe.id}`
      ) {
        continue;
      }
      selecionados.push(g);
    }
    const pagina = selecionados.slice(0, c.limite);
    const ultima = pagina.at(-1);
    return {
      eventos: await Promise.all(
        pagina.map((g) => this.montar(c.usuarioId, g)),
      ),
      proximo:
        selecionados.length > c.limite && ultima
          ? {
              ocorridoEm: ultima.evento.ocorridoEm.toISOString(),
              id: ultima.evento.id,
            }
          : null,
    };
  }

  async evento(id: string, usuarioId: string): Promise<EventoFeed | null> {
    const g = this.eventos.find((e) => e.evento.id === id);
    if (!g || !(await this.visivel(usuarioId, g))) return null;
    return this.montar(usuarioId, g);
  }
}
