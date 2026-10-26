import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  FILTROS_PADRAO,
  semFiltros,
  useAssuntos,
  useFeed,
  useSeguindo,
  type FiltrosFeed,
} from '../api/consultas';
import { mensagemDeErro } from '../api/erros';
import { Alternar } from '../components/Alternar';
import { Botao } from '../components/Botao';
import { Carregando, Falha, Vazio } from '../components/Estado';
import { Icone } from '../components/Icone';
import { CabecalhoDeDia, VoceParouAqui } from '../components/Marcos';
import { categoriasDoLink } from '../notificacoes/link';
import { AvisoSemConexao } from '../offline/AvisoSemConexao';
import { useSessao } from '../sessao/Sessao';
import { radius, recuo, space, toque, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { montarLinhas, type Linha } from './linhas';
import { RegistroDoEvento } from './RegistroDoEvento';
import { Detalhes } from '../components/Detalhes';
import { dataCurta } from '../comum/formato';
import { fonteDaUrl } from './rotulos';
import { CATEGORIAS, NOMES_CATEGORIAS, type Categoria } from './rotulos';

/** Assuntos oferecidos no filtro: os seguidos e os de mais propostas. */
const ASSUNTOS_SUGERIDOS = 10;

function alternar<T>(lista: T[], item: T): T[] {
  return lista.includes(item) ? lista.filter((i) => i !== item) : [...lista, item];
}

function filtrosPedidos(escopo: FiltrosFeed['escopo'], categorias: string | undefined): FiltrosFeed | null {
  const pedidas = categorias ? categoriasDoLink(`vidapublica://feed?categorias=${categorias}`) : null;
  return pedidas?.length ? { ...FILTROS_PADRAO, escopo, categorias: pedidas } : null;
}

/** Quantos registros há em cada cabeçalho de dia (até o próximo dia ou o divisor). */
function contarPorDia(linhas: Linha[]): Map<string, number> {
  const contagem = new Map<string, number>();
  let atual: string | null = null;
  for (const l of linhas) {
    if (l.tipo === 'dia') {
      atual = l.chave;
      contagem.set(atual, 0);
    } else if (l.tipo === 'parou') {
      atual = null;
    } else if (atual) {
      contagem.set(atual, (contagem.get(atual) ?? 0) + 1);
    }
  }
  return contagem;
}

/**
 * Lista de registros. "seguindo" é a aba Feed (perfis que a pessoa segue);
 * "todos" é a aba Navegar (tudo o que foi registrado). As duas guardam o
 * próprio "Você parou aqui" e os próprios filtros.
 */
export function TelaFeed({ escopo }: { escopo: FiltrosFeed['escopo'] }) {
  const theme = useTheme();
  const router = useRouter();
  const { local, atualizarLocal } = useSessao();
  // O resumo semanal abre o feed de quem a pessoa segue já filtrado
  // (?categorias=gastos,campanha). Com a aba já montada, o parâmetro novo é
  // aplicado durante a renderização.
  const { categorias: pedidas } = useLocalSearchParams<{ categorias?: string }>();
  const [filtros, setFiltros] = useState<FiltrosFeed>(() => filtrosPedidos(escopo, pedidas) ?? { ...FILTROS_PADRAO, escopo });
  const [abertos, setAbertos] = useState(false);
  const [pedidasAplicadas, setPedidasAplicadas] = useState(pedidas);
  if (pedidas !== pedidasAplicadas) {
    setPedidasAplicadas(pedidas);
    const pedidos = filtrosPedidos(escopo, pedidas);
    if (pedidos) setFiltros(pedidos);
  }
  // O marco da visita anterior fica fixo enquanto a tela está aberta.
  const [marcos] = useState(local.parouAqui);
  const feed = useFeed(filtros);
  const seguindo = useSeguindo();
  const assuntos = useAssuntos();

  const eventos = useMemo(() => feed.data?.pages.flatMap((p) => p.itens) ?? [], [feed.data]);
  const marco = semFiltros(filtros) ? (marcos[escopo] ?? null) : null;
  const linhas = useMemo(() => montarLinhas(eventos, marco), [eventos, marco]);
  const porDia = useMemo(() => contarPorDia(linhas), [linhas]);

  // Na lista sem filtros, o registro do topo vira o marco da próxima visita.
  const topo = eventos[0];
  const marcoGravado = local.parouAqui[escopo];
  useEffect(() => {
    if (!topo || !semFiltros(filtros) || marcoGravado?.id === topo.id) return;
    atualizarLocal({
      parouAqui: { ...local.parouAqui, [escopo]: { ocorridoEm: topo.ocorridoEm, id: topo.id } },
    });
  }, [topo, filtros, escopo, marcoGravado, local.parouAqui, atualizarLocal]);

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
  const quantosAssuntos = filtros.assuntos.length;
  const naoSegueNada = seguindo.data?.length === 0;
  const coletas = useMemo(() => {
    const porFonte = new Map<string, string>();
    for (const evento of eventos) {
      const nome = fonteDaUrl(evento.fonte.url).nome;
      const data = evento.fonte.coletadoEm;
      const anterior = porFonte.get(nome);
      if (Number.isFinite(Date.parse(data)) && (!anterior || Date.parse(data) > Date.parse(anterior))) porFonte.set(nome, data);
    }
    return [...porFonte].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [eventos]);

  const cabecalho = (
    <View style={styles.cabecalho}>
      <View style={styles.barraTopo}>
        <View style={styles.marca}>
          <Icone nome="align-left" tamanho={21} cor={theme.accent} />
          <Text role="heading" style={[styles.marcaTexto, { color: theme.ink }]}>
            Vida Pública
          </Text>
        </View>
        <Pressable
          role="button"
          aria-label="Buscar"
          onPress={() => router.navigate('/busca')}
          style={({ pressed }) => [styles.botaoIcone, pressed && styles.apertado]}
        >
          <Icone nome="search" tamanho={20} cor={theme.ink2} />
        </Pressable>
        <Pressable
          role="button"
          aria-label={quantosFiltros ? `Filtros (${quantosFiltros})` : 'Filtros'}
          accessibilityHint={abertos ? 'Esconde os filtros por assunto' : 'Mostra os filtros por assunto'}
          aria-expanded={abertos}
          onPress={() => setAbertos((a) => !a)}
          style={({ pressed }) => [styles.botaoIcone, styles.ultimo, pressed && styles.apertado]}
        >
          <Icone nome="sliders" tamanho={20} cor={abertos ? theme.accent : theme.ink2} />
          {quantosAssuntos ? <View style={[styles.ponto, { backgroundColor: theme.accent, borderColor: theme.background }]} /> : null}
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} aria-label="Tipos de registro: selecione um ou mais" contentContainerStyle={styles.tipos}>
        <Alternar
          papel="checkbox"
          rotulo="Tudo"
          descricao="Todos os tipos"
          marcado={filtros.categorias.length === 0}
          aoAlternar={() => setFiltros((f) => ({ ...f, categorias: [] }))}
        />
        {NOMES_CATEGORIAS.map((c: Categoria) => (
          <Alternar
            key={c}
            papel="checkbox"
            rotulo={CATEGORIAS[c].nome}
            marcado={filtros.categorias.includes(c)}
            aoAlternar={() => setFiltros((f) => ({ ...f, categorias: alternar(f.categorias, c) }))}
          />
        ))}
      </ScrollView>

      <View style={styles.recuado}>
        <AvisoSemConexao atualizadoEm={feed.dataUpdatedAt || undefined} />
      </View>
      <View style={[styles.contexto, styles.recuado]}>
        <View style={[styles.pontoContexto, { backgroundColor: theme.accent }]} />
        <Text style={[typography.caption, { color: theme.ink3 }]}>
          {escopo === 'seguindo' ? 'Perfis que você segue' : 'Tudo o que foi registrado'}
        </Text>
      </View>
      {coletas.length ? (
        <View style={styles.recuado}>
          <Detalhes titulo="Sobre os dados exibidos">
            <Text style={[typography.caption, { color: theme.ink2 }]}>Coleta mais recente entre os registros desta lista, por fonte. Estas datas não indicam a última sincronização completa das fontes.</Text>
            {coletas.map(([nome, data]) => (
              <Text key={nome} style={[typography.caption, { color: theme.ink2 }]}>{nome}: {dataCurta(data)}</Text>
            ))}
          </Detalhes>
        </View>
      ) : null}
      {quantosFiltros ? (
        <View style={[styles.resumoFiltros, styles.recuado]}>
          <Text style={[typography.caption, { color: theme.ink2 }]}>{quantosFiltros} {quantosFiltros === 1 ? 'filtro ativo' : 'filtros ativos'}</Text>
          <Botao variante="texto" rotulo="Limpar filtros" aoTocar={() => setFiltros({ ...FILTROS_PADRAO, escopo })} />
        </View>
      ) : null}

      {abertos ? (
        <View style={[styles.filtros, { backgroundColor: theme.surface, boxShadow: theme.shadowCard }]}>
          <Text role="heading" style={[typography.dia, { color: theme.ink }]}>
            Seu recorte.
          </Text>
          {opcoesAssunto.length ? (
            <>
              <Text style={[typography.overline, { color: theme.ink2 }]}>Assunto</Text>
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
        </View>
      ) : null}
    </View>
  );

  const renderizarLinha = ({ item }: { item: Linha }) => {
    if (item.tipo === 'dia') return <CabecalhoDeDia iso={item.iso} quantidade={porDia.get(item.chave)} />;
    if (item.tipo === 'parou') {
      return (
        <View style={styles.recuado}>
          <VoceParouAqui />
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
    if (escopo === 'seguindo' && naoSegueNada) {
      return (
        <View style={[styles.vazio, styles.recuado]}>
          <Vazio mensagem="Você ainda não segue ninguém. Veja tudo o que foi registrado em Navegar ou escolha quem acompanhar na aba Seguindo." />
          <Botao rotulo="Ver tudo" iconeFinal="compass" aoTocar={() => router.navigate('/navegar' as Href)} />
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
  conteudo: { paddingBottom: space.lg },
  tipos: { paddingHorizontal: recuo, gap: space.sm },
  resumoFiltros: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' },
  cabecalho: { gap: space.sm, paddingBottom: space.xs },
  recuado: { paddingHorizontal: recuo },
  barraTopo: { flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingLeft: recuo, paddingRight: space.sm },
  marca: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 1, marginRight: 'auto' },
  marcaTexto: { fontFamily: 'Inter_700Bold', fontSize: 23, lineHeight: 28, letterSpacing: -1 },
  botaoIcone: {
    width: toque.minimo,
    height: toque.minimo,
    minHeight: toque.minimo,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ultimo: { marginLeft: -4 },
  apertado: { opacity: 0.6 },
  ponto: { position: 'absolute', top: 10, right: 9, width: 8, height: 8, borderRadius: radius.pill, borderWidth: 2 },
  contexto: { flexDirection: 'row', alignItems: 'center', gap: space.sm - 2, marginTop: space.xs },
  pontoContexto: { width: 5, height: 5, borderRadius: radius.pill },
  filtros: { gap: space.sm, padding: space.lg, borderRadius: radius.md, marginHorizontal: recuo, marginTop: space.xs },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  vazio: { alignItems: 'center', gap: space.md },
  rodape: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
});
