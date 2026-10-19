import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AvisoSemConexao } from '../offline/AvisoSemConexao';
import { barra, radius, space, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export interface TelaProps {
  /** Linha pequena acima do título, ex.: "Correções". */
  sobretitulo?: string;
  titulo?: string;
  descricao?: string;
  /** Passo de um fluxo (onboarding): mostra a barra de progresso e "Passo N de T". */
  passo?: { atual: number; total: number };
  /** Elemento no alto, antes do título (ex.: botão de voltar). */
  topo?: ReactNode;
  children: ReactNode;
  /** Ações fixas no pé da tela (fora da rolagem). */
  rodape?: ReactNode;
  /** false quando o conteúdo já rola sozinho (FlatList). */
  rolavel?: boolean;
  /** Tela dentro das abas: reserva espaço para a barra flutuante. */
  comBarra?: boolean;
}

/** Tela do app: fundo, título grande, conteúdo e pé de ações. */
export function Tela({
  sobretitulo,
  titulo,
  descricao,
  passo,
  topo,
  children,
  rodape,
  rolavel = true,
  comBarra,
}: TelaProps) {
  const theme = useTheme();
  const sobre = passo ? `Passo ${passo.atual} de ${passo.total}` : sobretitulo;
  const cabecalho =
    titulo || topo ? (
      <View style={styles.cabecalho}>
        <AvisoSemConexao />
        {topo}
        {passo ? (
          <View
            role="progressbar"
            aria-label={`Passo ${passo.atual} de ${passo.total}`}
            aria-valuemin={1}
            aria-valuemax={passo.total}
            aria-valuenow={passo.atual}
            style={styles.progresso}
          >
            {Array.from({ length: passo.total }, (_, i) => (
              <View
                key={i}
                style={[styles.segmento, { backgroundColor: i < passo.atual ? theme.accent : theme.rule }]}
              />
            ))}
          </View>
        ) : null}
        {titulo ? (
          <View style={styles.textos}>
            {sobre ? <Text style={[typography.dataSmall, { color: theme.ink3 }]}>{sobre}</Text> : null}
            <Text role="heading" style={[typography.display, { color: theme.ink }]}>
              {titulo}
            </Text>
            {descricao ? <Text style={[typography.body, { color: theme.ink2 }]}>{descricao}</Text> : null}
          </View>
        ) : null}
      </View>
    ) : null;

  const reserva = comBarra ? { paddingBottom: barra.reserva } : null;

  return (
    <SafeAreaView
      style={[styles.tela, { backgroundColor: theme.background }]}
      edges={comBarra ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']}
    >
      {rolavel ? (
        <ScrollView contentContainerStyle={[styles.conteudo, reserva]} keyboardShouldPersistTaps="handled">
          {cabecalho}
          {children}
        </ScrollView>
      ) : (
        <View style={styles.fixo}>
          <View style={styles.cabecalhoFixo}>{cabecalho}</View>
          {children}
        </View>
      )}
      {rodape ? <View style={[styles.rodape, { backgroundColor: theme.background }]}>{rodape}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xxl, gap: space.lg },
  fixo: { flex: 1 },
  cabecalhoFixo: { paddingHorizontal: space.lg, paddingTop: space.lg },
  cabecalho: { gap: space.lg },
  textos: { gap: space.xs + 2, paddingHorizontal: space.xs },
  progresso: { flexDirection: 'row', gap: space.xs + 2, paddingHorizontal: space.xs },
  segmento: { flex: 1, height: 4, borderRadius: radius.pill },
  rodape: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
  },
});
