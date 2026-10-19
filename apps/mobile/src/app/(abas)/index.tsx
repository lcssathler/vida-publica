import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
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
import { AbaTexto, FaixaDeAbas } from '../../components/AbaTexto';
import { Alternar } from '../../components/Alternar';
import { Botao } from '../../components/Botao';
import { Carregando, Falha, Vazio } from '../../components/Estado';
import { Icone } from '../../components/Icone';
import { CabecalhoDeDia, VoceParouAqui } from '../../components/Marcos';
import { montarLinhas, type Linha } from '../../feed/linhas';
import { RegistroDoEvento } from '../../feed/RegistroDoEvento';
import { CATEGORIAS, NOMES_CATEGORIAS, type Categoria } from '../../feed/rotulos';
import { categoriasDoLink } from '../../notificacoes/link';
import { AvisoSemConexao } from '../../offline/AvisoSemConexao';
import { useSessao } from '../../sessao/Sessao';
import { barra, radius, space, toque, typography } from '../../theme/tokens';
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

  const escopos = [
    { valor: 'seguindo' as const, rotulo: 'Seguindo' },
    { valor: 'todos' as const, rotulo: 'Geral' },
  ];

  const cabecalho = (
    <View style={styles.cabecalho}>
      <AvisoSemConexao atualizadoEm={feed.dataUpdatedAt || undefined} />
      <View style={styles.titulo}>
        <Text role="heading" style={styles.oculto}>
          Vida Pública
        </Text>
        {/* De quem são os registros: o próprio título é a escolha. */}
        <View style={styles.escopos} role="radiogroup" aria-label="O que mostrar">
          {escopos.map(({ valor, rotulo }) => {
            const marcado = filtros.escopo === valor;
            return (
              <Pressable
                key={valor}
                role="radio"
                aria-label={rotulo}
                aria-checked={marcado}
                onPress={() => setFiltros((f) => ({ ...f, escopo: valor }))}
                style={styles.escopo}
              >
                <Text style={[typography.display, { color: marcado ? theme.ink : theme.inactive }]}>{rotulo}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          role="button"
          aria-label={quantosFiltros ? `Filtros (${quantosFiltros})` : 'Filtros'}
          accessibilityHint={abertos ? 'Esconde os filtros por assunto' : 'Mostra os filtros por assunto'}
          aria-expanded={abertos}
          onPress={() => setAbertos((a) => !a)}
          style={({ pressed }) => [
            styles.botaoFiltros,
            { backgroundColor: abertos ? theme.ink : theme.surface, boxShadow: theme.shadowCard },
            pressed && styles.apertado,
          ]}
        >
          <Icone nome="sliders" tamanho={20} cor={abertos ? theme.background : theme.ink} />
          {quantosFiltros ? (
            <View style={[styles.contador, { backgroundColor: theme.accent }]}>
              <Text style={[typography.dataSmall, styles.contadorTexto, { color: theme.surface }]}>{quantosFiltros}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {/* Tipo de registro: abas de texto sublinhadas (dá para marcar mais de uma). */}
      <FaixaDeAbas rotulo="Tipo de registro">
        <AbaTexto
          papel="checkbox"
          rotulo="Tudo"
          descricao="Todos os tipos"
          marcada={filtros.categorias.length === 0}
          aoTocar={() => setFiltros((f) => ({ ...f, categorias: [] }))}
        />
        {NOMES_CATEGORIAS.map((c: Categoria) => (
          <AbaTexto
            key={c}
            papel="checkbox"
            rotulo={CATEGORIAS[c].nome}
            marcada={filtros.categorias.includes(c)}
            aoTocar={() => setFiltros((f) => ({ ...f, categorias: alternar(f.categorias, c) }))}
          />
        ))}
      </FaixaDeAbas>

      {abertos ? (
        <View style={[styles.filtros, { backgroundColor: theme.surface, boxShadow: theme.shadowCard }]}>
          {opcoesAssunto.length ? (
            <>
              <Text role="heading" style={[typography.overline, { color: theme.ink }]}>
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
          ) : (
            <Text style={[typography.body, { color: theme.ink2 }]}>Nenhum assunto para filtrar ainda.</Text>
          )}
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
    if (item.tipo === 'dia') return <CabecalhoDeDia iso={item.iso} />;
    if (item.tipo === 'parou') return <VoceParouAqui />;
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
          <ActivityIndicator color={theme.accent} />
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
    <SafeAreaView style={[styles.tela, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
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
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { paddingHorizontal: space.lg, paddingBottom: barra.reserva },
  cabecalho: { gap: space.md, paddingTop: space.lg, paddingBottom: space.xs },
  titulo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  oculto: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 },
  escopos: { flexDirection: 'row', alignItems: 'center', gap: space.lg + 2, paddingLeft: space.xs, flexShrink: 1 },
  escopo: { minHeight: toque.minimo, justifyContent: 'center' },
  botaoFiltros: {
    width: toque.minimo,
    height: toque.minimo,
    minHeight: toque.minimo,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apertado: { transform: [{ scale: 0.95 }] },
  contador: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contadorTexto: { fontSize: 10, lineHeight: 12 },
  filtros: { gap: space.sm, padding: space.md + 2, borderRadius: radius.card },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  limpar: { alignSelf: 'flex-start' },
  vazio: { alignItems: 'center', gap: space.md },
  rodape: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
});

