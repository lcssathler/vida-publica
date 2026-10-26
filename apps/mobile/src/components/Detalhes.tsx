import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { rules, space, toque, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { Icone } from './Icone';

/** Informações extensas só são montadas quando a pessoa pede para vê-las. */
export function Detalhes({ titulo, children }: { titulo: string; children: ReactNode }) {
  const theme = useTheme();
  const [aberto, setAberto] = useState(false);
  return (
    <View style={styles.grupo}>
      <Pressable
        role="button"
        aria-label={titulo}
        aria-expanded={aberto}
        onPress={() => setAberto((v) => !v)}
        style={[styles.controle, { borderColor: theme.rule }]}
      >
        <Text style={[typography.label, styles.texto, { color: theme.accent }]}>{titulo}</Text>
        <Icone nome={aberto ? 'chevron-up' : 'chevron-down'} tamanho={18} cor={theme.accent} />
      </Pressable>
      {aberto ? <View style={styles.grupo}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grupo: { gap: space.lg },
  controle: { minHeight: toque.minimo, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, borderBottomWidth: rules.hairline },
  texto: { flex: 1 },
});
