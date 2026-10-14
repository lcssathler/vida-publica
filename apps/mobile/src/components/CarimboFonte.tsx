import { StyleSheet, Text, View } from 'react-native';
import { radius, space, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export interface CarimboFonteProps {
  /** Nome curto exibido no carimbo, ex.: "CÂMARA". */
  sigla: string;
  /** Nome completo lido pelo leitor de tela, ex.: "Câmara dos Deputados". */
  nome: string;
  /** Data do dado no formato ISO (AAAA-MM-DD). */
  data: string;
}

const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const MESES_EXTENSO = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function partes(data: string): { dia: number; mes: number; ano: string } {
  const [ano, mes, dia] = data.split('-');
  return { dia: Number(dia), mes: Number(mes) - 1, ano };
}

/** Selo da fonte oficial: tinta violeta, inclinado −2°, como carimbo de cartório. */
export function CarimboFonte({ sigla, nome, data }: CarimboFonteProps) {
  const theme = useTheme();
  const { dia, mes, ano } = partes(data);
  const rotulo = `${sigla} · ${String(dia).padStart(2, '0')} ${MESES[mes]} ${ano}`;

  return (
    <View
      accessible
      aria-label={`Fonte: ${nome}, dado de ${dia} de ${MESES_EXTENSO[mes]} de ${ano}`}
      style={[styles.carimbo, { borderColor: theme.stamp }]}
    >
      <Text style={[typography.dataSmall, styles.texto, { color: theme.stamp }]}>{rotulo}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  carimbo: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.paper,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    transform: [{ rotate: '-2deg' }],
    opacity: 0.92,
  },
  texto: { textTransform: 'uppercase' },
});
