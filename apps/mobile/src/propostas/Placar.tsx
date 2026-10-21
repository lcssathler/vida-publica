import { StyleSheet, Text, View } from 'react-native';
import type { ItemVotacao } from '../api/tipos';
import { inteiro } from '../comum/formato';
import { radius, space, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

type DadosPlacar = NonNullable<ItemVotacao['placar']>;

/**
 * Placar de votação nominal: números sempre escritos, Sim em verde e Não em
 * vermelho (a regra de cor do voto), abstenção e outros em tinta.
 */
export function Placar({ placar }: { placar: DadosPlacar }) {
  const theme = useTheme();
  const partes = [
    { nome: 'Sim', valor: placar.sim, cor: theme.yes },
    { nome: 'Não', valor: placar.nao, cor: theme.no },
    { nome: 'Abstenção', valor: placar.abstencao, cor: theme.ink3 },
    { nome: 'Outros', valor: placar.outros, cor: theme.rule },
  ];
  const total = partes.reduce((s, p) => s + p.valor, 0);
  const texto = partes.map((p) => `${p.nome} ${inteiro(p.valor)}`).join(' · ');

  return (
    <View accessible aria-label={`Placar: ${texto}`} style={styles.placar}>
      {total > 0 ? (
        <View style={styles.barra}>
          {partes
            .filter((p) => p.valor > 0)
            .map((p) => (
              <View key={p.nome} style={{ flex: p.valor, backgroundColor: p.cor }} />
            ))}
        </View>
      ) : null}
      <Text style={[typography.data, { color: theme.ink2 }]}>
        {partes.map((p, i) => (
          <Text key={p.nome}>
            {i ? ' · ' : ''}
            <Text style={{ color: p.nome === 'Sim' ? theme.yes : p.nome === 'Não' ? theme.no : theme.ink2 }}>
              {p.nome} {inteiro(p.valor)}
            </Text>
          </Text>
        ))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placar: { gap: space.xs },
  barra: { flexDirection: 'row', height: 8, borderRadius: radius.pill, overflow: 'hidden' },
});
