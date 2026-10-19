import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEventosDoPerfil } from '../api/consultas';
import { mensagemDeErro } from '../api/erros';
import type { CategoriaPerfil, ContagemCategoria } from '../api/tipos';
import { inteiro } from '../comum/formato';
import { AbaTexto, FaixaDeAbas } from '../components/AbaTexto';
import { Botao } from '../components/Botao';
import { Vazio } from '../components/Estado';
import { CabecalhoDeDia } from '../components/Marcos';
import { montarLinhas, type Linha } from '../feed/linhas';
import { RegistroDoEvento } from '../feed/RegistroDoEvento';
import { CATEGORIAS } from '../feed/rotulos';
import { AvisoSemConexao } from '../offline/AvisoSemConexao';
import { space, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export interface LinhaDoTempoProps {
  alvo: { tipo: 'pessoa' | 'partido'; id: string };
  categorias: ContagemCategoria[];
  /** Dados do perfil, acima da linha do tempo. */
  cabecalho: ReactElement;
}

/**
 * Tela de perfil: os dados no alto e, abaixo, a linha do tempo com os eventos
 * do perfil, filtrada por categoria (as contagens vêm da API, com as mesmas
 * regras de visibilidade do feed).
 */
export function PerfilComLinhaDoTempo({ alvo, categorias, cabecalho }: LinhaDoTempoProps) {
  const theme = useTheme();
  const router = useRouter();
  const [categoria, setCategoria] = useState<CategoriaPerfil | null>(null);
  const eventos = useEventosDoPerfil(alvo.tipo, alvo.id, categoria);
  const lista = useMemo(() => eventos.data?.pages.flatMap((p) => p.itens) ?? [], [eventos.data]);
  const linhas = useMemo(() => montarLinhas(lista, null), [lista]);
  const total = categorias.reduce((soma, c) => soma + c.eventos, 0);
  const comEventos = categorias.filter((c) => c.eventos > 0);

  const seletor = (
    <View style={styles.cabecalho}>
      <AvisoSemConexao />
      {cabecalho}
      <Text role="heading" style={[typography.headline, styles.tituloLinha, { color: theme.ink }]}>
        Linha do tempo
      </Text>
      {comEventos.length ? (
        <FaixaDeAbas rotulo="Categoria" papel="radiogroup">
          <AbaTexto
            rotulo="Tudo"
            contagem={inteiro(total)}
            descricao={`Tudo, ${total} registros`}
            marcada={categoria === null}
            aoTocar={() => setCategoria(null)}
          />
          {comEventos.map((c) => (
            <AbaTexto
              key={c.categoria}
              rotulo={CATEGORIAS[c.categoria].nome}
              contagem={inteiro(c.eventos)}
              descricao={`${CATEGORIAS[c.categoria].nome}, ${c.eventos} registros`}
              marcada={categoria === c.categoria}
              aoTocar={() => setCategoria(c.categoria)}
            />
          ))}
        </FaixaDeAbas>
      ) : null}
    </View>
  );

  const renderizar = ({ item }: { item: Linha }) => {
    if (item.tipo === 'dia') return <CabecalhoDeDia iso={item.iso} />;
    if (item.tipo === 'parou') return null;
    return (
      <RegistroDoEvento
        evento={item.evento}
        aoTocar={() => router.push({ pathname: '/evento/[id]', params: { id: item.evento.id } })}
      />
    );
  };

  const rodape = () => {
    if (eventos.isPending || eventos.isFetchingNextPage) {
      return (
        <View style={styles.rodape} role="progressbar" aria-label="Carregando registros">
          <ActivityIndicator color={theme.accent} />
        </View>
      );
    }
    if (eventos.isError) {
      return (
        <View style={styles.rodape}>
          <Text style={[typography.body, { color: theme.error }]}>{mensagemDeErro(eventos.error)}</Text>
          <Botao
            variante="secundario"
            rotulo="Tentar de novo"
            aoTocar={() => void (eventos.data ? eventos.fetchNextPage() : eventos.refetch())}
          />
        </View>
      );
    }
    if (lista.length === 0) return <Vazio mensagem="Nenhum registro publicado ainda." />;
    if (!eventos.hasNextPage) {
      return (
        <View style={styles.rodape}>
          <Text style={[typography.dataSmall, { color: theme.ink3 }]}>FIM DOS REGISTROS</Text>
        </View>
      );
    }
    return null;
  };

  return (
    <SafeAreaView style={[styles.tela, { backgroundColor: theme.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <FlatList
        testID="linha-do-tempo"
        data={linhas}
        keyExtractor={(l) => l.chave}
        renderItem={renderizar}
        ListHeaderComponent={seletor}
        ListFooterComponent={rodape}
        contentContainerStyle={styles.conteudo}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (eventos.hasNextPage && !eventos.isFetchingNextPage && !eventos.isError) void eventos.fetchNextPage();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { paddingBottom: space.xxl },
  cabecalho: { gap: space.lg, paddingTop: space.md, paddingHorizontal: space.lg },
  tituloLinha: { paddingHorizontal: space.xs, marginTop: space.sm },
  rodape: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
});
