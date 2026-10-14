import {
  BuscaRepositorio,
  ConsultaBusca,
  ResultadoAssunto,
  ResultadoPartido,
  ResultadoPessoa,
  ResultadoProposta,
} from '../../src/busca/busca.repositorio';
import { normalizar } from '../../src/busca/termos';

/** Busca em memória: contém o texto, sem acento. */
export class MemoriaBusca extends BuscaRepositorio {
  readonly pessoasCadastradas: ResultadoPessoa[] = [];
  readonly partidosCadastrados: ResultadoPartido[] = [];
  readonly propostasCadastradas: ResultadoProposta[] = [];
  readonly assuntosCadastrados: ResultadoAssunto[] = [];
  readonly consultas: ConsultaBusca[] = [];

  private filtrar<T>(
    lista: T[],
    c: ConsultaBusca,
    texto: (t: T) => string,
  ): Promise<T[]> {
    this.consultas.push(c);
    const q = normalizar(c.texto);
    return Promise.resolve(
      lista
        .filter((item) => normalizar(texto(item)).includes(q))
        .slice(0, c.limite),
    );
  }

  pessoas(c: ConsultaBusca) {
    return this.filtrar(this.pessoasCadastradas, c, (p) => p.nome);
  }

  partidos(c: ConsultaBusca) {
    return this.filtrar(
      this.partidosCadastrados,
      c,
      (p) => `${p.sigla} ${p.nome ?? ''}`,
    );
  }

  propostas(c: ConsultaBusca) {
    return this.filtrar(
      this.propostasCadastradas,
      c,
      (p) => `${p.identificacao} ${p.ementa ?? ''}`,
    );
  }

  assuntos(c: ConsultaBusca) {
    return this.filtrar(this.assuntosCadastrados, c, (a) => a.nome);
  }
}
