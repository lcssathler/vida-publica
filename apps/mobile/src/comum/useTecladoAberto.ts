import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/** O dock não deve disputar espaço com o teclado de entrada. */
export function useTecladoAberto(): boolean {
  const [aberto, setAberto] = useState(() => Platform.OS !== 'web' && Keyboard.isVisible());
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const mostrar = Keyboard.addListener('keyboardDidShow', () => setAberto(true));
    const esconder = Keyboard.addListener('keyboardDidHide', () => setAberto(false));
    return () => { mostrar.remove(); esconder.remove(); };
  }, []);
  return aberto;
}
