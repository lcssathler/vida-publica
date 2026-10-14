import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSalvarPreferencias } from '../../api/consultas';
import { mensagemDeErro } from '../../api/erros';
import { Botao } from '../../components/Botao';
import { Tela } from '../../components/Tela';
import { pedirPermissaoDoSistema } from '../../notificacoes/permissao';
import { useSessao } from '../../sessao/Sessao';
import { rules, space, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const REGRAS = [
  'Só sobre quem e o que você segue: votos, gastos, pauta, troca de partido.',
  'No máximo 5 por dia, nunca entre 22h e 7h (dá para mudar depois).',
  'Cada aviso leva ao registro com a fonte oficial.',
];

/**
 * Passo 4: pré-pergunta. O pedido do sistema só aparece se a pessoa disser
 * sim aqui; quem disser "agora não" pode ligar depois nas preferências.
 */
export default function PrePerguntaNotificacoes() {
  const theme = useTheme();
  const { atualizarLocal } = useSessao();
  const salvar = useSalvarPreferencias();
  const [ocupado, setOcupado] = useState<'sim' | 'nao' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const concluir = async (quer: boolean) => {
    setOcupado(quer ? 'sim' : 'nao');
    setAviso(null);
    try {
      const permitido = quer ? await pedirPermissaoDoSistema().catch(() => false) : false;
      // Sem a permissão do sistema, a preferência fica desligada.
      await salvar.mutateAsync({ notificacoes: permitido });
      atualizarLocal({ onboardingConcluido: true });
    } catch (erro) {
      setAviso(mensagemDeErro(erro));
    } finally {
      setOcupado(null);
    }
  };

  return (
    <Tela
      sobretitulo="Passo 4 de 4"
      titulo="Quer ser avisado?"
      descricao="Quando algo acontecer com quem você segue, o app pode mandar um aviso."
      rodape={
        <>
          <Botao
            rotulo="Agora não"
            variante="secundario"
            ocupado={ocupado === 'nao'}
            desabilitado={ocupado !== null}
            aoTocar={() => void concluir(false)}
          />
          <Botao
            rotulo="Quero avisos"
            dica="Em seguida o aparelho pede a sua permissão"
            ocupado={ocupado === 'sim'}
            desabilitado={ocupado !== null}
            aoTocar={() => void concluir(true)}
          />
        </>
      }
    >
      <View>
        {REGRAS.map((regra, i) => (
          <View key={regra} style={[styles.regra, { borderBottomColor: theme.rule }]}>
            <Text style={[typography.data, { color: theme.ink3 }]}>{String(i + 1).padStart(2, '0')}</Text>
            <Text style={[typography.body, styles.textoRegra, { color: theme.ink }]}>{regra}</Text>
          </View>
        ))}
      </View>
      {aviso ? (
        <Text style={[typography.body, { color: theme.error }]} aria-live="assertive">
          {aviso}
        </Text>
      ) : null}
    </Tela>
  );
}

const styles = StyleSheet.create({
  regra: {
    flexDirection: 'row',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: rules.hairline,
  },
  textoRegra: { flex: 1 },
});
