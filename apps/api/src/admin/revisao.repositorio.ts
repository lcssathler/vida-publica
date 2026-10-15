import type { Executor } from '../db/db';

/** Quem revisou, como fica em feed.evento.revisado_por e nas outras tabelas. */
export interface Revisor {
  id: string;
  nome: string;
}

export const revisadoPor = (r: Revisor) => `admin:${r.id}`;

export type StatusEvento = 'segurado' | 'publicado' | 'arquivado';

export interface FiltroEventos {
  status: StatusEvento;
  motivo?: string;
  tipo?: string;
  /** Texto no título (sem acento). */
  q?: string;
  pagina: number;
  porPagina: number;
}

export interface EventoRevisao {
  id: string;
  tipo: string;
  regraVersao: number;
  titulo: string;
  resumo: string | null;
  valor: number | null;
  ocorridoEm: Date;
  coletadoEm: Date;
  status: StatusEvento;
  motivo: string | null;
  visibilidade: 'geral' | 'seguidores';
  fonteUrl: string | null;
  fonteDadoEm: Date | null;
  publicadoEm: Date | null;
  revisadoEm: Date | null;
  /** Nome de quem revisou no painel, ou o processo (vp-ingest). */
  revisadoPor: string | null;
  /** Versão que o revisor viu: publicar ou arquivar só vale para ela. */
  contentHash: string;
  reportesAbertos: number;
}

export interface DetalheEvento extends EventoRevisao {
  payload: Record<string, unknown>;
  regraDescricao: string;
  regraParametros: Record<string, unknown>;
  alvos: Array<{ tipo: string; id: string; papel: string; nome: string }>;
  erratas: Errata[];
  acoes: Acao[];
}

export interface ItemRevisao {
  id: string;
  contentHash: string;
}

export type RecusaRevisao =
  'nao_encontrado' | 'mudou' | 'nao_segurado' | 'sem_fonte' | 'ja_arquivado';

export interface ResultadoRevisao {
  revisados: string[];
  recusados: Array<{ id: string; motivo: RecusaRevisao }>;
}

export interface Casamento {
  fonte: string;
  idFonte: string;
  motivo: string;
  status: 'pendente' | 'resolvido' | 'descartado';
  criadoEm: Date;
  /** O registro da fonte: nome, nascimento, UF, partido, página oficial. */
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
  resolvidoEm: Date | null;
  resolvidoPor: string | null;
  nota: string | null;
}

export interface PessoaCandidata {
  id: string;
  nome: string;
  nomeCivil: string | null;
  nascimento: string | null;
  /** Fontes já ligadas: tse, camara, senado. */
  fontes: string[];
  /** Candidaturas mais recentes: "2022 · SENADOR · BA · PT". */
  candidaturas: string[];
}

export interface Reporte {
  id: string;
  eventoId: string;
  eventoTitulo: string;
  eventoStatus: StatusEvento;
  motivo: string;
  texto: string | null;
  criadoEm: Date;
  status: 'aberto' | 'corrigido' | 'descartado';
  resolvidoEm: Date | null;
  resolvidoPor: string | null;
  errataId: string | null;
}

export interface Errata {
  id: string;
  titulo: string;
  texto: string;
  eventoId: string | null;
  eventoTitulo: string | null;
  pessoaId: string | null;
  pessoaNome: string | null;
  publicadaEm: Date;
  publicadaPor: string;
}

export interface NovaErrata {
  titulo: string;
  texto: string;
  eventoId: string | null;
  pessoaId: string | null;
  reporteIds: string[];
  /** Arquivar o evento junto (o fato estava errado e sai do app). */
  arquivarEvento: boolean;
}

export interface Acao {
  id: number;
  admin: string;
  acao: string;
  alvoTipo: string;
  alvoId: string;
  detalhe: Record<string, unknown>;
  criadaEm: Date;
}

export interface ResumoRevisao {
  segurados: Array<{
    motivo: string;
    tipo: string;
    eventos: number;
    valor: number | null;
  }>;
  casamentosPendentes: number;
  reportesAbertos: number;
  erratas: number;
}

/** Situação de um job diante do prazo máximo sem coleta bem-sucedida. */
export interface SaudeFonte {
  job: string;
  descricao: string;
  prazoHoras: number;
  ativo: boolean;
  ultimoSucesso: Date | null;
  ultimaFalha: Date | null;
  erro: string | null;
  atrasado: boolean;
  alertaDesde: Date | null;
}

export interface AlertaFonte {
  chave: string;
  abertoEm: Date;
  resolvidoEm: Date | null;
}

export interface Pagina<T> {
  itens: T[];
  total: number;
}

/**
 * Porta da revisão humana: eventos segurados, fila de casamentos, reportes de
 * erro e erratas. Toda mudança grava, na mesma transação, quem fez e quando
 * (admin.acao).
 */
export abstract class RevisaoRepositorio {
  abstract resumo(): Promise<ResumoRevisao>;

  abstract eventos(filtro: FiltroEventos): Promise<Pagina<EventoRevisao>>;
  abstract evento(id: string): Promise<DetalheEvento | null>;
  abstract revisarEventos(
    acao: 'publicar' | 'arquivar',
    itens: ItemRevisao[],
    revisor: Revisor,
    nota: string | null,
  ): Promise<ResultadoRevisao>;

  abstract casamentos(status: Casamento['status']): Promise<Casamento[]>;
  abstract casamento(fonte: string, idFonte: string): Promise<Casamento | null>;
  abstract buscarPessoas(q: string): Promise<PessoaCandidata[]>;
  /**
   * Resolve um casamento pendente: liga o registro a uma pessoa existente,
   * a uma pessoa nova (pessoaId null) ou descarta. Falso se não estava pendente.
   */
  abstract resolverCasamento(
    fonte: string,
    idFonte: string,
    decisao:
      | { tipo: 'vincular'; pessoaId: string }
      | { tipo: 'nova' }
      | { tipo: 'descartar' },
    revisor: Revisor,
    nota: string | null,
  ): Promise<{ ok: boolean; pessoaId: string | null }>;

  abstract reportes(status: Reporte['status']): Promise<Reporte[]>;
  abstract descartarReporte(
    id: string,
    revisor: Revisor,
    nota: string | null,
  ): Promise<boolean>;

  abstract erratas(pagina: number, porPagina: number): Promise<Pagina<Errata>>;
  abstract publicarErrata(dados: NovaErrata, revisor: Revisor): Promise<string>;

  abstract acoes(pagina: number, porPagina: number): Promise<Pagina<Acao>>;

  /** Prazo e última coleta de cada job (raw.fonte_prazo, raw.job_run, raw.alerta). */
  abstract fontes(): Promise<{ fontes: SaudeFonte[]; alertas: AlertaFonte[] }>;
}

/** Grava uma ação do painel (dentro da transação de quem muda). */
export async function registrarAcao(
  tx: Executor,
  revisor: Revisor,
  acao: string,
  alvoTipo: string,
  alvoId: string,
  detalhe: Record<string, unknown> = {},
): Promise<void> {
  await tx.query(
    `INSERT INTO admin.acao (usuario_id, acao, alvo_tipo, alvo_id, detalhe)
     VALUES ($1, $2, $3, $4, $5)`,
    [revisor.id, acao, alvoTipo, alvoId, detalhe],
  );
}
