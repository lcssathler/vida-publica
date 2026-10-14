export interface Foto {
  url: string;
  /** Fotos oficiais, sempre com crédito. */
  credito: string;
}

export interface Mandato {
  casa: 'camara' | 'senado';
  cargo: string;
  uf: string | null;
  legislatura: number;
  condicao: string;
  inicio: string | null;
  fim: string | null;
  emExercicio: boolean;
}

export interface Filiacao {
  sigla: string;
  partidoId: string | null;
  desde: string;
  ate: string | null;
}

export interface Candidatura {
  ano: number;
  turno: number;
  sqCandidato: string;
  cargo: string | null;
  uf: string | null;
  nomeUrna: string | null;
  numero: number | null;
  partido: { id: string | null; sigla: string | null };
  situacao: string | null;
  resultado: string | null;
}

export interface PessoaDados {
  id: string;
  nome: string;
  nomeCivil: string | null;
  foto: Foto | null;
  mandatos: Mandato[];
  filiacoes: Filiacao[];
  candidaturas: Candidatura[];
}

export interface GastoAnual {
  ano: number;
  casa: 'camara' | 'senado';
  total: number;
  documentos: number;
  /** Maiores categorias de despesa da cota no ano. */
  categorias: Array<{ categoria: string; total: number }>;
}

export interface Valor {
  total: number;
  receitas: number;
}

export interface DoadoresCandidatura {
  ano: number;
  sqCandidato: string;
  cargo: string | null;
  uf: string | null;
  partido: string | null;
  total: number;
  receitas: number;
  porOrigem: Array<Valor & { origem: string }>;
  /** Partidos, outros candidatos, plataformas: doadores com CNPJ. */
  comCnpj: Array<Valor & { nome: string; cnpj: string }>;
  pessoasFisicas: {
    /** Só quem doou mais de R$ 10 mil somados na candidatura. */
    nomeadas: Array<{ nome: string; total: number; doacoes: number }>;
    outras: { doadores: number; total: number };
  };
}

export interface PartidoDados {
  id: string;
  sigla: string;
  nome: string | null;
  numero: number;
  primeiroAno: number | null;
  ultimoAno: number | null;
  sucessor: {
    id: string;
    sigla: string;
    tipo: string;
    ano: number | null;
  } | null;
  antecessores: Array<{
    id: string;
    sigla: string;
    tipo: string;
    ano: number | null;
  }>;
  /** Parlamentares em exercício filiados hoje ao partido. */
  emExercicio: Array<{
    id: string;
    nome: string;
    casa: 'camara' | 'senado';
    cargo: string;
    uf: string | null;
  }>;
  /** Repasses do partido a candidatos (vigentes), por ano, fonte e esfera. */
  repasses: Array<{
    ano: number;
    fonte: string;
    esfera: string | null;
    total: number;
    repasses: number;
    candidatos: number;
  }>;
}

/** Porta de leitura dos perfis no canon. Nunca lê o esquema ident. */
export abstract class PerfisRepositorio {
  abstract pessoa(id: string): Promise<PessoaDados | null>;

  abstract gastos(pessoaId: string, anos: number): Promise<GastoAnual[]>;

  /** Anos em que a pessoa tem candidatura, do mais recente. */
  abstract anosDeCandidatura(pessoaId: string): Promise<number[]>;

  abstract doadores(
    pessoaId: string,
    ano: number,
  ): Promise<DoadoresCandidatura[]>;

  abstract partido(id: string): Promise<PartidoDados | null>;
}
