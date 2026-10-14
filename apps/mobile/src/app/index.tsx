import { StyleSheet, Text, View } from 'react-native';
import { useSeguindo } from '../api/consultas';
import { mensagemDeErro } from '../api/erros';
import type { AlvoTipo } from '../api/tipos';
import { Botao } from '../components/Botao';
import { Carregando, Falha, Vazio } from '../components/Estado';
import { Tela } from '../components/Tela';
import { NOME_ESTADO } from '../onboarding/estados';
import { useSessao } from '../sessao/Sessao';
import { rules, space, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

const NOME_TIPO: Record<AlvoTipo, string> = {
  pessoa: 'Pessoa',
  partido: 'Partido',
  proposicao: 'Proposta',
  assunto: 'Assunto',
};

/** Início depois do onboarding: o que a pessoa segue. O feed entra no lugar. */
export default function Inicio() {
  const theme = useTheme();
  const { local, atualizarLocal } = useSessao();
  const seguindo = useSeguindo();

  if (seguindo.isPending) return <Carregando />;
  if (seguindo.isError) {
    return <Falha mensagem={mensagemDeErro(seguindo.error)} aoTentar={() => void seguindo.refetch()} />;
  }

  return (
    <Tela
      sobretitulo={local.uf ? NOME_ESTADO[local.uf] : undefined}
      titulo="Você acompanha"
      rodape={
        <Botao
          rotulo="Refazer escolhas"
          variante="secundario"
          aoTocar={() => void atualizarLocal({ onboardingConcluido: false })}
        />
      }
    >
      {seguindo.data.length === 0 ? (
        <Vazio mensagem="Você ainda não segue ninguém." />
      ) : (
        <View>
          {seguindo.data.map((s) => (
            <View
              key={`${s.tipo}:${s.id}`}
              accessible
              style={[styles.item, { borderBottomColor: theme.rule }]}
            >
              <Text style={[typography.overline, { color: theme.ink2 }]}>{NOME_TIPO[s.tipo]}</Text>
              <Text style={[typography.bodyStrong, { color: theme.ink }]}>{s.nome}</Text>
              {s.detalhe ? (
                <Text style={[typography.caption, { color: theme.ink2 }]} numberOfLines={2}>
                  {s.detalhe}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  item: { paddingVertical: space.md, gap: space.xxs, borderBottomWidth: rules.hairline },
});
