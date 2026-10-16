import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { rules, space, toque, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

/** Faixa rolável de abas de texto com um fio embaixo. */
export function FaixaDeAbas({ children, rotulo, papel }: { children: ReactNode; rotulo: string; papel?: 'radiogroup' }) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      role={papel}
      aria-label={rotulo}
      style={[styles.faixa, { borderBottomColor: theme.rule }]}
      contentContainerStyle={styles.faixaConteudo}
    >
      {children}
    </ScrollView>
  );
}

/**
 * Aba de texto: sem caixa, com um traço no acento embaixo quando marcada.
 * radio quando só uma vale; checkbox quando dá para marcar várias.
 */
export function AbaTexto({
  rotulo,
  descricao,
  contagem,
  marcada,
  aoTocar,
  papel = 'radio',
}: {
  rotulo: string;
  descricao?: string;
  contagem?: string;
  marcada: boolean;
  aoTocar: () => void;
  papel?: 'radio' | 'checkbox';
}) {
  const theme = useTheme();
  return (
    <Pressable
      role={papel}
      aria-label={descricao ?? rotulo}
      aria-checked={marcada}
      onPress={aoTocar}
      style={[styles.aba, { borderBottomColor: marcada ? theme.accent : 'transparent' }]}
    >
      <Text style={[marcada ? typography.label : typography.body, styles.texto, { color: marcada ? theme.ink : theme.ink2 }]}>
        {rotulo}
        {contagem ? <Text style={[typography.dataSmall, { color: marcada ? theme.accent : theme.ink3 }]}> {contagem}</Text> : null}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  faixa: { flexGrow: 0, borderBottomWidth: rules.hairline, marginHorizontal: -space.lg },
  faixaConteudo: { gap: space.xl, paddingHorizontal: space.lg + space.xs },
  aba: { minHeight: toque.minimo, justifyContent: 'center', borderBottomWidth: 2, marginBottom: -1 },
  texto: { fontSize: 14 },
});
