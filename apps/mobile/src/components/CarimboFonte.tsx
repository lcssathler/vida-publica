import { StyleSheet, Text, View } from 'react-native';
import { space, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { Icone } from './Icone';

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

/** Selo da fonte oficial: escudo e sigla com a data do dado, discreto no pé do cartão. */
export function CarimboFonte({ sigla, nome, data }: CarimboFonteProps) {
  const theme = useTheme();
  const { dia, mes, ano } = partes(data);
  const rotulo = `${sigla} · ${String(dia).padStart(2, '0')} ${MESES[mes]} ${ano}`;

  return (
    <View
      accessible
      aria-label={`Fonte: ${nome}, dado de ${dia} de ${MESES_EXTENSO[mes]} de ${ano}`}
      style={styles.carimbo}
    >
      <Icone nome="shield" tamanho={13} cor={theme.ink3} />
      <Text style={[typography.dataSmall, styles.texto, { color: theme.ink2 }]}>{rotulo}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  carimbo: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space.xs },
  texto: { textTransform: 'uppercase' },
});
