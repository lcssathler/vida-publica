import {
  DoadoresCandidatura,
  GastoAnual,
  PartidoDados,
  PerfisRepositorio,
  PessoaDados,
} from '../../src/perfis/perfis.repositorio';

/** Perfis em memória: o teste cadastra o que o canon teria. */
export class MemoriaPerfis extends PerfisRepositorio {
  readonly pessoas = new Map<string, PessoaDados>();
  readonly partidos = new Map<string, PartidoDados>();
  readonly gastosPorPessoa = new Map<string, GastoAnual[]>();
  readonly doadoresPorPessoa = new Map<
    string,
    Map<number, DoadoresCandidatura[]>
  >();

  pessoa(id: string): Promise<PessoaDados | null> {
    return Promise.resolve(this.pessoas.get(id) ?? null);
  }

  gastos(pessoaId: string, anos: number): Promise<GastoAnual[]> {
    return Promise.resolve(
      (this.gastosPorPessoa.get(pessoaId) ?? []).slice(0, anos),
    );
  }

  anosDeCandidatura(pessoaId: string): Promise<number[]> {
    const anos = [...(this.doadoresPorPessoa.get(pessoaId)?.keys() ?? [])];
    return Promise.resolve(anos.sort((a, b) => b - a));
  }

  doadores(pessoaId: string, ano: number): Promise<DoadoresCandidatura[]> {
    return Promise.resolve(
      this.doadoresPorPessoa.get(pessoaId)?.get(ano) ?? [],
    );
  }

  partido(id: string): Promise<PartidoDados | null> {
    return Promise.resolve(this.partidos.get(id) ?? null);
  }
}
