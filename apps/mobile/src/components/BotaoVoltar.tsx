import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { recuo, rules, space, toque } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { Icone } from './Icone';

/** Voltar à tela anterior (ou ao feed, quando o app abriu direto aqui por um aviso). */
export function BotaoVoltar({ icone = 'chevron-left', rotulo = 'Voltar' }: { icone?: 'chevron-left' | 'x'; rotulo?: string }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Pressable
      role="button"
      aria-label={rotulo}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      style={({ pressed }) => [styles.botao, pressed && styles.apertado]}
    >
      <Icone nome={icone} tamanho={22} cor={theme.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  botao: {
    width: toque.minimo,
    height: toque.minimo,
    minHeight: toque.minimo,
    marginLeft: -space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apertado: { opacity: 0.6 },
});

/** Barra do alto das telas empilhadas: voltar à esquerda, uma ação à direita, fio embaixo. */
export function BarraVoltar({ acao, recuo: r = recuo }: { acao?: ReactNode; recuo?: number }) {
  const theme = useTheme();
  return (
    <View style={[barraStyles.barra, { borderBottomColor: theme.rule, marginHorizontal: -r, paddingHorizontal: r }]}>
      <BotaoVoltar />
      {acao ? <View style={barraStyles.acao}>{acao}</View> : null}
    </View>
  );
}

const barraStyles = StyleSheet.create({
  barra: { flexDirection: 'row', alignItems: 'center', minHeight: 64, borderBottomWidth: rules.hairline },
  acao: { marginLeft: 'auto' },
});
