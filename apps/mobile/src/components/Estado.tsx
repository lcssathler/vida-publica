import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { space, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { Botao } from './Botao';
import { BotaoVoltar } from './BotaoVoltar';

/** As telas empilhadas preservam a saída mesmo antes de os dados chegarem. */
export function EstadoComVolta({ carregando, mensagem, aoTentar, fechar = false }: {
  carregando?: string; mensagem?: string; aoTentar?: () => void; fechar?: boolean;
}) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.tela, { backgroundColor: theme.background }]}>
      <View style={styles.voltar}><BotaoVoltar icone={fechar ? 'x' : 'chevron-left'} rotulo={fechar ? 'Fechar' : 'Voltar'} /></View>
      {carregando ? <Carregando rotulo={carregando} /> : <Falha mensagem={mensagem ?? 'Não foi possível carregar.'} aoTentar={aoTentar} />}
    </SafeAreaView>
  );
}

/** Carregando, com o que está sendo carregado anunciado ao leitor de tela. */
export function Carregando({ rotulo = 'Carregando' }: { rotulo?: string }) {
  const theme = useTheme();
  return (
    <View
      style={[styles.centro, { backgroundColor: theme.background }]}
      accessible
      role="progressbar"
      aria-label={rotulo}
    >
      <ActivityIndicator color={theme.accent} />
      <Text style={[typography.caption, { color: theme.ink2 }]}>{rotulo}…</Text>
    </View>
  );
}

export interface FalhaProps {
  titulo?: string;
  mensagem: string;
  aoTentar?: () => void;
}

/** Erro com a explicação e, quando dá, o botão de tentar de novo. */
export function Falha({ titulo = 'Não carregou', mensagem, aoTentar }: FalhaProps) {
  const theme = useTheme();
  return (
    <View style={[styles.centro, { backgroundColor: theme.background }]} aria-live="polite">
      <Text role="heading" style={[typography.title, styles.texto, { color: theme.ink }]}>
        {titulo}
      </Text>
      <Text style={[typography.body, styles.texto, { color: theme.ink2 }]}>{mensagem}</Text>
      {aoTentar ? <Botao rotulo="Tentar de novo" variante="secundario" aoTocar={aoTentar} /> : null}
    </View>
  );
}

/** Lista vazia: diz por quê, sem parecer erro. */
export function Vazio({ mensagem }: { mensagem: string }) {
  const theme = useTheme();
  return (
    <View style={styles.vazio}>
      <Text style={[typography.body, styles.texto, { color: theme.ink2 }]}>{mensagem}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1 },
  voltar: { paddingHorizontal: space.xxl },
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
  vazio: { paddingVertical: space.xxl, paddingHorizontal: space.xl },
  texto: { textAlign: 'center' },
});
