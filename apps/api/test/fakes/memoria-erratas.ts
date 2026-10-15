import { randomUUID } from 'node:crypto';
import {
  ErratasRepositorio,
  MotivoReporte,
  PaginaErratas,
  ResultadoReporte,
} from '../../src/erratas/erratas.repositorio';
import { MemoriaFeed } from './memoria-feed';

/** Erratas e reportes em memória; a visibilidade vem do feed em memória. */
export class MemoriaErratas extends ErratasRepositorio {
  readonly erratas: Array<{
    id: string;
    titulo: string;
    texto: string;
    publicadaEm: Date;
    eventoId: string | null;
  }> = [];
  readonly reportes: Array<{
    usuarioId: string;
    eventoId: string;
    motivo: MotivoReporte;
    texto: string | null;
  }> = [];

  constructor(private readonly feed: MemoriaFeed) {
    super();
  }

  publicar(titulo: string, eventoId: string | null, publicadaEm = new Date()) {
    const id = randomUUID();
    this.erratas.push({
      id,
      titulo,
      texto: `Texto de ${titulo}`,
      publicadaEm,
      eventoId,
    });
    return id;
  }

  async pagina(
    usuarioId: string,
    depoisDe: { publicadaEm: string; id: string } | null,
    limite: number,
  ): Promise<PaginaErratas> {
    const ordenadas = [...this.erratas].sort(
      (a, b) =>
        b.publicadaEm.getTime() - a.publicadaEm.getTime() ||
        b.id.localeCompare(a.id),
    );
    const depois = depoisDe
      ? ordenadas.filter(
          (e) =>
            e.publicadaEm.getTime() < Date.parse(depoisDe.publicadaEm) ||
            (e.publicadaEm.getTime() === Date.parse(depoisDe.publicadaEm) &&
              e.id < depoisDe.id),
        )
      : ordenadas;
    const pagina = depois.slice(0, limite);
    const erratas = await Promise.all(
      pagina.map(async (e) => {
        const evento = e.eventoId
          ? await this.feed.evento(e.eventoId, usuarioId)
          : null;
        return {
          id: e.id,
          titulo: e.titulo,
          texto: e.texto,
          publicadaEm: e.publicadaEm,
          evento: evento
            ? {
                id: evento.id,
                titulo: evento.titulo,
                tipo: evento.tipo,
                ocorridoEm: evento.ocorridoEm,
              }
            : null,
        };
      }),
    );
    const ultima = pagina.at(-1);
    return {
      erratas,
      proximo:
        depois.length > limite && ultima
          ? { publicadaEm: ultima.publicadaEm.toISOString(), id: ultima.id }
          : null,
    };
  }

  async reportar(
    usuarioId: string,
    eventoId: string,
    motivo: MotivoReporte,
    texto: string | null,
  ): Promise<ResultadoReporte> {
    if (!(await this.feed.evento(eventoId, usuarioId))) return 'invisivel';
    if (
      this.reportes.some(
        (r) => r.usuarioId === usuarioId && r.eventoId === eventoId,
      )
    ) {
      return 'repetido';
    }
    this.reportes.push({ usuarioId, eventoId, motivo, texto });
    return 'criado';
  }
}
