import { StyleSheet, Text, View } from 'react-native';
import type { ItemVotacao } from '../api/tipos';
import { inteiro } from '../comum/formato';
import { space, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

type DadosPlacar = NonNullable<ItemVotacao['placar']>;

/**
 * Placar de votação nominal: números sempre escritos e uma barra só em tons
 * de tinta (nenhuma cor diz se o voto é "bom" ou "ruim").
 */
export function Placar({ placar }: { placar: DadosPlacar }) {
  const theme = useTheme();
  const partes = [
    { nome: 'Sim', valor: placar.sim, cor: theme.ink },
    { nome: 'Não', valor: placar.nao, cor: theme.ink2 },
    { nome: 'Abstenção', valor: placar.abstencao, cor: theme.ink3 },
    { nome: 'Outros', valor: placar.outros, cor: theme.rule },
  ];
  const total = partes.reduce((s, p) => s + p.valor, 0);
  const texto = partes.map((p) => `${p.nome} ${inteiro(p.valor)}`).join(' · ');

  return (
    <View accessible aria-label={`Placar: ${texto}`} style={styles.placar}>
      {total > 0 ? (
        <View style={[styles.barra, { borderColor: theme.ink }]}>
          {partes
            .filter((p) => p.valor > 0)
            .map((p) => (
              <View key={p.nome} style={{ flex: p.valor, backgroundColor: p.cor }} />
            ))}
        </View>
      ) : null}
      <Text style={[typography.data, { color: theme.ink }]}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placar: { gap: space.xs },
  barra: { flexDirection: 'row', height: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 1, overflow: 'hidden' },
});
