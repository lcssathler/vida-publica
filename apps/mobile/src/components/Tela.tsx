import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { rules, space, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export interface TelaProps {
  /** Linha pequena acima do título, ex.: "Passo 1 de 4". */
  sobretitulo?: string;
  titulo?: string;
  descricao?: string;
  children: ReactNode;
  /** Ações fixas no pé da tela (fora da rolagem). */
  rodape?: ReactNode;
  /** false quando o conteúdo já rola sozinho (FlatList). */
  rolavel?: boolean;
}

/** Folha de papel: cabeçalho com fio duplo, conteúdo e pé de ações. */
export function Tela({ sobretitulo, titulo, descricao, children, rodape, rolavel = true }: TelaProps) {
  const theme = useTheme();
  const cabecalho = titulo ? (
    <View style={[styles.cabecalho, { borderBottomColor: theme.ink }]}>
      {sobretitulo ? (
        <Text style={[typography.overline, { color: theme.ink2 }]}>{sobretitulo}</Text>
      ) : null}
      <Text role="heading" style={[typography.headline, { color: theme.ink }]}>
        {titulo}
      </Text>
      {descricao ? (
        <Text style={[typography.body, { color: theme.ink2 }]}>{descricao}</Text>
      ) : null}
    </View>
  ) : null;

  return (
    <SafeAreaView style={[styles.tela, { backgroundColor: theme.paper }]} edges={['top', 'left', 'right', 'bottom']}>
      {rolavel ? (
        <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
          {cabecalho}
          {children}
        </ScrollView>
      ) : (
        <View style={styles.fixo}>
          <View style={styles.cabecalhoFixo}>{cabecalho}</View>
          {children}
        </View>
      )}
      {rodape ? (
        <View style={[styles.rodape, { borderTopColor: theme.rule, backgroundColor: theme.paper }]}>
          {rodape}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { paddingHorizontal: space.xl, paddingVertical: space.lg, gap: space.lg },
  fixo: { flex: 1 },
  cabecalhoFixo: { paddingHorizontal: space.xl, paddingTop: space.lg },
  cabecalho: {
    gap: space.xs,
    paddingBottom: space.md,
    borderBottomWidth: rules.double.top,
  },
  rodape: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderTopWidth: rules.hairline,
  },
});
