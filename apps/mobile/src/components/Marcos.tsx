import { StyleSheet, Text, View } from 'react-native';
import { diaPorExtenso, diaRelativo, semanaCurta } from '../comum/formato';
import { radius, recuo, space, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

/** Cabeçalho de dia numa lista de registros: "Hoje.", "14 de outubro." e quantos registros há nele. */
export function CabecalhoDeDia({ iso, quantidade }: { iso: string; quantidade?: number }) {
  const theme = useTheme();
  return (
    <View style={styles.dia} role="heading" aria-label={diaPorExtenso(iso)}>
      <Text style={[typography.dia, { color: theme.ink }]}>{diaRelativo(iso)}.</Text>
      {quantidade ? (
        <Text style={[typography.caption, { color: theme.ink3 }]}>
          {quantidade} {quantidade === 1 ? 'registro' : 'registros'}
        </Text>
      ) : (
        <Text style={[typography.dataSmall, { color: theme.ink3 }]}>{semanaCurta(iso)}</Text>
      )}
    </View>
  );
}

/** Divisa entre o que é novo e o que já foi visto na visita anterior. */
export function VoceParouAqui() {
  const theme = useTheme();
  return (
    <View style={styles.parou} accessible role="heading" aria-label="Você parou aqui. Daqui para baixo, registros já vistos.">
      <View style={[styles.fio, { backgroundColor: theme.accent }]} />
      <View style={[styles.pilula, { backgroundColor: theme.accentWash }]}>
        <Text style={[typography.overline, { color: theme.accent }]}>Você parou aqui</Text>
      </View>
      <View style={[styles.fio, { backgroundColor: theme.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  dia: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, paddingTop: space.lg + 2, paddingBottom: space.md, paddingHorizontal: recuo },
  parou: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.xs, paddingBottom: space.md },
  fio: { flex: 1, height: 1, opacity: 0.5 },
  pilula: { paddingHorizontal: space.sm + 2, paddingVertical: space.xs, borderRadius: radius.pill },
});
