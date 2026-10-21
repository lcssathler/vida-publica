import { useRouter } from 'expo-router';
import { Text } from 'react-native';
import { useAssuntos, useEstaSeguindo, useSeguir } from '../../api/consultas';
import { mensagemDeErro } from '../../api/erros';
import { Alternar } from '../../components/Alternar';
import { Botao } from '../../components/Botao';
import { Carregando, Falha } from '../../components/Estado';
import { Bloco } from '../../components/Secao';
import { Tela } from '../../components/Tela';
import { typography } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

/** Passo 3: assuntos (temas oficiais das propostas) para seguir. */
export default function EscolherAssuntos() {
  const theme = useTheme();
  const router = useRouter();
  const assuntos = useAssuntos();
  const estaSeguindo = useEstaSeguindo();
  const seguir = useSeguir();

  if (assuntos.isPending) return <Carregando rotulo="Carregando os assuntos" />;
  if (assuntos.isError) {
    return <Falha mensagem={mensagemDeErro(assuntos.error)} aoTentar={() => void assuntos.refetch()} />;
  }

  const ordenados = [...assuntos.data].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const quantos = ordenados.filter((a) => estaSeguindo({ tipo: 'assunto', id: a.nome })).length;

  return (
    <Tela
      passo={{ atual: 3, total: 4 }}
      titulo="Que assuntos interessam a você?"
      descricao="Os temas oficiais que a Câmara e o Senado dão às propostas. O feed mostra o que andar nesses assuntos."
      rodape={
        <>
          <Botao rotulo="Voltar" variante="texto" aoTocar={() => router.back()} />
          <Botao
            rotulo={quantos > 0 ? `Continuar (${quantos})` : 'Pular'}
            variante={quantos > 0 ? 'primario' : 'secundario'}
            aoTocar={() => router.push('/onboarding/notificacoes')}
          />
        </>
      }
    >
      {seguir.isError ? (
        <Text style={[typography.body, { color: theme.error }]} aria-live="assertive">
          {mensagemDeErro(seguir.error)}
        </Text>
      ) : null}
      <Bloco>
        {ordenados.map((assunto) => {
          const alvo = { tipo: 'assunto' as const, id: assunto.nome };
          const segue = estaSeguindo(alvo);
          return (
            <Alternar
              key={assunto.nome}
              rotulo={assunto.nome}
              descricao={`${assunto.nome}, ${assunto.proposicoes} propostas`}
              aparencia="linha"
              marcado={segue}
              aoAlternar={() => seguir.mutate({ alvo, seguir: !segue, nome: assunto.nome })}
            />
          );
        })}
      </Bloco>
    </Tela>
  );
}
