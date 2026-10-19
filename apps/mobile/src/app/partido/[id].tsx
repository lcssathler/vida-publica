import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useEstaSeguindo, usePartido, useSeguir } from '../../api/consultas';
import { mensagemDeErro } from '../../api/erros';
import type { PerfilPartido } from '../../api/tipos';
import { capitalizar, plural, reais } from '../../comum/formato';
import { Alternar } from '../../components/Alternar';
import { BotaoVoltar } from '../../components/BotaoVoltar';
import { Carregando, Falha } from '../../components/Estado';
import { Dado, LinkTexto, Secao } from '../../components/Secao';
import { nomeEsfera, nomeFonteRepasse } from '../../feed/rotulos';
import { PerfilComLinhaDoTempo } from '../../perfis/LinhaDoTempo';
import { rules, space, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

/** Perfil de partido: história, parlamentares em exercício, repasses e a linha do tempo. */
export default function PerfilDePartido() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const partido = usePartido(id);

  if (partido.isPending) return <Carregando rotulo="Carregando o partido" />;
  if (partido.isError) {
    return <Falha mensagem={mensagemDeErro(partido.error)} aoTentar={() => void partido.refetch()} />;
  }
  return (
    <PerfilComLinhaDoTempo
      alvo={{ tipo: 'partido', id }}
      categorias={partido.data.categorias}
      cabecalho={<Cabecalho p={partido.data} />}
    />
  );
}

function Cabecalho({ p }: { p: PerfilPartido }) {
  const theme = useTheme();
  const router = useRouter();
  const seguir = useSeguir();
  const segue = useEstaSeguindo()({ tipo: 'partido', id: p.id });
  const abrirPartido = (id: string) => router.push({ pathname: '/partido/[id]', params: { id } });
  const senado = p.emExercicio.filter((e) => e.casa === 'senado');
  const camara = p.emExercicio.filter((e) => e.casa === 'camara');
  const periodo = [p.primeiroAno, p.ultimoAno].filter(Boolean).join('–');

  return (
    <View style={styles.cabecalho}>
      <BotaoVoltar />
      <View style={[styles.titulo, { borderBottomColor: theme.ink }]}>
        <Text style={[typography.overline, { color: theme.ink2 }]}>Partido · nº {p.numero}</Text>
        <Text role="heading" style={[typography.display, { color: theme.ink }]}>
          {p.sigla}
        </Text>
        {p.nome ? <Text style={[typography.body, { color: theme.ink }]}>{capitalizar(p.nome)}</Text> : null}
        {periodo ? (
          <Text style={[typography.data, { color: theme.ink2 }]}>Registros no TSE: {periodo}</Text>
        ) : null}
      </View>
      <Alternar
        rotulo="Seguir"
        rotuloMarcado="Seguindo"
        descricao={`Seguir o partido ${p.sigla}`}
        marcado={segue}
        aoAlternar={() =>
          seguir.mutate({ alvo: { tipo: 'partido', id: p.id }, seguir: !segue, nome: p.sigla, detalhe: p.nome })
        }
      />
      {seguir.isError ? (
        <Text style={[typography.body, { color: theme.error }]} aria-live="assertive">
          {mensagemDeErro(seguir.error)}
        </Text>
      ) : null}

      {p.sucessor || p.antecessores.length ? (
        <Secao titulo="História">
          {p.sucessor ? (
            <View style={styles.linha}>
              <Text style={[typography.body, { color: theme.ink2 }]}>
                {capitalizar(p.sucessor.tipo)}{p.sucessor.ano ? ` em ${p.sucessor.ano}` : ''}:
              </Text>
              <LinkTexto rotulo={p.sucessor.sigla} aoTocar={() => abrirPartido(p.sucessor!.id)} />
            </View>
          ) : null}
          {p.antecessores.map((a) => (
            <View key={a.id} style={styles.linha}>
              <Text style={[typography.body, { color: theme.ink2 }]}>
                Veio de ({a.tipo.toLowerCase()}{a.ano ? `, ${a.ano}` : ''}):
              </Text>
              <LinkTexto rotulo={a.sigla} aoTocar={() => abrirPartido(a.id)} />
            </View>
          ))}
        </Secao>
      ) : null}

      {p.emExercicio.length ? (
        <Secao titulo={`No Congresso hoje · ${p.emExercicio.length}`}>
          {[...senado, ...camara].map((e) => (
            <View key={e.id} style={[styles.parlamentar, { borderBottomColor: theme.rule }]}>
              <LinkTexto
                rotulo={e.nome}
                estilo="bodyStrong"
                descricao={`${e.nome}, ${e.cargo}${e.uf ? `, ${e.uf}` : ''}`}
                aoTocar={() => router.push({ pathname: '/pessoa/[id]', params: { id: e.id } })}
              />
              <Text style={[typography.caption, { color: theme.ink2 }]}>
                {e.cargo}
                {e.uf ? ` · ${e.uf}` : ''}
              </Text>
            </View>
          ))}
        </Secao>
      ) : null}

      {p.repasses.length ? (
        <Secao titulo="Repasses a candidatos">
          {p.repasses.map((r) => (
            <Dado
              key={`${r.ano}:${r.fonte}:${r.esfera}`}
              rotulo={`${r.ano} · ${nomeFonteRepasse(r.fonte)}`}
              detalhe={`${nomeEsfera(r.esfera)} · ${plural(r.repasses, 'repasse', 'repasses')} a ${plural(r.candidatos, 'candidatura', 'candidaturas')}`}
              valor={reais(r.total)}
            />
          ))}
        </Secao>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cabecalho: { gap: space.lg },
  titulo: { gap: space.xxs, paddingHorizontal: space.xs },
  linha: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  parlamentar: { paddingBottom: space.xs, borderBottomWidth: rules.hairline },
});
