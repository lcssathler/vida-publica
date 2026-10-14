/**
 * Tokens do design "Protocolo": tinta sobre papel, um único acento (violeta de
 * carimbo). Nenhuma cor carrega significado político; verde e vermelho não
 * aparecem em dados.
 */

export type ColorScheme = 'light' | 'dark';

export interface Palette {
  paper: string;
  paperRaised: string;
  ink: string;
  ink2: string;
  ink3: string;
  rule: string;
  stamp: string;
  stampWash: string;
  highlight: string;
  caution: string;
  cautionBackground: string;
  error: string;
}

export const palettes: Record<ColorScheme, Palette> = {
  light: {
    paper: '#F3EFE6',
    paperRaised: '#FAF8F3',
    ink: '#1B1A17',
    ink2: '#4A4740',
    ink3: '#6E6A61',
    rule: '#D9D3C5',
    stamp: '#4B3FA0',
    stampWash: '#E7E3F4',
    highlight: '#F1E3A6',
    caution: '#8A5A00',
    cautionBackground: '#F6EBCF',
    error: '#9B2C1F',
  },
  dark: {
    paper: '#141311',
    paperRaised: '#1D1C19',
    ink: '#ECE7DC',
    ink2: '#B5AFA2',
    ink3: '#8A8578',
    rule: '#34312B',
    stamp: '#ADA4F2',
    stampWash: '#2A2648',
    highlight: '#4A4122',
    caution: '#E3B85C',
    cautionBackground: '#2E2614',
    error: '#F0A397',
  },
};

/** Famílias carregadas em src/theme/fonts.ts. */
export const fontFamily = {
  serif: 'Newsreader_500Medium',
  serifItalic: 'Newsreader_500Medium_Italic',
  sans: 'SchibstedGrotesk_400Regular',
  sansMedium: 'SchibstedGrotesk_500Medium',
  sansSemibold: 'SchibstedGrotesk_600SemiBold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

interface TextToken {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: 'uppercase';
}

/** Escala tipográfica em pontos (iOS) / sp (Android). */
export const typography = {
  display: { fontFamily: fontFamily.serif, fontSize: 34, lineHeight: 38 },
  headline: { fontFamily: fontFamily.serif, fontSize: 22, lineHeight: 27 },
  title: { fontFamily: fontFamily.serif, fontSize: 18, lineHeight: 23 },
  body: { fontFamily: fontFamily.sans, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fontFamily.sansSemibold, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fontFamily.sansMedium, fontSize: 13, lineHeight: 16, letterSpacing: 0.26 },
  caption: { fontFamily: fontFamily.sans, fontSize: 12, lineHeight: 16 },
  overline: {
    fontFamily: fontFamily.sansSemibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.88,
    textTransform: 'uppercase',
  },
  dataLarge: { fontFamily: fontFamily.monoMedium, fontSize: 28, lineHeight: 32 },
  data: { fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 },
  dataSmall: { fontFamily: fontFamily.mono, fontSize: 11, lineHeight: 14 },
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

/** Papel cortado: raio pequeno; avatar 3×4 nunca é círculo. */
export const radius = { paper: 2, sheet: 14 } as const;

/** Alvo de toque mínimo (48 dp do Material; acima dos 44 pt da Apple). */
export const toque = { minimo: 48 } as const;

/** Fio fino entre itens e fio duplo entre seções, como no Diário Oficial. */
export const rules = { hairline: 0.5, double: { top: 1, gap: 2, bottom: 0.5 } } as const;
