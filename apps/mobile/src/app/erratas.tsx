import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useErratas } from '../api/consultas';
import { mensagemDeErro } from '../api/erros';
import { dataCurta, diaPorExtenso } from '../comum/formato';
import { Botao } from '../components/Botao';
import { Carregando, Falha, Vazio } from '../components/Estado';
import { LinkTexto } from '../components/Secao';
import { Tela } from '../components/Tela';
import { rules, space, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

/**
 * Erratas públicas: o que estava errado num registro, o que foi feito e
 * quando. Quando o registro corrigido continua no app, leva até ele.
 */
export default function Erratas() {
  const theme = useTheme();
  const router = useRouter();
  const erratas = useErratas();
  const voltar = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (erratas.isPending) return <Carregando rotulo="Carregando as erratas" />;
  if (erratas.isError) {
    return <Falha mensagem={mensagemDeErro(erratas.error)} aoTentar={() => void erratas.refetch()} />;
  }
  const lista = erratas.data.pages.flatMap((p) => p.erratas);

  return (
    <Tela
      sobretitulo="Correções"
      titulo="Erratas"
      descricao="Quando um registro estava errado, a correção fica aqui, com a data. Erratas não são apagadas."
      rodape={<Botao rotulo="Voltar" variante="texto" aoTocar={voltar} />}
    >
      {lista.length === 0 ? <Vazio mensagem="Nenhuma errata publicada." /> : null}
      {lista.map((x) => (
        <View key={x.id} style={[styles.errata, { borderBottomColor: theme.rule }]}>
          <Text
            style={[typography.data, { color: theme.ink2 }]}
            aria-label={`Publicada em ${diaPorExtenso(x.publicadaEm)}`}
          >
            {dataCurta(x.publicadaEm)}
          </Text>
          <Text role="heading" style={[typography.bodyStrong, { color: theme.ink }]}>
            {x.titulo}
          </Text>
          <Text style={[typography.body, { color: theme.ink }]}>{x.texto}</Text>
          {x.evento ? (
            <LinkTexto
              rotulo="Ver o registro corrigido"
              descricao={`Ver o registro corrigido: ${x.evento.titulo}`}
              aoTocar={() => router.push({ pathname: '/evento/[id]', params: { id: x.evento!.id } })}
            />
          ) : null}
        </View>
      ))}
      {erratas.hasNextPage ? (
        <Botao
          variante="secundario"
          rotulo="Mais erratas"
          ocupado={erratas.isFetchingNextPage}
          aoTocar={() => void erratas.fetchNextPage()}
        />
      ) : null}
    </Tela>
  );
}

const styles = StyleSheet.create({
  errata: { gap: space.xs, paddingBottom: space.md, borderBottomWidth: rules.hairline },
});
