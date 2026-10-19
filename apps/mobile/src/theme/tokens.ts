/**
 * Tokens do design "Cívico" (direção B, paleta Bronze): cartões claros
 * flutuando sobre areia no modo claro e sobre grafite no escuro, com um único
 * acento bronze. O acento só marca interface (abas, etiquetas, links), e
 * nenhuma cor identifica partido ou campo político.
 *
 * Única cor de dado: o voto. Sim em verde suave e Não em vermelho suave,
 * sempre com o ícone (✓ ou ✕) e a palavra, nunca só a cor. Resultado de
 * votação, orientação de bancada e valores ficam em tom neutro.
 */

export type ColorScheme = 'light' | 'dark';

export interface Palette {
  /** Fundo da tela. */
  background: string;
  /** Cartões, campos e listas agrupadas. */
  surface: string;
  ink: string;
  ink2: string;
  ink3: string;
  /** Contornos de controle e fios entre grupos. */
  rule: string;
  /** Divisórias dentro de um cartão. */
  line: string;
  accent: string;
  accentWash: string;
  /** Fundo do que é novo desde a última visita. */
  highlight: string;
  caution: string;
  cautionBackground: string;
  error: string;
  /** Opção não escolhida em títulos grandes (texto de 24 pt ou mais: 3:1). */
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
    background: '#EFE9DD',
    surface: '#FFFDF8',
    ink: '#1F1A14',
    ink2: '#5C5347',
    ink3: '#6B6155',
    rule: '#DED5C4',
    line: '#EFE8DC',
    accent: '#85592E',
    accentWash: '#EEDFCC',
    highlight: '#EEDFCC',
    caution: '#6E4700',
    cautionBackground: '#F7EBD3',
    error: '#A3352A',
    inactive: '#857A6B',
    photo: '#E3DACA',
    bar: '#1F1A14',
    barBorder: '#1F1A14',
    barIcon: '#A89E90',
    barActive: '#FFFDF8',
    barActiveIcon: '#1F1A14',
    shadowCard: '0px 1px 2px rgba(31, 26, 20, 0.06), 0px 4px 16px rgba(31, 26, 20, 0.04)',
    shadowBar: '0px 10px 28px rgba(31, 26, 20, 0.28)',
  },
  dark: {
    background: '#09090B',
    surface: '#131316',
    ink: '#FAFAFA',
    ink2: '#A1A1AA',
    ink3: '#8A8A93',
    rule: '#27272A',
    line: '#1E1E22',
    accent: '#D9A877',
    accentWash: '#33261A',
    highlight: '#33261A',
    caution: '#F0C674',
    cautionBackground: '#3A2E14',
    error: '#F0A397',
    inactive: '#6E6E77',
    photo: '#27272A',
    bar: '#1C1C20',
    barBorder: '#2E2E33',
    barIcon: '#A1A1AA',
    barActive: '#FAFAFA',
    barActiveIcon: '#09090B',
    shadowCard: '0px 1px 2px rgba(0, 0, 0, 0.25)',
    shadowBar: '0px 10px 28px rgba(0, 0, 0, 0.5)',
  },
};

/** Famílias carregadas em src/theme/fonts.ts. */
export const fontFamily = {
  sans: 'Geist_400Regular',
  sansMedium: 'Geist_500Medium',
  sansSemibold: 'Geist_600SemiBold',
  sansBold: 'Geist_700Bold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
  monoSemibold: 'GeistMono_600SemiBold',
} as const;

interface TextToken {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
}

/** Escala tipográfica em pontos (iOS) / sp (Android). */
export const typography = {
  display: { fontFamily: fontFamily.sansBold, fontSize: 30, lineHeight: 34, letterSpacing: -0.8 },
  headline: { fontFamily: fontFamily.sansBold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  title: { fontFamily: fontFamily.sansSemibold, fontSize: 17, lineHeight: 23, letterSpacing: -0.2 },
  body: { fontFamily: fontFamily.sans, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fontFamily.sansSemibold, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fontFamily.sansSemibold, fontSize: 14, lineHeight: 18 },
  caption: { fontFamily: fontFamily.sans, fontSize: 12, lineHeight: 16 },
  /** Rótulo pequeno acima de um bloco ou de um título (tipo do registro, seção). */
  overline: { fontFamily: fontFamily.sansSemibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
  dataLarge: { fontFamily: fontFamily.monoSemibold, fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  data: { fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 },
  dataSmall: { fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 16 },
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

/** Raios: controles pequenos, campos e botões, cartões e cápsulas. A foto 3×4 nunca é círculo. */
export const radius = { sm: 8, md: 12, lg: 16, card: 18, pill: 999 } as const;

/** Alvo de toque mínimo (48 dp do Material; acima dos 44 pt da Apple). */
export const toque = { minimo: 48 } as const;

/** Fios finos entre itens. */
export const rules = { hairline: 1 } as const;

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
