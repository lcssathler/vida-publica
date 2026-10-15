import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useReportar } from '../../api/consultas';
import { mensagemDeErro } from '../../api/erros';
import type { MotivoReporte } from '../../api/tipos';
import { Alternar } from '../../components/Alternar';
import { Botao } from '../../components/Botao';
import { Tela } from '../../components/Tela';
import { radius, space, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const MOTIVOS: { valor: MotivoReporte; rotulo: string }[] = [
  { valor: 'fato_errado', rotulo: 'O fato está errado' },
  { valor: 'pessoa_errada', rotulo: 'A pessoa ou o partido está errado' },
  { valor: 'valor_errado', rotulo: 'O valor ou o número está errado' },
  { valor: 'fonte_quebrada', rotulo: 'A fonte oficial não abre' },
  { valor: 'outro', rotulo: 'Outro problema' },
];

const MAXIMO = 1000;

/**
 * "Reportar erro" num registro. Vai para a revisão humana do Vida Pública; se
 * houver erro, sai uma errata pública. A conta não é mostrada a quem revisa.
 */
export default function ReportarErro() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const reportar = useReportar(id);
  const [motivo, setMotivo] = useState<MotivoReporte | null>(null);
  const [texto, setTexto] = useState('');
  const voltar = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (reportar.isSuccess) {
    return (
      <Tela
        sobretitulo="Reportar erro"
        titulo="Recebido"
        rodape={<Botao rotulo="Voltar ao registro" aoTocar={voltar} />}
      >
        <Text style={[typography.body, { color: theme.ink }]} aria-live="polite">
          Obrigado. A equipe confere o registro na fonte oficial. Se houver erro, a correção
          sai numa errata pública, que aparece no próprio registro e na página de erratas.
        </Text>
        <Botao variante="texto" rotulo="Ver as erratas publicadas" aoTocar={() => router.push('/erratas')} />
      </Tela>
    );
  }

  return (
    <Tela
      sobretitulo="Reportar erro"
      titulo="O que está errado neste registro?"
      descricao="Vai para a revisão humana. Quem revisa não vê a sua conta."
      rodape={
        <>
          <Botao rotulo="Cancelar" variante="texto" aoTocar={voltar} />
          <Botao
            rotulo="Enviar"
            desabilitado={!motivo}
            ocupado={reportar.isPending}
            aoTocar={() =>
              motivo && reportar.mutate({ motivo, ...(texto.trim() ? { texto: texto.trim() } : {}) })
            }
          />
        </>
      }
    >
      <View role="radiogroup" aria-label="Motivo" style={styles.motivos}>
        {MOTIVOS.map((m) => (
          <Alternar
            key={m.valor}
            papel="radio"
            rotulo={m.rotulo}
            marcado={motivo === m.valor}
            aoAlternar={() => setMotivo(m.valor)}
          />
        ))}
      </View>
      <Text style={[typography.label, { color: theme.ink }]}>Detalhes (opcional)</Text>
      <TextInput
        value={texto}
        onChangeText={(t) => setTexto(t.slice(0, MAXIMO))}
        multiline
        maxLength={MAXIMO}
        aria-label="Detalhes do erro"
        accessibilityHint="Opcional. Diga onde está o erro e, se souber, a informação certa"
        placeholder="Onde está o erro e, se souber, a informação certa"
        placeholderTextColor={theme.ink3}
        style={[
          typography.body,
          styles.campo,
          { color: theme.ink, borderColor: theme.ink2, backgroundColor: theme.paperRaised },
        ]}
      />
      <Text style={[typography.caption, { color: theme.ink2 }]}>
        Não escreva dados pessoais (CPF, telefone, endereço). {texto.length}/{MAXIMO}
      </Text>
      {reportar.isError ? (
        <Text style={[typography.body, { color: theme.error }]} aria-live="polite">
          {mensagemDeErro(reportar.error)}
        </Text>
      ) : null}
    </Tela>
  );
}

const styles = StyleSheet.create({
  motivos: { gap: space.sm },
  campo: {
    minHeight: 120,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderRadius: radius.paper,
    padding: space.sm,
  },
});
