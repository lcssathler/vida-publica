import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  FILTROS_PADRAO,
  semFiltros,
  useAssuntos,
  useFeed,
  useSeguindo,
  type FiltrosFeed,
} from '../../api/consultas';
import { mensagemDeErro } from '../../api/erros';
import { diaCurto, diaPorExtenso } from '../../comum/formato';
import { Alternar } from '../../components/Alternar';
import { Botao } from '../../components/Botao';
import { Carregando, Falha, Vazio } from '../../components/Estado';
import { montarLinhas, type Linha } from '../../feed/linhas';
import { RegistroDoEvento } from '../../feed/RegistroDoEvento';
import { CATEGORIAS, NOMES_CATEGORIAS, type Categoria } from '../../feed/rotulos';
import { categoriasDoLink } from '../../notificacoes/link';
import { AvisoSemConexao } from '../../offline/AvisoSemConexao';
import { useSessao } from '../../sessao/Sessao';
import { rules, space, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

/** Assuntos oferecidos no filtro: os seguidos e os de mais propostas. */
const ASSUNTOS_SUGERIDOS = 10;

function alternar<T>(lista: T[], item: T): T[] {
  return lista.includes(item) ? lista.filter((i) => i !== item) : [...lista, item];
}

function filtrosPedidos(categorias: string | undefined): FiltrosFeed | null {
  const pedidas = categorias ? categoriasDoLink(`vidapublica://feed?categorias=${categorias}`) : null;
  return pedidas?.length ? { ...FILTROS_PADRAO, categorias: pedidas } : null;
}

export default function Feed() {
  const theme = useTheme();
  const router = useRouter();
  const { local, atualizarLocal } = useSessao();
  // O resumo semanal abre o feed de quem a pessoa segue já filtrado
  // (?categorias=gastos,campanha). Com a aba já montada, o parâmetro novo é
  // aplicado durante a renderização.
  const { categorias: pedidas } = useLocalSearchParams<{ categorias?: string }>();
  const [filtros, setFiltros] = useState<FiltrosFeed>(() => filtrosPedidos(pedidas) ?? FILTROS_PADRAO);
  const [abertos, setAbertos] = useState(() => !!filtrosPedidos(pedidas));
  const [pedidasAplicadas, setPedidasAplicadas] = useState(pedidas);
  if (pedidas !== pedidasAplicadas) {
    setPedidasAplicadas(pedidas);
    const pedidos = filtrosPedidos(pedidas);
    if (pedidos) {
      setFiltros(pedidos);
      setAbertos(true);
    }
  }
  // O marco da visita anterior fica fixo enquanto a tela está aberta.
  const [marcos] = useState(local.parouAqui);
  const feed = useFeed(filtros);
  const seguindo = useSeguindo();
  const assuntos = useAssuntos();

  const eventos = useMemo(() => feed.data?.pages.flatMap((p) => p.itens) ?? [], [feed.data]);
  const marco = semFiltros(filtros) ? (marcos[filtros.escopo] ?? null) : null;
  const linhas = useMemo(() => montarLinhas(eventos, marco), [eventos, marco]);

  // Na lista sem filtros, o registro do topo vira o marco da próxima visita.
  const topo = eventos[0];
  const marcoGravado = local.parouAqui[filtros.escopo];
  useEffect(() => {
    if (!topo || !semFiltros(filtros) || marcoGravado?.id === topo.id) return;
    atualizarLocal({
      parouAqui: { ...local.parouAqui, [filtros.escopo]: { ocorridoEm: topo.ocorridoEm, id: topo.id } },
    });
  }, [topo, filtros, marcoGravado, local.parouAqui, atualizarLocal]);

  const opcoesAssunto = useMemo(() => {
    const seguidos = (seguindo.data ?? []).filter((s) => s.tipo === 'assunto').map((s) => s.id);
    const maiores = [...(assuntos.data ?? [])]
      .sort((a, b) => b.proposicoes - a.proposicoes)
      .map((a) => a.nome)
      .filter((nome) => !seguidos.includes(nome))
      .slice(0, ASSUNTOS_SUGERIDOS);
    return [...seguidos, ...maiores];
  }, [seguindo.data, assuntos.data]);

  const quantosFiltros = filtros.categorias.length + filtros.assuntos.length;
  const naoSegueNada = seguindo.data?.length === 0;

  const cabecalho = (
    <View style={styles.cabecalho}>
      <AvisoSemConexao atualizadoEm={feed.dataUpdatedAt || undefined} />
      <View style={[styles.titulo, { borderBottomColor: theme.ink }]}>
        <Text role="heading" style={[typography.headline, { color: theme.ink }]}>
          Vida Pública
        </Text>
        <Text style={[typography.caption, { color: theme.ink2 }]}>
          Atos públicos registrados nas fontes oficiais
        </Text>
      </View>
      <View style={styles.linha} role="radiogroup" aria-label="O que mostrar">
        <Alternar
          papel="radio"
          rotulo="Quem eu sigo"
          marcado={filtros.escopo === 'seguindo'}
          aoAlternar={() => setFiltros((f) => ({ ...f, escopo: 'seguindo' }))}
        />
        <Alternar
          papel="radio"
          rotulo="Tudo"
          marcado={filtros.escopo === 'todos'}
          aoAlternar={() => setFiltros((f) => ({ ...f, escopo: 'todos' }))}
        />
        <View style={styles.espaco} />
        <Botao
          variante="texto"
          rotulo={quantosFiltros ? `Filtros (${quantosFiltros})` : 'Filtros'}
          dica={abertos ? 'Esconde os filtros' : 'Mostra os filtros por tipo e assunto'}
          aoTocar={() => setAbertos((a) => !a)}
        />
      </View>
      {abertos ? (
        <View style={[styles.filtros, { borderColor: theme.rule }]}>
          <Text role="heading" style={[typography.overline, { color: theme.ink2 }]}>
            Tipo
          </Text>
          <View style={styles.grade}>
            {NOMES_CATEGORIAS.map((c: Categoria) => (
              <Alternar
                key={c}
                rotulo={CATEGORIAS[c].nome}
                marcado={filtros.categorias.includes(c)}
                aoAlternar={() => setFiltros((f) => ({ ...f, categorias: alternar(f.categorias, c) }))}
              />
            ))}
          </View>
          {opcoesAssunto.length ? (
            <>
              <Text role="heading" style={[typography.overline, { color: theme.ink2 }]}>
                Assunto
              </Text>
              <View style={styles.grade}>
                {opcoesAssunto.map((nome) => (
                  <Alternar
                    key={nome}
                    rotulo={nome}
                    marcado={filtros.assuntos.includes(nome)}
                    aoAlternar={() => setFiltros((f) => ({ ...f, assuntos: alternar(f.assuntos, nome) }))}
                  />
                ))}
              </View>
            </>
          ) : null}
          {quantosFiltros ? (
            <Botao
              variante="secundario"
              rotulo="Limpar filtros"
              aoTocar={() => setFiltros((f) => ({ ...FILTROS_PADRAO, escopo: f.escopo }))}
              estilo={styles.limpar}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const renderizarLinha = ({ item }: { item: Linha }) => {
    if (item.tipo === 'dia') {
      return (
        <View style={[styles.dia, { borderBottomColor: theme.ink }]} role="heading" aria-label={diaPorExtenso(item.iso)}>
          <Text style={[typography.dataSmall, { color: theme.ink }]}>{diaCurto(item.iso)}</Text>
        </View>
      );
    }
    if (item.tipo === 'parou') {
      return (
        <View style={styles.parou} accessible role="heading" aria-label="Você parou aqui. Daqui para baixo, registros já vistos.">
          <View style={[styles.fio, { backgroundColor: theme.stamp }]} />
          <Text style={[typography.overline, { color: theme.stamp }]}>Você parou aqui</Text>
          <View style={[styles.fio, { backgroundColor: theme.stamp }]} />
        </View>
      );
    }
    return (
      <RegistroDoEvento
        evento={item.evento}
        novo={item.novo}
        aoTocar={() => router.push({ pathname: '/evento/[id]', params: { id: item.evento.id } })}
      />
    );
  };

  const vazio = () => {
    if (feed.isPending) return <Carregando rotulo="Carregando o feed" />;
    if (feed.isError) {
      return <Falha mensagem={mensagemDeErro(feed.error)} aoTentar={() => void feed.refetch()} />;
    }
    if (filtros.escopo === 'seguindo' && naoSegueNada) {
      return (
        <View style={styles.vazio}>
          <Vazio mensagem="Você ainda não segue ninguém. Veja tudo o que foi registrado ou escolha quem acompanhar na aba Seguindo." />
          <Botao rotulo="Ver tudo" aoTocar={() => setFiltros((f) => ({ ...f, escopo: 'todos' }))} />
        </View>
      );
    }
    return <Vazio mensagem={quantosFiltros ? 'Nenhum registro com esses filtros.' : 'Nenhum registro ainda.'} />;
  };

  const rodape = () => {
    if (feed.isFetchingNextPage) {
      return (
        <View style={styles.rodape} role="progressbar" aria-label="Carregando mais registros">
          <ActivityIndicator color={theme.stamp} />
        </View>
      );
    }
    if (feed.isFetchNextPageError) {
      return (
        <View style={styles.rodape}>
          <Text style={[typography.body, { color: theme.error }]}>{mensagemDeErro(feed.error)}</Text>
          <Botao variante="secundario" rotulo="Carregar mais" aoTocar={() => void feed.fetchNextPage()} />
        </View>
      );
    }
    if (eventos.length && !feed.hasNextPage) {
      return (
        <View style={styles.rodape}>
          <Text style={[typography.dataSmall, { color: theme.ink3 }]}>FIM DOS REGISTROS</Text>
        </View>
      );
    }
    return null;
  };

  return (
    <SafeAreaView style={[styles.tela, { backgroundColor: theme.paper }]} edges={['top', 'left', 'right']}>
      <FlatList
        testID="lista-feed"
        data={linhas}
        keyExtractor={(l) => l.chave}
        renderItem={renderizarLinha}
        ListHeaderComponent={cabecalho}
        ListEmptyComponent={vazio}
        ListFooterComponent={rodape}
        contentContainerStyle={styles.conteudo}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage && !feed.isFetchNextPageError) {
            void feed.fetchNextPage();
          }
        }}
        refreshControl={
          <RefreshControl
            refreshing={feed.isRefetching && !feed.isFetchingNextPage}
            onRefresh={() => void feed.refetch()}
            tintColor={theme.stamp}
            colors={[theme.stamp]}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { paddingHorizontal: space.xl, paddingBottom: space.xxl },
  cabecalho: { gap: space.md, paddingTop: space.lg, paddingBottom: space.sm },
  titulo: { gap: space.xxs, paddingBottom: space.md, borderBottomWidth: rules.double.top },
  linha: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  espaco: { flex: 1 },
  filtros: { gap: space.sm, paddingVertical: space.md, borderTopWidth: rules.hairline, borderBottomWidth: rules.hairline },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  limpar: { alignSelf: 'flex-start' },
  dia: { paddingTop: space.lg, paddingBottom: space.xs, borderBottomWidth: rules.hairline },
  parou: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  fio: { flex: 1, height: 1 },
  vazio: { alignItems: 'center', gap: space.md },
  rodape: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
});
