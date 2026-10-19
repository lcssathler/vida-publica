import { useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEvento } from '../../api/consultas';
import { mensagemDeErro } from '../../api/erros';
import type { AlvoTipo } from '../../api/tipos';
import { dataCurta, diaIso, diaPorExtenso, hora } from '../../comum/formato';
import { Botao } from '../../components/Botao';
import { CarimboFonte } from '../../components/CarimboFonte';
import { Carregando, Falha } from '../../components/Estado';
import { FotoOficial } from '../../components/FotoOficial';
import { Icone } from '../../components/Icone';
import { LinkTexto, Secao } from '../../components/Secao';
import { ICONE_TIPO, fatosDoEvento, metaDaPessoa } from '../../feed/RegistroDoEvento';
import { NOME_TIPO, fonteDaUrl, protocolo } from '../../feed/rotulos';
import { rotaDoAlvo } from '../../perfis/rotas';
import { radius, rules, space, toque, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const ORDEM_ALVO: AlvoTipo[] = ['pessoa', 'partido', 'proposicao', 'assunto'];

const NOME_ALVO: Record<AlvoTipo, string> = {
  pessoa: 'Pessoa',
  partido: 'Partido',
  proposicao: 'Proposta',
  assunto: 'Assunto',
};

/**
 * Detalhe do registro, num painel que sobe de baixo: o fato, quem está
 * envolvido, a fonte oficial e a regra que o gerou.
 */
export default function DetalheDoEvento() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const evento = useEvento(id);
  const fechar = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (evento.isPending) return <Carregando rotulo="Carregando o registro" />;
  if (evento.isError) {
    return <Falha mensagem={mensagemDeErro(evento.error)} aoTentar={() => void evento.refetch()} />;
  }

  const e = evento.data;
  const fonte = fonteDaUrl(e.fonte.url);
  const quando = hora(e.ocorridoEm);
  const alvos = [...e.alvos].sort((a, b) => ORDEM_ALVO.indexOf(a.tipo) - ORDEM_ALVO.indexOf(b.tipo));
  const pessoa = e.alvos.find((a) => a.tipo === 'pessoa');
  const projeto = typeof e.payload.proposicao === 'string' ? e.payload.proposicao : null;
  const cor = { sim: theme.yes, nao: theme.no, neutro: theme.ink };
  const detalhes: { rotulo: string; valor: string; cor?: string; descricao?: string }[] = [
    {
      rotulo: 'Data',
      valor: `${dataCurta(e.ocorridoEm)}${quando ? ` · ${quando}` : ''}`,
      descricao: `Em ${diaPorExtenso(e.ocorridoEm)}${quando ? `, às ${quando}` : ''}`,
    },
    ...fatosDoEvento(e).map((f) => ({ rotulo: f.rotulo, valor: f.valor, cor: cor[f.sentido] })),
    { rotulo: 'Protocolo', valor: protocolo(e) },
  ];

  return (
    <ScrollView
      style={{ backgroundColor: theme.sheet }}
      contentContainerStyle={styles.conteudo}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.topo}>
        <View style={styles.tipo}>
          <Icone nome={ICONE_TIPO[e.tipo]} tamanho={14} cor={theme.accent} />
          <Text style={[typography.tipo, { color: theme.accent }]}>{NOME_TIPO[e.tipo]}</Text>
          {projeto ? <Text style={[typography.caption, { color: theme.ink3 }]}>· {projeto}</Text> : null}
        </View>
        <Pressable role="button" aria-label="Fechar" onPress={fechar} style={styles.fechar}>
          <View style={[styles.fecharCirculo, { backgroundColor: theme.voteBox }]}>
            <Icone nome="x" tamanho={16} cor={theme.ink} />
          </View>
        </Pressable>
      </View>

      <Text role="heading" style={[typography.display, { color: theme.ink }]}>
        {e.titulo}
      </Text>

      {pessoa ? (
        <View style={styles.pessoa}>
          <FotoOficial foto={pessoa.foto ?? null} nome={pessoa.nome} largura={48} />
          <View style={styles.pessoaTexto}>
            <Text style={[typography.bodyStrong, { color: theme.ink }]}>{pessoa.nome}</Text>
            {metaDaPessoa(e) ? <Text style={[typography.caption, { color: theme.ink2 }]}>{metaDaPessoa(e)}</Text> : null}
          </View>
        </View>
      ) : null}

      <View>
        {detalhes.map((d) => (
          <View
            key={d.rotulo}
            accessible
            aria-label={`${d.rotulo}: ${d.descricao ?? d.valor}`}
            style={[styles.linhaDetalhe, { borderBottomColor: theme.rule }]}
          >
            <Text style={[typography.body, styles.rotuloDetalhe, { color: theme.ink2 }]}>{d.rotulo}</Text>
            <Text style={[typography.bodyStrong, styles.valorDetalhe, { color: d.cor ?? theme.ink }]}>{d.valor}</Text>
          </View>
        ))}
      </View>

      {e.resumo ? <Text style={[typography.body, { color: theme.ink2 }]}>{e.resumo}</Text> : null}

      {e.erratas?.length ? (
        <View style={[styles.errata, { borderColor: theme.accent, backgroundColor: theme.accentWash }]}>
          <Text role="heading" style={[typography.overline, { color: theme.accent }]}>
            Errata
          </Text>
          {e.erratas.map((x) => (
            <View key={x.id} style={styles.itemErrata}>
              <Text style={[typography.bodyStrong, { color: theme.ink }]}>{x.titulo}</Text>
              <Text style={[typography.body, { color: theme.ink }]}>{x.texto}</Text>
              <Text style={[typography.caption, { color: theme.ink2 }]}>
                Publicada em {dataCurta(x.publicadaEm)}.
              </Text>
            </View>
          ))}
          <LinkTexto rotulo="Todas as erratas" aoTocar={() => router.push('/erratas')} />
        </View>
      ) : null}

      {alvos.length ? (
        <Secao titulo="Envolvidos">
          {alvos.map((a, i) => (
            <View
              key={`${a.tipo}:${a.id}`}
              style={[styles.alvo, i < alvos.length - 1 && { borderBottomWidth: rules.hairline, borderBottomColor: theme.line }]}
            >
              <Text style={[typography.overline, { color: theme.ink3 }]}>
                {[NOME_ALVO[a.tipo], a.papel].filter(Boolean).join(' · ')}
              </Text>
              {rotaDoAlvo(a) ? (
                <LinkTexto
                  rotulo={a.nome}
                  estilo="bodyStrong"
                  descricao={`${NOME_ALVO[a.tipo]}: ${a.nome}`}
                  aoTocar={() => router.push(rotaDoAlvo(a)!)}
                />
              ) : (
                <Text style={[typography.bodyStrong, { color: theme.ink }]}>{a.nome}</Text>
              )}
            </View>
          ))}
        </Secao>
      ) : null}

      <View style={[styles.fonte, { backgroundColor: theme.surface, boxShadow: theme.shadowCard }]}>
        <Text role="heading" style={[typography.overline, { color: theme.ink2 }]}>
          Fonte
        </Text>
        <CarimboFonte {...fonte} data={diaIso(e.fonte.dadoEm ?? e.fonte.coletadoEm)} />
        <Text style={[typography.body, { color: theme.ink }]}>{fonte.nome}</Text>
        <Text selectable style={[typography.dataSmall, { color: theme.ink2 }]}>
          {e.fonte.url}
        </Text>
        <Text style={[typography.caption, { color: theme.ink2 }]}>
          {e.fonte.dadoEm ? `Dado publicado pela fonte em ${dataCurta(e.fonte.dadoEm)}. ` : ''}
          Coletado pelo Vida Pública em {dataCurta(e.fonte.coletadoEm)}.
        </Text>
      </View>

      <Text style={[typography.caption, { color: theme.ink3 }]}>
        Registro gerado pela regra {e.tipo} v{e.regra.versao}
        {e.regra.descricao ? `: ${e.regra.descricao}` : '.'}
      </Text>

      <Botao
        rotulo="Abrir na fonte oficial"
        iconeFinal="external-link"
        dica={`Abre ${fonte.nome} no navegador`}
        aoTocar={() => void Linking.openURL(e.fonte.url)}
      />
      <LinkTexto
        rotulo="Reportar erro"
        descricao="Reportar erro neste registro"
        aoTocar={() => router.push({ pathname: '/reportar/[id]', params: { id: e.id } })}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  conteudo: { paddingHorizontal: space.xxl, paddingTop: space.lg, paddingBottom: space.huge, gap: space.lg },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  tipo: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs + 2, flexShrink: 1 },
  fechar: { width: toque.minimo, height: toque.minimo, minHeight: toque.minimo, alignItems: 'center', justifyContent: 'center', marginRight: -space.sm },
  fecharCirculo: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  pessoa: { flexDirection: 'row', alignItems: 'center', gap: space.md + 1 },
  pessoaTexto: { flex: 1, gap: space.xs },
  linhaDetalhe: { flexDirection: 'row', justifyContent: 'space-between', gap: space.xl, paddingVertical: space.md, borderBottomWidth: rules.hairline },
  rotuloDetalhe: { fontSize: 14 },
  valorDetalhe: { fontSize: 14, textAlign: 'right', flexShrink: 1 },
  alvo: { paddingVertical: space.sm, gap: space.xxs },
  fonte: { gap: space.sm, padding: space.md + 2, borderRadius: radius.card },
  errata: { gap: space.sm, padding: space.md + 2, borderWidth: 1, borderRadius: radius.card },
  itemErrata: { gap: space.xxs },
});
