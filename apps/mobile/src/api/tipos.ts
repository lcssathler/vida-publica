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
