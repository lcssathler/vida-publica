import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { radius, space, toque, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export interface BotaoProps {
  rotulo: string;
  aoTocar: () => void;
  /** primario: tinta cheia; secundario: contorno; texto: só o rótulo, no acento. */
  variante?: 'primario' | 'secundario' | 'texto';
  desabilitado?: boolean;
  ocupado?: boolean;
  /** Nome lido pelo leitor de tela quando o rótulo visível não basta (ex.: "−"). */
  descricao?: string;
  /** Descrição extra lida pelo leitor de tela (o que acontece ao tocar). */
  dica?: string;
  estilo?: StyleProp<ViewStyle>;
}

export function Botao({
  rotulo,
  aoTocar,
  variante = 'primario',
  desabilitado,
  ocupado,
  descricao,
  dica,
  estilo,
}: BotaoProps) {
  const theme = useTheme();
  const inativo = desabilitado || ocupado;
  const cores = {
    primario: { fundo: theme.ink, texto: theme.paper, borda: theme.ink },
    secundario: { fundo: 'transparent', texto: theme.ink, borda: theme.ink },
    texto: { fundo: 'transparent', texto: theme.stamp, borda: 'transparent' },
  }[variante];

  return (
    <Pressable
      role="button"
      aria-label={descricao ?? rotulo}
      accessibilityHint={dica}
      aria-disabled={!!inativo}
      aria-busy={!!ocupado}
      disabled={inativo}
      onPress={aoTocar}
      style={({ pressed }) => [
        styles.botao,
        { backgroundColor: cores.fundo, borderColor: cores.borda },
        variante === 'texto' && styles.texto,
        (pressed || inativo) && styles.apagado,
        estilo,
      ]}
    >
      <Text style={[typography.label, { color: cores.texto }]}>
        {ocupado ? 'Aguarde…' : rotulo}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  botao: {
    minHeight: toque.minimo,
    minWidth: toque.minimo,
    paddingHorizontal: space.lg,
    borderWidth: 1,
    borderRadius: radius.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texto: { paddingHorizontal: space.sm },
  apagado: { opacity: 0.6 },
});
