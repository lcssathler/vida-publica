import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { useAssuntos, useEstaSeguindo, useSeguir } from '../../api/consultas';
import { mensagemDeErro } from '../../api/erros';
import { Alternar } from '../../components/Alternar';
import { Botao } from '../../components/Botao';
import { CampoBusca } from '../../components/CampoBusca';
import { correspondeBusca } from '../../comum/busca';
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
  const [busca, setBusca] = useState('');
  const [todos, setTodos] = useState(false);

  if (assuntos.isPending) return <Carregando rotulo="Carregando os assuntos" />;
  if (assuntos.isError) {
    return <Falha mensagem={mensagemDeErro(assuntos.error)} aoTentar={() => void assuntos.refetch()} />;
  }

  const ordenados = [...assuntos.data].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const quantos = ordenados.filter((a) => estaSeguindo({ tipo: 'assunto', id: a.nome })).length;
  const sugeridos = [...ordenados].sort((a, b) => b.proposicoes - a.proposicoes).slice(0, 12);
  const lista = busca.trim()
    ? ordenados.filter((a) => correspondeBusca(a.nome, busca))
    : todos ? ordenados : ordenados.filter((a) => sugeridos.includes(a) || estaSeguindo({ tipo: 'assunto', id: a.nome }));

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
            desabilitado={seguir.isPending}
            aoTocar={() => router.push('/onboarding/notificacoes')}
          />
        </>
      }
    >
      <CampoBusca valor={busca} aoMudar={setBusca} rotulo="Buscar assunto" placeholder="Nome do assunto" />
      <Text style={[typography.caption, { color: theme.ink2 }]} aria-live="polite">
        {quantos} {quantos === 1 ? 'assunto selecionado' : 'assuntos selecionados'}.
        {!busca.trim() && !todos ? ' Mostrando os temas com mais propostas e os seus selecionados.' : ''}
      </Text>
      {lista.length === 0 ? <Text style={[typography.body, { color: theme.ink2 }]}>Nenhum assunto encontrado. Tente outra palavra.</Text> : null}
      {seguir.isError ? (
        <Text style={[typography.body, { color: theme.error }]} aria-live="assertive">
          {mensagemDeErro(seguir.error)}
        </Text>
      ) : null}
      <Bloco>
        {lista.map((assunto) => {
          const alvo = { tipo: 'assunto' as const, id: assunto.nome };
          const segue = estaSeguindo(alvo);
          return (
            <Alternar
              key={assunto.nome}
              rotulo={assunto.nome}
              descricao={`${assunto.nome}, ${assunto.proposicoes} propostas`}
              aparencia="linha"
              marcado={segue}
              desabilitado={seguir.isPending}
              aoAlternar={() => seguir.mutate({ alvo, seguir: !segue, nome: assunto.nome })}
            />
          );
        })}
      </Bloco>
      {!busca.trim() && ordenados.length > 12 ? (
        <Botao variante="texto" rotulo={todos ? 'Mostrar sugestões' : `Ver todos os ${ordenados.length} assuntos`} aoTocar={() => setTodos((v) => !v)} />
      ) : null}
    </Tela>
  );
}
