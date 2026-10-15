import { useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useEvento } from '../../api/consultas';
import { mensagemDeErro } from '../../api/erros';
import type { AlvoTipo } from '../../api/tipos';
import { dataCurta, diaIso, diaPorExtenso, hora, reais } from '../../comum/formato';
import { Botao } from '../../components/Botao';
import { CarimboFonte } from '../../components/CarimboFonte';
import { Carregando, Falha } from '../../components/Estado';
import { LinkTexto } from '../../components/Secao';
import { Tela } from '../../components/Tela';
import { rotaDoAlvo } from '../../perfis/rotas';
import { NOME_TIPO, fonteDaUrl, protocolo } from '../../feed/rotulos';
import { rules, space, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const ORDEM_ALVO: AlvoTipo[] = ['pessoa', 'partido', 'proposicao', 'assunto'];

const NOME_ALVO: Record<AlvoTipo, string> = {
  pessoa: 'Pessoa',
  partido: 'Partido',
  proposicao: 'Proposta',
  assunto: 'Assunto',
};

/** Detalhe do registro: o fato, quem está envolvido, a fonte oficial e a regra que o gerou. */
export default function DetalheDoEvento() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const evento = useEvento(id);

  if (evento.isPending) return <Carregando rotulo="Carregando o registro" />;
  if (evento.isError) {
    return <Falha mensagem={mensagemDeErro(evento.error)} aoTentar={() => void evento.refetch()} />;
  }

  const e = evento.data;
  const fonte = fonteDaUrl(e.fonte.url);
  const quando = hora(e.ocorridoEm);
  const alvos = [...e.alvos].sort((a, b) => ORDEM_ALVO.indexOf(a.tipo) - ORDEM_ALVO.indexOf(b.tipo));

  return (
    <Tela
      sobretitulo={`${NOME_TIPO[e.tipo]} · Nº ${protocolo(e)}`}
      titulo={e.titulo}
      rodape={
        <>
          <Botao rotulo="Voltar" variante="texto" aoTocar={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          <Botao
            rotulo="Abrir na fonte oficial"
            dica={`Abre ${fonte.nome} no navegador`}
            aoTocar={() => void Linking.openURL(e.fonte.url)}
          />
        </>
      }
    >
      <Text style={[typography.data, { color: theme.ink2 }]} aria-label={`Em ${diaPorExtenso(e.ocorridoEm)}${quando ? `, às ${quando}` : ''}`}>
        {dataCurta(e.ocorridoEm)}
        {quando ? ` · ${quando}` : ''}
      </Text>

      {e.valor !== null ? (
        <Text style={[typography.dataLarge, { color: theme.ink }]}>{reais(e.valor)}</Text>
      ) : null}

      {e.resumo ? <Text style={[typography.body, { color: theme.ink }]}>{e.resumo}</Text> : null}

      {e.erratas?.length ? (
        <View style={[styles.errata, { borderColor: theme.stamp, backgroundColor: theme.stampWash }]}>
          <Text role="heading" style={[typography.overline, { color: theme.stamp }]}>
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
        <View>
          <Text role="heading" style={[typography.overline, styles.secao, { color: theme.ink2 }]}>
            Envolvidos
          </Text>
          {alvos.map((a) => (
            <View key={`${a.tipo}:${a.id}`} style={[styles.alvo, { borderBottomColor: theme.rule }]}>
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
        </View>
      ) : null}

      <View style={[styles.fonte, { borderColor: theme.stamp }]}>
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

      <Text style={[typography.caption, { color: theme.ink2 }]}>
        Registro gerado pela regra {e.tipo} v{e.regra.versao}
        {e.regra.descricao ? `: ${e.regra.descricao}` : '.'}
      </Text>

      <LinkTexto
        rotulo="Reportar erro"
        descricao="Reportar erro neste registro"
        aoTocar={() => router.push({ pathname: '/reportar/[id]', params: { id: e.id } })}
      />
    </Tela>
  );
}

const styles = StyleSheet.create({
  secao: { paddingBottom: space.xs },
  alvo: { paddingVertical: space.sm, gap: space.xxs, borderBottomWidth: rules.hairline },
  fonte: { gap: space.sm, padding: space.md, borderWidth: 1, borderRadius: 2 },
  errata: { gap: space.sm, padding: space.md, borderWidth: 1, borderRadius: 2 },
  itemErrata: { gap: space.xxs },
});
