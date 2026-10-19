import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, space, toque, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { Icone, type NomeIcone } from './Icone';

export interface BotaoProps {
  rotulo: string;
  aoTocar: () => void;
  /** primario: tinta cheia; secundario: cartão com contorno; texto: só o rótulo, no acento. */
  variante?: 'primario' | 'secundario' | 'texto';
  desabilitado?: boolean;
  ocupado?: boolean;
  /** Nome lido pelo leitor de tela quando o rótulo visível não basta (ex.: "−"). */
  descricao?: string;
  /** Descrição extra lida pelo leitor de tela (o que acontece ao tocar). */
  dica?: string;
  /** Ícone antes do rótulo. */
  icone?: NomeIcone;
  /** Ícone depois do rótulo (ex.: seta para fora numa fonte oficial). */
  iconeFinal?: NomeIcone;
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
  icone,
  iconeFinal,
  estilo,
}: BotaoProps) {
  const theme = useTheme();
  const inativo = desabilitado || ocupado;
  const cores = {
    primario: { fundo: theme.ink, texto: theme.background, borda: theme.ink },
    secundario: { fundo: theme.surface, texto: theme.ink, borda: theme.rule },
    texto: { fundo: 'transparent', texto: theme.accent, borda: 'transparent' },
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
        pressed && styles.apertado,
        inativo && styles.apagado,
        estilo,
      ]}
    >
      <View style={styles.conteudo}>
        {icone ? <Icone nome={icone} tamanho={18} cor={cores.texto} /> : null}
        <Text style={[typography.label, styles.rotulo, { color: cores.texto }]}>
          {ocupado ? 'Aguarde…' : rotulo}
        </Text>
        {iconeFinal ? <Icone nome={iconeFinal} tamanho={18} cor={cores.texto} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  botao: {
    minHeight: toque.minimo + 4,
    minWidth: toque.minimo,
    paddingHorizontal: space.xl,
    borderWidth: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conteudo: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rotulo: { fontSize: 15 },
  texto: { paddingHorizontal: space.sm, minHeight: toque.minimo },
  apertado: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  apagado: { opacity: 0.5 },
});
