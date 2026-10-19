import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { radius, toque } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { Icone } from './Icone';

/** Voltar à tela anterior (ou ao feed, quando o app abriu direto aqui por um aviso). */
export function BotaoVoltar({ icone = 'chevron-left', rotulo = 'Voltar' }: { icone?: 'chevron-left' | 'x'; rotulo?: string }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Pressable
      role="button"
      aria-label={rotulo}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      style={({ pressed }) => [
        styles.botao,
        { backgroundColor: theme.surface, boxShadow: theme.shadowCard },
        pressed && styles.apertado,
      ]}
    >
      <Icone nome={icone} tamanho={22} cor={theme.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  botao: {
    width: toque.minimo,
    height: toque.minimo,
    minHeight: toque.minimo,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  apertado: { transform: [{ scale: 0.95 }] },
});
