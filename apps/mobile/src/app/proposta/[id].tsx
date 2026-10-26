import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { FlatList, Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEstaSeguindo, useProposta, useSeguir } from '../../api/consultas';
import { mensagemDeErro } from '../../api/erros';
import type { ItemLinhaDoTempo, Proposta } from '../../api/tipos';
import { dataCurta, dataSimples, diaPorExtenso, hora } from '../../comum/formato';
import { Alternar } from '../../components/Alternar';
import { Botao } from '../../components/Botao';
import { BarraVoltar } from '../../components/BotaoVoltar';
import { EstadoComVolta, Vazio } from '../../components/Estado';
import { Icone } from '../../components/Icone';
import { LinkTexto, Secao } from '../../components/Secao';
import { NOME_TIPO } from '../../feed/rotulos';
import { situacaoMudou } from '../../propostas/linha';
import { resultadoDaVotacao } from '../../propostas/resultado';
import { AvisoSemConexao } from '../../offline/AvisoSemConexao';
import { Placar } from '../../propostas/Placar';
import { radius, space, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const NOME_CASA = { camara: 'Câmara', senado: 'Senado' } as const;

/** Proposta: dados, autores, temas e a linha do tempo (tramitações, votações e eventos). */
export default function DetalheDaProposta() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const proposta = useProposta(id);

  if (proposta.isPending) return <EstadoComVolta carregando="Carregando a proposta" />;
  if (proposta.isError) {
    return <EstadoComVolta mensagem={mensagemDeErro(proposta.error)} aoTentar={() => void proposta.refetch()} />;
  }

  const itens = proposta.data.linhaDoTempo;
  return (
    <SafeAreaView style={[styles.tela, { backgroundColor: theme.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <FlatList
        testID="linha-da-proposta"
        data={itens}
        keyExtractor={(item, i) => `${item.tipo}:${i}`}
        renderItem={({ item, index }) => (
          <ItemDaLinha item={item} ultimo={index === itens.length - 1} situacaoMudou={situacaoMudou(itens, index)} />
        )}
        ListHeaderComponent={<Cabecalho p={proposta.data} />}
        ListEmptyComponent={<Vazio mensagem="Nenhuma etapa registrada." />}
        contentContainerStyle={styles.conteudo}
        initialNumToRender={15}
      />
    </SafeAreaView>
  );
}

function Cabecalho({ p }: { p: Proposta }) {
  const theme = useTheme();
  const router = useRouter();
  const seguir = useSeguir();
  const segue = useEstaSeguindo()({ tipo: 'proposicao', id: p.id });

  return (
    <View style={styles.cabecalho}>
      <BarraVoltar
        acao={
          <Alternar
            rotulo="Seguir"
            rotuloMarcado="Seguindo"
            descricao={`Seguir ${p.identificacao}`}
            marcado={segue}
            aoAlternar={() =>
              seguir.mutate({ alvo: { tipo: 'proposicao', id: p.id }, seguir: !segue, nome: p.identificacao, detalhe: p.ementa })
            }
          />
        }
      />
      <AvisoSemConexao />
      <View style={styles.titulo}>
        <Text style={[typography.tipo, { color: theme.accent }]}>
          {[NOME_CASA[p.casa], p.descricaoTipo].filter(Boolean).join(' · ')}
        </Text>
        <Text role="heading" style={[typography.display, { color: theme.ink }]}>
          {p.identificacao}
        </Text>
        {p.apelido ? <Text style={[typography.title, { color: theme.ink }]}>{p.apelido}</Text> : null}
      </View>
      {p.ementa ? <Text style={[typography.body, { color: theme.ink2 }]}>{p.ementa}</Text> : null}
      {seguir.isError ? (
        <Text style={[typography.body, { color: theme.error }]} aria-live="assertive">
          {mensagemDeErro(seguir.error)}
        </Text>
      ) : null}

      <Secao titulo="Situação">
        <View accessible style={styles.situacao}>
          <Text style={[typography.bodyStrong, { color: theme.ink }]}>{p.situacao ?? 'Não informada'}</Text>
          <Text style={[typography.caption, { color: theme.ink2 }]}>
            {[
              p.situacaoEm ? `desde ${dataSimples(p.situacaoEm)}` : null,
              p.orgao ? `órgão: ${p.orgao}` : null,
              p.regime ? `regime: ${p.regime}` : null,
              p.apresentadaEm ? `apresentada em ${dataSimples(p.apresentadaEm)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        {p.principal ? (
          <View style={styles.linha}>
            <Text style={[typography.body, { color: theme.ink2 }]}>Tramita junto com</Text>
            <LinkTexto
              rotulo={p.principal.identificacao}
              aoTocar={() => router.push({ pathname: '/proposta/[id]', params: { id: p.principal!.id } })}
            />
          </View>
        ) : null}
      </Secao>

      {p.autores.length ? (
        <Secao titulo={p.autores.length === 1 ? 'Autor' : `Autores · ${p.autores.length}`}>
          {p.autores.map((a, i) => (
            <View key={`${a.nome}:${i}`} style={styles.autor}>
              {a.pessoa ? (
                <LinkTexto
                  rotulo={a.pessoa.nome}
                  estilo="bodyStrong"
                  aoTocar={() => router.push({ pathname: '/pessoa/[id]', params: { id: a.pessoa!.id } })}
                />
              ) : (
                <Text style={[typography.bodyStrong, { color: theme.ink }]}>{a.nome}</Text>
              )}
              {a.tipo ? <Text style={[typography.caption, { color: theme.ink2 }]}>{a.tipo}</Text> : null}
            </View>
          ))}
        </Secao>
      ) : null}

      {p.temas.length ? (
        <Secao titulo="Temas">
          <Text style={[typography.body, { color: theme.ink }]}>{p.temas.join(' · ')}</Text>
        </Secao>
      ) : null}

      <View style={styles.linha}>
        {p.urlInteiroTeor ? (
          <Botao variante="texto" icone="file-text" rotulo="Inteiro teor" estilo={styles.link} dica="Abre o texto da proposta no site da Casa" aoTocar={() => void Linking.openURL(p.urlInteiroTeor!)} />
        ) : null}
        <Botao variante="texto" icone="external-link" rotulo="Fonte oficial" estilo={styles.link} dica="Abre os dados abertos da proposta" aoTocar={() => void Linking.openURL(p.fonte.url)} />
      </View>

      <View style={styles.tituloLinha}>
        <Text role="heading" style={[typography.dia, { color: theme.ink }]}>
          Linha do tempo.
        </Text>
        <Text style={[typography.caption, { color: theme.ink2 }]}>Da etapa mais recente à mais antiga</Text>
      </View>
    </View>
  );
}

const ROTULO_ITEM = { tramitacao: 'Tramitação', votacao: 'Votação', evento: 'Registro' } as const;

function ItemDaLinha({
  item,
  ultimo,
  situacaoMudou: mudou,
}: {
  item: ItemLinhaDoTempo;
  ultimo: boolean;
  situacaoMudou: boolean;
}) {
  const theme = useTheme();
  const router = useRouter();
  const quando = hora(item.data);
  const abrirEvento = (id: string) => router.push({ pathname: '/evento/[id]', params: { id } });

  let sobre: string;
  let corpo: ReactNode;
  if (item.tipo === 'tramitacao') {
    sobre = [ROTULO_ITEM.tramitacao, item.orgao].filter(Boolean).join(' · ');
    corpo = (
      <>
        <Text style={[typography.bodyStrong, { color: theme.ink }]}>{item.descricao}</Text>
        {item.despacho ? <Text style={[typography.body, { color: theme.ink2 }]}>{item.despacho}</Text> : null}
        {mudou ? (
          <Text style={[typography.caption, { color: theme.ink2 }]}>Situação passa a ser: {item.situacao}</Text>
        ) : null}
        <View style={styles.linha}>
          {item.url ? <LinkTexto rotulo="Documento" descricao="Abre o documento da etapa" aoTocar={() => void Linking.openURL(item.url!)} /> : null}
          {item.eventoId ? <LinkTexto rotulo="Ver registro" descricao="Abre o registro desta etapa no feed" aoTocar={() => abrirEvento(item.eventoId!)} /> : null}
        </View>
      </>
    );
  } else if (item.tipo === 'votacao') {
    sobre = [ROTULO_ITEM.votacao, item.orgao, item.nominal ? 'nominal' : 'simbólica'].filter(Boolean).join(' · ');
    corpo = (
      <>
        {item.aprovada === null || item.aprovada === undefined ? (
          <Text style={[typography.bodyStrong, { color: theme.ink }]}>Resultado não informado</Text>
        ) : (
          <View style={styles.resultado}>
            <Icone
              nome={item.aprovada ? 'check-circle' : 'x-circle'}
              tamanho={18}
              cor={item.aprovada ? theme.yes : theme.no}
            />
            <Text style={[typography.bodyStrong, { color: item.aprovada ? theme.yes : theme.no }]}>
              {(() => {
                const resultado = resultadoDaVotacao(item.aprovada, item.descricao);
                return `${resultado.rotulo}: ${resultado.valor.toLowerCase()}`;
              })()}
            </Text>
          </View>
        )}
        {item.descricao ? <Text style={[typography.body, { color: theme.ink2 }]}>{item.descricao}</Text> : null}
        {item.placar ? <Placar placar={item.placar} /> : null}
        <LinkTexto rotulo="Fonte da votação" descricao="Abre a votação nos dados abertos" aoTocar={() => void Linking.openURL(item.fonte.url)} />
      </>
    );
  } else {
    sobre = NOME_TIPO[item.evento.tipo];
    corpo = (
      <>
        <Text style={[typography.bodyStrong, { color: theme.ink }]}>{item.evento.titulo}</Text>
        {item.evento.resumo ? (
          <Text style={[typography.body, { color: theme.ink2 }]} numberOfLines={3}>
            {item.evento.resumo}
          </Text>
        ) : null}
        <LinkTexto rotulo="Ver registro" descricao="Abre o registro com a fonte" aoTocar={() => abrirEvento(item.evento.id)} />
      </>
    );
  }

  return (
    <View style={styles.item}>
      <View style={styles.trilho}>
        <View style={[styles.marca, { borderColor: theme.accent, backgroundColor: item.tipo === 'votacao' ? theme.accent : theme.background }]} />
        {!ultimo ? <View style={[styles.fio, { backgroundColor: theme.rule }]} /> : null}
      </View>
      <View style={styles.conteudoItem}>
        <Text
          style={[typography.dataSmall, { color: theme.ink3 }]}
          aria-label={`${diaPorExtenso(item.data)}${quando ? `, ${quando}` : ''}`}
        >
          {dataCurta(item.data)}
          {quando ? ` · ${quando}` : ''}
        </Text>
        <Text style={[typography.tipo, { color: theme.accent }]}>{sobre}</Text>
        {corpo}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { paddingHorizontal: space.xl, paddingBottom: space.xxl },
  cabecalho: { gap: space.lg, paddingBottom: space.md },
  titulo: { gap: space.xs + 2 },
  link: { paddingHorizontal: 0 },
  resultado: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  situacao: { gap: space.xxs, paddingVertical: space.xs },
  linha: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md },
  autor: { gap: 0 },
  tituloLinha: { gap: space.xs, paddingTop: space.sm },
  item: { flexDirection: 'row', gap: space.md },
  trilho: { width: 12, alignItems: 'center' },
  marca: { width: 10, height: 10, borderWidth: 1.5, borderRadius: radius.pill, marginTop: space.lg },
  fio: { flex: 1, width: 1 },
  conteudoItem: { flex: 1, gap: space.xs, paddingVertical: space.md },
});
