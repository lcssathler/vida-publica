/**
 * Tokens do design "Cívico", versão escura v2: publicações de largura total
 * separadas por faixas, Inter na interface e Instrument Serif nos destaques e
 * nos valores de votação. O escuro é preto neutro com carvão e cobre discreto;
 * o claro é preto e branco, sem cor de marca. O acento só marca interface
 * (abas, etiquetas, links), e nenhuma cor identifica partido ou campo político.
 *
 * Cores de dado: voto, orientação de bancada e resultado de votação. Sim e
 * aprovado em verde suave, Não e rejeitado em vermelho suave, sempre com o
 * ícone (✓ ou ✕) e a palavra, nunca só a cor. Valores em dinheiro ficam neutros.
 */

export type ColorScheme = 'light' | 'dark';

export interface Palette {
  /** Fundo da tela e das faixas de data. */
  background: string;
  /** Publicações, cartões, campos e listas agrupadas. */
  surface: string;
  /** Faixa que separa publicações vizinhas. */
  postGap: string;
  /** Caixa de voto e resultado dentro da publicação. */
  voteBox: string;
  /** Painel inferior (detalhes). */
  sheet: string;
  ink: string;
  ink2: string;
  ink3: string;
  /** Contornos de controle e fios entre grupos. */
  rule: string;
  /** Divisórias dentro de uma publicação ou cartão. */
  line: string;
  accent: string;
  accentWash: string;
  /** Fundo do que é novo desde a última visita. */
  highlight: string;
  /** Sim e aprovado. */
  yes: string;
  /** Não e rejeitado. */
  no: string;
  caution: string;
  cautionBackground: string;
  error: string;
  /** Texto apagado em títulos grandes (24 pt ou mais: 3:1). */
  inactive: string;
  /** Fundo da foto quando ela não carrega. */
  photo: string;
  /** Barra de navegação flutuante. */
  bar: string;
  barBorder: string;
  barIcon: string;
  barActive: string;
  barActiveIcon: string;
  /** Sombras no formato CSS (boxShadow do React Native e da web). */
  shadowCard: string;
  shadowBar: string;
}

export const palettes: Record<ColorScheme, Palette> = {
  light: {
    background: '#FFFFFF',
    surface: '#FFFFFF',
    postGap: '#EFEFEF',
    voteBox: '#F5F5F5',
    sheet: '#FFFFFF',
    ink: '#000000',
    ink2: '#4D4D4D',
    ink3: '#666666',
    rule: '#DEDEDE',
    line: '#EBEBEB',
    accent: '#000000',
    accentWash: '#EFEFEF',
    highlight: '#F5F5F5',
    yes: '#1B7A3A',
    no: '#C1272D',
    caution: '#6E4700',
    cautionBackground: '#F7EBD3',
    error: '#C1272D',
    inactive: '#8A8A8A',
    photo: '#E6E6E6',
    bar: '#111111',
    barBorder: '#111111',
    barIcon: '#9E9E9E',
    barActive: '#FFFFFF',
    barActiveIcon: '#111111',
    shadowCard: '0px 1px 2px rgba(0, 0, 0, 0.06), 0px 4px 16px rgba(0, 0, 0, 0.04)',
    shadowBar: '0px 10px 28px rgba(0, 0, 0, 0.28)',
  },
  dark: {
    background: '#111112',
    surface: '#19191B',
    postGap: '#0C0C0E',
    voteBox: '#232225',
    sheet: '#1D1B1E',
    ink: '#F2EEE9',
    ink2: '#AAA6AE',
    ink3: '#99959E',
    rule: '#2D2D30',
    line: '#262628',
    accent: '#D7AB8E',
    accentWash: '#2C2329',
    highlight: '#2C2329',
    yes: '#A5DDB7',
    no: '#EFA9A9',
    caution: '#F0C674',
    cautionBackground: '#3A2E14',
    error: '#F0A397',
    inactive: '#6E6E77',
    photo: '#2A2A2D',
    bar: '#222124',
    barBorder: '#3A393C',
    barIcon: '#969097',
    barActive: '#F2EEE9',
    barActiveIcon: '#2C2428',
    shadowCard: '0px 0px 0px 1px rgba(255, 255, 255, 0.03)',
    shadowBar: '0px 8px 30px rgba(0, 0, 0, 0.45)',
  },
};

/** Famílias carregadas em src/theme/fonts.ts. */
export const fontFamily = {
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemibold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
  serif: 'InstrumentSerif_400Regular',
} as const;

interface TextToken {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: 'uppercase';
  fontVariant?: 'tabular-nums'[];
}

const numeros: 'tabular-nums'[] = ['tabular-nums'];

/** Escala tipográfica em pontos (iOS) / sp (Android). */
export const typography = {
  /** Título de tela e de painel, em Instrument Serif. */
  display: { fontFamily: fontFamily.serif, fontSize: 36, lineHeight: 38, letterSpacing: -0.5 },
  headline: { fontFamily: fontFamily.serif, fontSize: 30, lineHeight: 34, letterSpacing: -0.25 },
  /** Nome do dia na lista ("14 outubro."). */
  dia: { fontFamily: fontFamily.serif, fontSize: 24, lineHeight: 26, letterSpacing: -0.25 },
  title: { fontFamily: fontFamily.sansMedium, fontSize: 16, lineHeight: 24, letterSpacing: -0.25 },
  body: { fontFamily: fontFamily.sans, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fontFamily.sansSemibold, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fontFamily.sansSemibold, fontSize: 14, lineHeight: 18 },
  caption: { fontFamily: fontFamily.sans, fontSize: 12, lineHeight: 16 },
  overline: { fontFamily: fontFamily.sansSemibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
  /** Tipo do registro: caixa alta no acento, acima da pessoa. */
  tipo: {
    fontFamily: fontFamily.sansSemibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  /** Voto, resultado e valores em destaque, em Instrument Serif. */
  dataLarge: { fontFamily: fontFamily.serif, fontSize: 33, lineHeight: 36, letterSpacing: -0.5 },
  data: { fontFamily: fontFamily.sans, fontSize: 13, lineHeight: 18, fontVariant: numeros },
  dataSmall: { fontFamily: fontFamily.sans, fontSize: 12, lineHeight: 16, fontVariant: numeros },
} satisfies Record<string, TextToken>;

/** Espaçamento em base 4. */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  margin: 44,
  huge: 64,
} as const;

/** Raios: foto, caixa de voto, controles, cartões, painel e cápsulas. A foto 3×4 nunca é círculo. */
export const radius = { foto: 3, voto: 6, sm: 8, md: 10, lg: 14, card: 18, painel: 22, pill: 999 } as const;

/** Alvo de toque mínimo (48 dp do Material; acima dos 44 pt da Apple). */
export const toque = { minimo: 48 } as const;

/** Fios finos entre itens e a faixa entre publicações. */
export const rules = { hairline: 1, faixa: 8 } as const;

/** Recuo interno das publicações e do cabeçalho. */
export const recuo = 20;

/** Barra de navegação flutuante: distância da borda de baixo e espaço que o conteúdo reserva. */
export const barra = { margemInferior: 16, altura: 58, reserva: 104 } as const;

/** Movimento: uma curva e três durações (personalidade "Corporate" da skill de movimento). */
export const movimento = {
  curva: [0.2, 0, 0, 1] as const,
  entrada: [0.05, 0.7, 0.1, 1] as const,
  rapido: 150,
  padrao: 250,
  lento: 360,
  /** Atraso entre itens de uma lista que entram em sequência. */
  escalonamento: 40,
} as const;
