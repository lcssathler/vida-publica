/** Respostas da API do admin (src/admin na API), com datas em ISO. */

export type StatusEvento = 'segurado' | 'publicado' | 'arquivado';

export interface EventoRevisao {
  id: string;
  tipo: string;
  regraVersao: number;
  titulo: string;
  resumo: string | null;
  valor: number | null;
  ocorridoEm: string;
  coletadoEm: string;
  status: StatusEvento;
  motivo: string | null;
  visibilidade: 'geral' | 'seguidores';
  fonteUrl: string | null;
  fonteDadoEm: string | null;
  publicadoEm: string | null;
  revisadoEm: string | null;
  revisadoPor: string | null;
  contentHash: string;
  reportesAbertos: number;
}

export interface Errata {
  id: string;
  titulo: string;
  texto: string;
  eventoId: string | null;
  eventoTitulo: string | null;
  pessoaId: string | null;
  pessoaNome: string | null;
  publicadaEm: string;
  publicadaPor: string;
}

export interface Acao {
  id: number;
  admin: string;
  acao: string;
  alvoTipo: string;
  alvoId: string;
  detalhe: Record<string, unknown>;
  criadaEm: string;
}

export interface DetalheEvento extends EventoRevisao {
  payload: Record<string, unknown>;
  regraDescricao: string;
  regraParametros: Record<string, unknown>;
  alvos: Array<{ tipo: string; id: string; papel: string; nome: string }>;
  erratas: Errata[];
  acoes: Acao[];
}

export interface Pagina<T> {
  itens: T[];
  total: number;
}

export interface PessoaCandidata {
  id: string;
  nome: string;
  nomeCivil: string | null;
  nascimento: string | null;
  fontes: string[];
  candidaturas: string[];
}

export interface Casamento {
  fonte: string;
  idFonte: string;
  motivo: string;
  status: 'pendente' | 'resolvido' | 'descartado';
  criadoEm: string;
  registro: {
    nome: string | null;
    nomeCompleto: string | null;
    nascimento: string | null;
    uf: string | null;
    partido: string | null;
    url: string | null;
    emExercicio: boolean | null;
  };
  candidatos: PessoaCandidata[];
  pessoaId: string | null;
  pessoaNome: string | null;
  resolvidoEm: string | null;
  resolvidoPor: string | null;
  nota: string | null;
}

export interface Reporte {
  id: string;
  eventoId: string;
  eventoTitulo: string;
  eventoStatus: StatusEvento;
  motivo: string;
  texto: string | null;
  criadoEm: string;
  status: 'aberto' | 'corrigido' | 'descartado';
  resolvidoEm: string | null;
  resolvidoPor: string | null;
  errataId: string | null;
}

export interface Resumo {
  segurados: Array<{ motivo: string; tipo: string; eventos: number; valor: number | null }>;
  casamentosPendentes: number;
  reportesAbertos: number;
  erratas: number;
}

export interface ResultadoRevisao {
  revisados: string[];
  recusados: Array<{ id: string; motivo: string }>;
}
