import Feather from '@expo/vector-icons/Feather';
import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

/** Fontes do design (Inter e Instrument Serif, SIL Open Font License) e os ícones Feather (MIT). */
export const fonts = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  InstrumentSerif_400Regular,
  ...Feather.font,
};
