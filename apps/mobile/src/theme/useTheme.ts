import { useColorScheme } from 'react-native';
import { palettes, type Palette } from './tokens';

export function useTheme(): Palette {
  return palettes[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
