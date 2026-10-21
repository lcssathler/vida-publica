import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AvisoSemConexao } from '../offline/AvisoSemConexao';
import { barra, fontFamily, recuo, rules, space, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export interface TelaProps {
  /** Linha pequena acima do título, ex.: "Correções". */
  sobretitulo?: string;
  titulo?: string;
  descricao?: string;
  /** Passo de um fluxo (onboarding): mostra a barra de progresso e "Passo N de T". */
  passo?: { atual: number; total: number };
  /** À esquerda da barra do alto (ex.: botão de voltar). */
  topo?: ReactNode;
  /** À direita da barra do alto (ex.: Seguir). */
  acao?: ReactNode;
  children: ReactNode;
  /** Ações fixas no pé da tela (fora da rolagem). */
  rodape?: ReactNode;
  /** false quando o conteúdo já rola sozinho (FlatList). */
  rolavel?: boolean;
  /** Tela dentro das abas: título na barra do alto e espaço para o dock. */
  comBarra?: boolean;
}

/**
 * Tela do app. No alto, uma barra com fio embaixo: o título (abas), o passo
 * (onboarding) ou o voltar (telas empilhadas). Fora das abas, o título vem
 * abaixo em serifa grande.
 */
export function Tela({
  sobretitulo,
  titulo,
  descricao,
  passo,
  topo,
  acao,
  children,
  rodape,
  rolavel = true,
  comBarra,
}: TelaProps) {
  const theme = useTheme();
  const tituloNaBarra = comBarra && !passo;

  const barraDoAlto =
    passo || topo || acao || tituloNaBarra ? (
      <View style={[styles.barra, { borderBottomColor: theme.rule }]}>
        {passo ? (
          <View style={styles.passo}>
            <Text style={[typography.tipo, { color: theme.accent }]}>
              Passo {passo.atual} de {passo.total}
            </Text>
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
          </View>
        ) : null}
        {topo}
        {tituloNaBarra && titulo ? (
          <Text role="heading" style={[styles.tituloBarra, { color: theme.ink }]}>
            {titulo}
          </Text>
        ) : null}
        {acao ? <View style={styles.acao}>{acao}</View> : null}
      </View>
    ) : null;

  const textos =
    titulo && !tituloNaBarra ? (
      <View style={styles.textos}>
        {sobretitulo ? <Text style={[typography.tipo, { color: theme.accent }]}>{sobretitulo}</Text> : null}
        <Text role="heading" style={[typography.display, { color: theme.ink }]}>
          {titulo}
        </Text>
        {descricao ? <Text style={[typography.body, { color: theme.ink2 }]}>{descricao}</Text> : null}
      </View>
    ) : tituloNaBarra && descricao ? (
      <Text style={[typography.caption, { color: theme.ink2 }]}>{descricao}</Text>
    ) : null;

  const cabecalho = (
    <View style={styles.cabecalho}>
      {barraDoAlto}
      <AvisoSemConexao />
      {textos}
    </View>
  );

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
  conteudo: { paddingHorizontal: recuo, paddingBottom: space.xxl, gap: space.lg },
  fixo: { flex: 1 },
  cabecalhoFixo: { paddingHorizontal: recuo },
  cabecalho: { gap: space.lg },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 64,
    marginHorizontal: -recuo,
    paddingHorizontal: recuo,
    borderBottomWidth: rules.hairline,
  },
  tituloBarra: { flex: 1, fontFamily: fontFamily.sansBold, fontSize: 23, lineHeight: 30, letterSpacing: -0.8 },
  acao: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: space.xs },
  passo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  progresso: { flex: 1, flexDirection: 'row', gap: space.xs },
  segmento: { flex: 1, height: 3, borderRadius: 2 },
  textos: { gap: space.sm, paddingTop: space.xs },
  rodape: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: recuo,
    paddingTop: space.md,
    paddingBottom: space.lg,
  },
});
