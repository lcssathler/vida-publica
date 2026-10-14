import { Provedor } from '../auth/usuarios.repositorio';

export const UFS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;

export const FUSOS = [
  'America/Noronha',
  'America/Sao_Paulo',
  'America/Bahia',
  'America/Fortaleza',
  'America/Recife',
  'America/Maceio',
  'America/Belem',
  'America/Araguaina',
  'America/Manaus',
  'America/Cuiaba',
  'America/Campo_Grande',
  'America/Porto_Velho',
  'America/Boa_Vista',
  'America/Rio_Branco',
  'America/Eirunepe',
  'America/Santarem',
] as const;

export interface Preferencias {
  /** Estado escolhido no onboarding (o CEP é convertido no aparelho). */
  uf: (typeof UFS)[number] | null;
  notificacoes: boolean;
  resumoSemanal: boolean;
  /** Teto de notificações por dia. */
  maxPorDia: number;
  /** Horário de silêncio, "HH:MM" no fuso do usuário; início = fim desliga. */
  silencioInicio: string;
  silencioFim: string;
  fuso: (typeof FUSOS)[number];
}

/** Padrões enquanto o usuário não muda nada (iguais aos da tabela). */
export const PREFERENCIAS_PADRAO: Preferencias = {
  uf: null,
  notificacoes: true,
  resumoSemanal: true,
  maxPorDia: 5,
  silencioInicio: '22:00',
  silencioFim: '07:00',
  fuso: 'America/Sao_Paulo',
};

export interface ResumoConta {
  usuarioId: string;
  criadaEm: Date;
  /** Logins vinculados; vazio = conta anônima do aparelho. */
  identidades: Provedor[];
  seguindo: number;
  sessoesAtivas: number;
}

/** Porta: dados da conta no esquema app. */
export abstract class ContaRepositorio {
  abstract resumo(usuarioId: string): Promise<ResumoConta | null>;

  abstract preferencias(usuarioId: string): Promise<Preferencias>;

  abstract salvarPreferencias(
    usuarioId: string,
    mudancas: Partial<Preferencias>,
  ): Promise<Preferencias>;

  /** Apaga o usuário e, em cascata, tudo o que é dele. */
  abstract excluir(usuarioId: string): Promise<boolean>;
}
