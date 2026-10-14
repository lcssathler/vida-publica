import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useSalvarPreferencias } from '../../api/consultas';
import { mensagemDeErro } from '../../api/erros';
import type { Uf } from '../../api/tipos';
import { Alternar } from '../../components/Alternar';
import { Botao } from '../../components/Botao';
import { Tela } from '../../components/Tela';
import { ESTADOS_POR_NOME, NOME_ESTADO, digitosCep, estadoDoCep, formatarCep } from '../../onboarding/estados';
import { useSessao } from '../../sessao/Sessao';
import { radius, space, toque, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

/**
 * Passo 1: estado, escolhido na lista ou pelo CEP. O CEP é convertido aqui
 * mesmo e descartado: só a sigla do estado vai para a conta.
 */
export default function EscolherEstado() {
  const theme = useTheme();
  const router = useRouter();
  const { local, atualizarLocal } = useSessao();
  const salvar = useSalvarPreferencias();
  const [uf, setUf] = useState<Uf | null>(local.uf);
  const [cep, setCep] = useState('');

  const doCep = estadoDoCep(cep);
  const cepCompleto = digitosCep(cep).length === 8;

  const aoDigitarCep = (texto: string) => {
    setCep(formatarCep(texto));
    const estado = estadoDoCep(texto);
    if (estado) setUf(estado);
  };

  const continuar = async () => {
    if (!uf) return;
    await salvar.mutateAsync({ uf });
    atualizarLocal({ uf });
    setCep('');
    router.push('/onboarding/seguir');
  };

  return (
    <Tela
      sobretitulo="Passo 1 de 4"
      titulo="Onde você vota?"
      descricao="Com o estado, o app sugere os senadores e deputados federais que representam você."
      rodape={
        <Botao
          rotulo={uf ? `Continuar com ${NOME_ESTADO[uf]}` : 'Escolha um estado'}
          desabilitado={!uf}
          ocupado={salvar.isPending}
          aoTocar={() => void continuar().catch(() => {})}
        />
      }
    >
      <View style={styles.bloco}>
        <Text style={[typography.label, { color: theme.ink }]}>
          CEP (opcional)
        </Text>
        <TextInput
          value={cep}
          onChangeText={aoDigitarCep}
          placeholder="00000-000"
          placeholderTextColor={theme.ink3}
          keyboardType="number-pad"
          autoComplete="postal-code"
          textContentType="postalCode"
          maxLength={9}
          aria-label="CEP"
          accessibilityHint="Convertido em estado no aparelho; o número não é enviado"
          style={[
            typography.data,
            styles.campo,
            { color: theme.ink, borderColor: theme.ink2, backgroundColor: theme.paperRaised },
          ]}
        />
        <Text style={[typography.caption, { color: theme.ink2 }]} aria-live="polite">
          {cepCompleto
            ? doCep
              ? `Este CEP fica em ${NOME_ESTADO[doCep]}.`
              : 'CEP fora das faixas conhecidas. Escolha o estado na lista.'
            : 'O CEP fica só neste aparelho: o app usa para achar o estado e não envia o número.'}
        </Text>
      </View>

      <View style={styles.bloco}>
        <Text role="heading" style={[typography.overline, { color: theme.ink2 }]}>
          Ou escolha o estado
        </Text>
        <View style={styles.grade} role="radiogroup">
          {ESTADOS_POR_NOME.map((sigla) => (
            <Alternar
              key={sigla}
              rotulo={NOME_ESTADO[sigla]}
              descricao={NOME_ESTADO[sigla]}
              papel="radio"
              marcado={uf === sigla}
              aoAlternar={() => setUf(sigla)}
            />
          ))}
        </View>
      </View>

      {salvar.isError ? (
        <Text style={[typography.body, { color: theme.error }]} aria-live="assertive">
          {mensagemDeErro(salvar.error)}
        </Text>
      ) : null}
    </Tela>
  );
}

const styles = StyleSheet.create({
  bloco: { gap: space.sm },
  campo: {
    minHeight: toque.minimo,
    borderWidth: 1,
    borderRadius: radius.paper,
    paddingHorizontal: space.md,
    fontSize: 17,
  },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
