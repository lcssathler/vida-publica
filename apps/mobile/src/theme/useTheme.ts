import { palettes, type Palette } from './tokens';
import { useEsquema } from './preferencia';

export function useTheme(): Palette {
  return palettes[useEsquema()];
}
