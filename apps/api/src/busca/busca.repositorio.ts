export type TipoResultado = 'pessoa' | 'partido' | 'proposicao' | 'assunto';

export interface ResultadoPessoa {
  id: string;
  nome: string;
  /** Mandato em exercício ou última candidatura. */
  detalhe: string | null;
  seguindo: boolean;
}

export interface ResultadoPartido {
  id: string;
  sigla: string;
  nome: string | null;
  /** Partido extinto ou renomeado aponta para o sucessor. */
  sucessor: { id: string; sigla: string } | null;
  seguindo: boolean;
}

export interface ResultadoProposta {
  id: string;
  identificacao: string;
  ementa: string | null;
  situacao: string | null;
  seguindo: boolean;
}

export interface ResultadoAssunto {
  nome: string;
  proposicoes: number;
  seguindo: boolean;
}

export interface ConsultaBusca {
  usuarioId: string;
  texto: string;
  limite: number;
}

/** Porta da busca textual (sem acento, em português) no canon. */
export abstract class BuscaRepositorio {
  abstract pessoas(c: ConsultaBusca): Promise<ResultadoPessoa[]>;
  abstract partidos(c: ConsultaBusca): Promise<ResultadoPartido[]>;
  abstract propostas(c: ConsultaBusca): Promise<ResultadoProposta[]>;
  abstract assuntos(c: ConsultaBusca): Promise<ResultadoAssunto[]>;
}
