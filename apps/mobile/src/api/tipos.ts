/**
 * Formato das respostas da API (apps/api), como chegam pelo JSON: datas em
 * texto ISO. Mantido à mão, junto do README da API.
 */

export type Plataforma = 'ios' | 'android' | 'web';

export interface TokenEmitido {
  token: string;
  expiraEm: string;
}

export interface ParDeTokens {
  usuarioId: string;
  acesso: TokenEmitido;
  refresh: TokenEmitido;
}

export type AlvoTipo = 'pessoa' | 'partido' | 'proposicao' | 'assunto';

export interface Alvo {
  tipo: AlvoTipo;
  id: string;
}

export interface AlvoSeguido extends Alvo {
  nome: string;
  detalhe: string | null;
  desde: string;
}

export interface Assunto {
  nome: string;
  proposicoes: number;
}

export interface Foto {
  url: string;
  credito: string;
}

export interface Parlamentar {
  id: string;
  nome: string;
  casa: 'camara' | 'senado';
  cargo: string;
  uf: string;
  partido: string | null;
  foto: Foto | null;
  seguindo: boolean;
}

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;
export type Uf = (typeof UFS)[number];

export interface Preferencias {
  uf: Uf | null;
  notificacoes: boolean;
  resumoSemanal: boolean;
  maxPorDia: number;
  silencioInicio: string;
  silencioFim: string;
  fuso: string;
}

/** Os 15 tipos de evento da regra v1. */
export const TIPOS_EVENTO = [
  'voto_nominal',
  'voto_contra_orientacao',
  'pauta',
  'tramitacao',
  'mudanca_regime',
  'proposta_parada',
  'presenca',
  'ausencia',
  'despesa_mensal',
  'fundo_recebido',
  'repasse',
  'doacao',
  'troca_partido',
  'situacao_candidatura',
  'resultado',
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export interface AlvoDoEvento extends Alvo {
  papel: string;
  nome: string;
  seguindo: boolean;
}

/** Evento publicado, sempre com a fonte. */
export interface EventoFeed {
  id: string;
  tipo: TipoEvento;
  ocorridoEm: string;
  titulo: string;
  resumo: string | null;
  valor: number | null;
  payload: Record<string, unknown>;
  visibilidade: 'geral' | 'seguidores';
  publicadoEm: string;
  fonte: { url: string; dadoEm: string | null; coletadoEm: string };
  regra: { versao: number; descricao?: string };
  alvos: AlvoDoEvento[];
}

export interface RespostaFeed {
  itens: EventoFeed[];
  proximoCursor: string | null;
}

export type CategoriaPerfil = 'votos' | 'presenca' | 'gastos' | 'propostas' | 'campanha' | 'eleicoes';

export interface ContagemCategoria {
  categoria: CategoriaPerfil;
  eventos: number;
  porTipo: Partial<Record<TipoEvento, number>>;
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

export interface GastoAnual {
  ano: number;
  casa: 'camara' | 'senado';
  total: number;
  documentos: number;
  categorias: { categoria: string; total: number }[];
}

export interface PerfilPessoa {
  id: string;
  nome: string;
  nomeCivil: string | null;
  foto: Foto | null;
  mandatos: Mandato[];
  filiacoes: Filiacao[];
  candidaturas: Candidatura[];
  partidoAtual: { id: string | null; sigla: string } | null;
  seguindo: boolean;
  categorias: ContagemCategoria[];
  gastos: GastoAnual[];
  anosDeCampanha: number[];
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
  porOrigem: (Valor & { origem: string })[];
  comCnpj: (Valor & { nome: string; cnpj: string })[];
  pessoasFisicas: {
    /** Só quem doou mais que o limite (R$ 10 mil) somado na candidatura. */
    nomeadas: { nome: string; total: number; doacoes: number }[];
    outras: { doadores: number; total: number };
  };
}

export interface DoadoresPessoa {
  ano: number;
  limiteNomePessoaFisica: number;
  fonte: { url: string };
  candidaturas: DoadoresCandidatura[];
}

export interface PartidoResumo {
  id: string;
  sigla: string;
  tipo: string;
  ano: number | null;
}

export interface PerfilPartido {
  id: string;
  sigla: string;
  nome: string | null;
  numero: number;
  primeiroAno: number | null;
  ultimoAno: number | null;
  sucessor: PartidoResumo | null;
  antecessores: PartidoResumo[];
  emExercicio: { id: string; nome: string; casa: 'camara' | 'senado'; cargo: string; uf: string | null }[];
  repasses: { ano: number; fonte: string; esfera: string | null; total: number; repasses: number; candidatos: number }[];
  seguindo: boolean;
  categorias: ContagemCategoria[];
}

export interface AutorProposta {
  nome: string;
  tipo: string | null;
  proponente: boolean | null;
  pessoa: { id: string; nome: string } | null;
}

export interface ItemTramitacao {
  tipo: 'tramitacao';
  data: string;
  orgao: string | null;
  descricao: string;
  situacao: string | null;
  despacho: string | null;
  url: string | null;
  /** Evento publicado que destaca esta etapa (relator, parecer...). */
  eventoId: string | null;
}

export interface ItemVotacao {
  tipo: 'votacao';
  data: string;
  orgao: string | null;
  descricao: string | null;
  aprovada: boolean | null;
  nominal: boolean;
  placar: { sim: number; nao: number; abstencao: number; outros: number } | null;
  fonte: { url: string };
}

export interface ItemEvento {
  tipo: 'evento';
  data: string;
  evento: EventoFeed;
}

export type ItemLinhaDoTempo = ItemTramitacao | ItemVotacao | ItemEvento;

export interface Proposta {
  id: string;
  casa: 'camara' | 'senado';
  identificacao: string;
  siglaTipo: string;
  numero: number | null;
  ano: number | null;
  descricaoTipo: string | null;
  ementa: string | null;
  ementaDetalhada: string | null;
  apelido: string | null;
  apresentadaEm: string | null;
  situacao: string | null;
  situacaoEm: string | null;
  orgao: string | null;
  regime: string | null;
  tramitando: boolean | null;
  urlInteiroTeor: string | null;
  autores: AutorProposta[];
  temas: string[];
  principal: { id: string; identificacao: string } | null;
  fonte: { url: string };
  seguindo: boolean;
  /** Do mais recente ao mais antigo. */
  linhaDoTempo: ItemLinhaDoTempo[];
}
