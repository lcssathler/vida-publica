import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSalvarPreferencias } from '../../api/consultas';
import { mensagemDeErro } from '../../api/erros';
import { Botao } from '../../components/Botao';
import { Icone, type NomeIcone } from '../../components/Icone';
import { Bloco } from '../../components/Secao';
import { Tela } from '../../components/Tela';
import { pedirPermissaoDoSistema } from '../../notificacoes/permissao';
import { useSessao } from '../../sessao/Sessao';
import { rules, space, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const REGRAS: { icone: NomeIcone; texto: string }[] = [
  { icone: 'users', texto: 'Só sobre quem e o que você segue: votos, pauta, propostas e campanha.' },
  { icone: 'dollar-sign', texto: 'Dinheiro e despesas chegam juntos, num resumo por semana.' },
  { icone: 'clock', texto: 'No máximo 5 por dia, nunca entre 22h e 7h (dá para mudar depois).' },
  { icone: 'shield', texto: 'Cada aviso leva ao registro com a fonte oficial.' },
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
      // Com a permissão, o app registra o token de envio (useAvisos).
      atualizarLocal({ onboardingConcluido: true, avisos: permitido });
    } catch (erro) {
      setAviso(mensagemDeErro(erro));
    } finally {
      setOcupado(null);
    }
  };

  return (
    <Tela
      passo={{ atual: 4, total: 4 }}
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
      <Bloco>
        {REGRAS.map(({ icone, texto }, i) => (
          <View
            key={texto}
            style={[styles.regra, i < REGRAS.length - 1 && { borderBottomWidth: rules.hairline, borderBottomColor: theme.line }]}
          >
            <Icone nome={icone} tamanho={18} cor={theme.accent} />
            <Text style={[typography.body, styles.textoRegra, { color: theme.ink }]}>{texto}</Text>
          </View>
        ))}
      </Bloco>
      {aviso ? (
        <Text style={[typography.body, { color: theme.error }]} aria-live="assertive">
          {aviso}
        </Text>
      ) : null}
    </Tela>
  );
}

const styles = StyleSheet.create({
  regra: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.md },
  textoRegra: { flex: 1 },
});
