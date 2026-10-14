import { Inject, Injectable } from '@nestjs/common';
import {
  BuscaRepositorio,
  ResultadoAssunto,
  ResultadoPartido,
  ResultadoPessoa,
  ResultadoProposta,
  TipoResultado,
} from './busca.repositorio';

export interface ResultadoBusca {
  q: string;
  pessoas: ResultadoPessoa[];
  partidos: ResultadoPartido[];
  propostas: ResultadoProposta[];
  assuntos: ResultadoAssunto[];
}

@Injectable()
export class BuscaService {
  constructor(
    @Inject(BuscaRepositorio) private readonly busca: BuscaRepositorio,
  ) {}

  /** Busca em todos os grupos, ou só no grupo pedido. */
  async buscar(
    usuarioId: string,
    texto: string,
    tipo: TipoResultado | null,
    limite: number,
  ): Promise<ResultadoBusca> {
    const c = { usuarioId, texto, limite };
    const quer = (t: TipoResultado) => tipo === null || tipo === t;
    const [pessoas, partidos, propostas, assuntos] = await Promise.all([
      quer('pessoa') ? this.busca.pessoas(c) : [],
      quer('partido') ? this.busca.partidos(c) : [],
      quer('proposicao') ? this.busca.propostas(c) : [],
      quer('assunto') ? this.busca.assuntos(c) : [],
    ]);
    return { q: texto, pessoas, partidos, propostas, assuntos };
  }
}
