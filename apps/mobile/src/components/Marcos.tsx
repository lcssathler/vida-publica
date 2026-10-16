import { StyleSheet, Text, View } from 'react-native';
import { diaPorExtenso, diaRelativo, semanaCurta } from '../comum/formato';
import { radius, space, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

/** Cabeçalho de dia numa lista de registros: "Hoje qua", "Ontem ter", "1 de outubro qui". */
export function CabecalhoDeDia({ iso }: { iso: string }) {
  const theme = useTheme();
  return (
    <View style={styles.dia} role="heading" aria-label={diaPorExtenso(iso)}>
      <Text style={[typography.overline, styles.nomeDia, { color: theme.ink }]}>{diaRelativo(iso)}</Text>
      <Text style={[typography.dataSmall, { color: theme.ink3 }]}>{semanaCurta(iso)}</Text>
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
  dia: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, paddingTop: space.md, paddingBottom: space.sm, paddingHorizontal: space.xs },
  nomeDia: { fontSize: 13 },
  parou: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.xs, paddingBottom: space.md },
  fio: { flex: 1, height: 1, opacity: 0.5 },
  pilula: { paddingHorizontal: space.sm + 2, paddingVertical: space.xs, borderRadius: radius.pill },
});
