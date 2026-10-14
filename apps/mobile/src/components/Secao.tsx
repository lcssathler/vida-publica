import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { rules, space, toque, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

/** Bloco com título em versalete e fio fino embaixo do título. */
export function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.secao}>
      <Text role="heading" style={[typography.overline, styles.titulo, { color: theme.ink2, borderBottomColor: theme.rule }]}>
        {titulo}
      </Text>
      {children}
    </View>
  );
}

/** Texto que leva a outra tela (perfil, proposta), no acento do carimbo e sublinhado. */
export function LinkTexto({
  rotulo,
  aoTocar,
  descricao,
  estilo = 'label',
}: {
  rotulo: string;
  aoTocar: () => void;
  descricao?: string;
  estilo?: 'label' | 'bodyStrong' | 'title';
}) {
  const theme = useTheme();
  return (
    <Pressable
      role="link"
      aria-label={descricao ?? rotulo}
      onPress={aoTocar}
      hitSlop={8}
      style={({ pressed }) => [styles.link, pressed && styles.apertado]}
    >
      <Text style={[typography[estilo], styles.sublinhado, { color: theme.stamp }]}>{rotulo}</Text>
    </Pressable>
  );
}

/** Linha de dado: rótulo à esquerda, valor em mono à direita. */
export function Dado({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  const theme = useTheme();
  return (
    <View accessible style={[styles.dado, { borderBottomColor: theme.rule }]}>
      <View style={styles.dadoTexto}>
        <Text style={[typography.body, { color: theme.ink }]}>{rotulo}</Text>
        {detalhe ? <Text style={[typography.caption, { color: theme.ink2 }]}>{detalhe}</Text> : null}
      </View>
      <Text style={[typography.data, { color: theme.ink }]}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  secao: { gap: space.xs },
  titulo: { paddingBottom: space.xs, borderBottomWidth: rules.hairline },
  link: { minHeight: toque.minimo, justifyContent: 'center', alignSelf: 'flex-start' },
  apertado: { opacity: 0.6 },
  sublinhado: { textDecorationLine: 'underline' },
  dado: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: rules.hairline,
  },
  dadoTexto: { flex: 1, gap: space.xxs },
});
