import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useEstaSeguindo, usePartido, useSeguir } from '../../api/consultas';
import { mensagemDeErro } from '../../api/erros';
import type { PerfilPartido } from '../../api/tipos';
import { capitalizar, plural, reais } from '../../comum/formato';
import { Alternar } from '../../components/Alternar';
import { Detalhes } from '../../components/Detalhes';
import { BarraVoltar } from '../../components/BotaoVoltar';
import { EstadoComVolta } from '../../components/Estado';
import { Dado, LinkTexto, Secao } from '../../components/Secao';
import { nomeEsfera, nomeFonteRepasse } from '../../feed/rotulos';
import { PerfilComLinhaDoTempo } from '../../perfis/LinhaDoTempo';
import { radius, rules, space, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

/** Perfil de partido: história, parlamentares em exercício, repasses e a linha do tempo. */
export default function PerfilDePartido() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const partido = usePartido(id);

  if (partido.isPending) return <EstadoComVolta carregando="Carregando o partido" />;
  if (partido.isError) {
    return <EstadoComVolta mensagem={mensagemDeErro(partido.error)} aoTentar={() => void partido.refetch()} />;
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
      <BarraVoltar
        acao={
          <Alternar
            rotulo="Seguir"
            rotuloMarcado="Seguindo"
            descricao={`Seguir o partido ${p.sigla}`}
            marcado={segue}
            aoAlternar={() =>
              seguir.mutate({ alvo: { tipo: 'partido', id: p.id }, seguir: !segue, nome: p.sigla, detalhe: p.nome })
            }
          />
        }
      />
      <View style={styles.identidade}>
        <View style={[styles.sigla, { backgroundColor: theme.voteBox, borderColor: theme.line }]} aria-hidden>
          <Text style={[typography.dia, { color: theme.ink }]} numberOfLines={1} adjustsFontSizeToFit>
            {p.sigla}
          </Text>
        </View>
        <View style={styles.titulo}>
          <Text style={[typography.tipo, { color: theme.accent }]}>Partido · nº {p.numero}</Text>
          <Text role="heading" style={[typography.display, { color: theme.ink }]}>
            {p.sigla}
          </Text>
        </View>
      </View>
      {p.nome ? <Text style={[typography.body, { color: theme.ink }]}>{capitalizar(p.nome)}</Text> : null}
      {periodo ? (
        <Text style={[typography.caption, { color: theme.ink2 }]}>Registros no TSE: {periodo}</Text>
      ) : null}
      {seguir.isError ? (
        <Text style={[typography.body, { color: theme.error }]} aria-live="assertive">
          {mensagemDeErro(seguir.error)}
        </Text>
      ) : null}

      <Detalhes titulo="História, parlamentares e repasses">
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
            <View key={e.id} style={[styles.parlamentar, { borderBottomColor: theme.line }]}>
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
      </Detalhes>
    </View>
  );
}

const styles = StyleSheet.create({
  cabecalho: { gap: space.lg },
  identidade: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  sigla: { width: 64, height: 64, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: space.xs },
  titulo: { flex: 1, gap: space.xs },
  linha: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  parlamentar: { paddingBottom: space.xs, borderBottomWidth: rules.hairline },
});
