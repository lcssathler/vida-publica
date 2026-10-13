import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Registro } from '../components/Registro';
import { rules, space, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

/**
 * Tela inicial provisória: mostra a linguagem visual do feed com registros de
 * exemplo. Pessoas e números abaixo são fictícios; o feed real entra na Fase 6.
 */
export default function Feed() {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.tela, { backgroundColor: theme.paper }]}>
      <ScrollView contentContainerStyle={styles.conteudo}>
        <Text style={[typography.headline, { color: theme.ink }]}>Vida Pública</Text>
        <View style={[styles.folio, { borderColor: theme.ink }]}>
          <Text style={[typography.dataSmall, { color: theme.ink }]}>REGISTROS DE EXEMPLO</Text>
          <Text style={[typography.caption, { color: theme.ink2 }]}>
            Pessoas e números fictícios
          </Text>
        </View>

        <Registro
          novo
          tipo="Votação nominal · Trabalho e Emprego"
          hora="14:32"
          manchete="Maria Exemplo votou Não na PEC 0/2026"
          contexto="Contra a orientação do [XYZ], que orientou Sim."
          fonte={{ sigla: 'Câmara', nome: 'Câmara dos Deputados', data: '2026-10-08' }}
          protocolo="2026·1008·0001"
          coletadoEm="2026-10-13"
        />
        <Registro
          tipo="Pauta do Plenário"
          hora="09:10"
          manchete="PL 0000/2026 entra na pauta de quarta, 14h"
          fonte={{ sigla: 'Câmara', nome: 'Câmara dos Deputados', data: '2026-10-13' }}
          protocolo="2026·1013·0002"
          coletadoEm="2026-10-13"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { paddingHorizontal: space.xl, paddingVertical: space.lg },
  folio: {
    marginTop: space.md,
    paddingVertical: space.sm,
    borderTopWidth: rules.double.top,
    borderBottomWidth: rules.double.top,
    gap: space.xxs,
  },
});
