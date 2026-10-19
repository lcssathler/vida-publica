import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, space, toque, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

/**
 * Bloco com título pequeno acima de um cartão. Os filhos ficam dentro do
 * cartão; `solto` deixa os filhos sem cartão (quando já são cartões).
 */
export function Secao({ titulo, children, solto }: { titulo: string; children: ReactNode; solto?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.secao}>
      <Text role="heading" style={[typography.overline, styles.titulo, { color: theme.ink }]}>
        {titulo}
      </Text>
      {solto ? (
        children
      ) : (
        <View style={[styles.cartao, { backgroundColor: theme.surface, boxShadow: theme.shadowCard }]}>{children}</View>
      )}
    </View>
  );
}

/** Texto que leva a outra tela (perfil, proposta), no acento. */
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
      <Text
        style={[
          typography[estilo],
          estilo === 'label' && styles.sublinhado,
          { color: estilo === 'label' ? theme.accent : theme.ink },
        ]}
      >
        {rotulo}
      </Text>
    </Pressable>
  );
}

/** Linha de dado: rótulo à esquerda, valor em mono à direita. */
export function Dado({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  const theme = useTheme();
  return (
    <View accessible style={[styles.dado, { borderBottomColor: theme.line }]}>
      <View style={styles.dadoTexto}>
        <Text style={[typography.body, { color: theme.ink }]}>{rotulo}</Text>
        {detalhe ? <Text style={[typography.caption, { color: theme.ink2 }]}>{detalhe}</Text> : null}
      </View>
      <Text style={[typography.data, { color: theme.ink }]}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  secao: { gap: space.sm },
  titulo: { fontSize: 13, paddingHorizontal: space.xs },
  cartao: { borderRadius: radius.card, paddingHorizontal: space.md + 2, paddingVertical: space.xs, overflow: 'hidden' },
  link: { minHeight: toque.minimo, justifyContent: 'center', alignSelf: 'flex-start' },
  apertado: { opacity: 0.6 },
  sublinhado: { textDecorationLine: 'underline' },
  dado: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: 1,
  },
  dadoTexto: { flex: 1, gap: space.xxs },
});
