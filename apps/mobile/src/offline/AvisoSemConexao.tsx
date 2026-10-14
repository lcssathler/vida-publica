import { StyleSheet, Text, View } from 'react-native';
import { dataCurta, hora } from '../comum/formato';
import { space, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { useConectado } from './conexao';

/**
 * Faixa no alto da tela quando não há conexão, com a hora em que os dados
 * mostrados foram buscados. Não usa vermelho: é um aviso, não um erro.
 */
export function AvisoSemConexao({ atualizadoEm }: { atualizadoEm?: number }) {
  const theme = useTheme();
  const conectado = useConectado();
  if (conectado) return null;
  const quando = atualizadoEm
    ? (() => {
        const iso = new Date(atualizadoEm).toISOString();
        const h = hora(iso);
        return ` Salvo em ${dataCurta(iso)}${h ? ` às ${h}` : ''}.`;
      })()
    : '';
  return (
    <View
      style={[styles.aviso, { backgroundColor: theme.cautionBackground }]}
      role="alert"
      aria-live="polite"
    >
      <Text style={[typography.label, { color: theme.caution }]}>
        Sem conexão. Mostrando o que está guardado neste aparelho.{quando}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  aviso: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: 2 },
});
