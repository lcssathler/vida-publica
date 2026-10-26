import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { recuo as recuoPadrao, rules, space, toque, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

/**
 * Bloco de largura total: fundo de publicação, fio em cima e a faixa embaixo,
 * como as publicações do feed. `recuo` é o recuo do contêiner (o bloco encosta
 * nas bordas da tela e devolve o recuo por dentro).
 */
export function Bloco({ children, recuo = recuoPadrao }: { children: ReactNode; recuo?: number }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.bloco,
        {
          backgroundColor: theme.surface,
          borderTopColor: theme.line,
          borderBottomColor: theme.postGap,
          marginHorizontal: -recuo,
          paddingHorizontal: recuo,
        },
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Seção: rótulo em caixa alta no acento e, embaixo, um bloco de largura
 * total. `solto` deixa os filhos sem bloco (quando já são cartões).
 */
export function Secao({
  titulo,
  children,
  solto,
  recuo,
  espacada,
}: {
  titulo: string;
  children: ReactNode;
  solto?: boolean;
  recuo?: number;
  /** Respiro entre controles de formulários, sem alterar a densidade dos registros. */
  espacada?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.secao}>
      <Text role="heading" style={[typography.tipo, { color: theme.accent }]}>
        {titulo}
      </Text>
      {solto ? children : <Bloco recuo={recuo}>{espacada ? <View style={styles.conteudoEspacado}>{children}</View> : children}</Bloco>}
    </View>
  );
}

/** Título de grupo em serifa com ponto final ("Senado.") e a contagem à direita. */
export function TituloDeGrupo({ titulo, contagem }: { titulo: string; contagem?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.grupo}>
      <Text role="heading" style={[typography.dia, { color: theme.ink }]}>
        {titulo}.
      </Text>
      {contagem ? <Text style={[typography.caption, { color: theme.ink3 }]}>{contagem}</Text> : null}
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
  const { width, fontScale } = useWindowDimensions();
  return (
    <View accessible style={[styles.dado, (width < 360 || fontScale > 1.3) && styles.dadoEmpilhado, { borderBottomColor: theme.line }]}>
      <View style={styles.dadoTexto}>
        <Text style={[typography.body, { color: theme.ink }]}>{rotulo}</Text>
        {detalhe ? <Text style={[typography.caption, { color: theme.ink2 }]}>{detalhe}</Text> : null}
      </View>
      <Text style={[typography.data, { color: theme.ink, flexShrink: 1 }]}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  secao: { gap: space.sm + 2 },
  conteudoEspacado: { gap: space.md, paddingVertical: space.md },
  bloco: { paddingVertical: space.xs, borderTopWidth: rules.hairline, borderBottomWidth: rules.faixa },
  grupo: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md, paddingTop: space.sm },
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
  dadoEmpilhado: { flexDirection: 'column', gap: space.xs },
});
