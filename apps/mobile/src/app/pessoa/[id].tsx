import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useDoadores, useEstaSeguindo, usePessoa, useSeguir } from '../../api/consultas';
import { mensagemDeErro } from '../../api/erros';
import type { DoadoresCandidatura, PerfilPessoa } from '../../api/tipos';
import { capitalizar, dataSimples, inteiro, plural, reais } from '../../comum/formato';
import { Alternar } from '../../components/Alternar';
import { BotaoVoltar } from '../../components/BotaoVoltar';
import { Carregando, Falha } from '../../components/Estado';
import { FotoOficial } from '../../components/FotoOficial';
import { Dado, LinkTexto, Secao } from '../../components/Secao';
import { PerfilComLinhaDoTempo } from '../../perfis/LinhaDoTempo';
import { space, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const NOME_CASA = { camara: 'Câmara dos Deputados', senado: 'Senado Federal' } as const;

/** Perfil de pessoa: quem é, mandatos, partido, gastos, campanha e a linha do tempo por categoria. */
export default function PerfilDePessoa() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pessoa = usePessoa(id);

  if (pessoa.isPending) return <Carregando rotulo="Carregando o perfil" />;
  if (pessoa.isError) {
    return <Falha mensagem={mensagemDeErro(pessoa.error)} aoTentar={() => void pessoa.refetch()} />;
  }
  return (
    <PerfilComLinhaDoTempo
      alvo={{ tipo: 'pessoa', id }}
      categorias={pessoa.data.categorias}
      cabecalho={<Cabecalho p={pessoa.data} />}
    />
  );
}

function Cabecalho({ p }: { p: PerfilPessoa }) {
  const theme = useTheme();
  const router = useRouter();
  const seguir = useSeguir();
  const segue = useEstaSeguindo()({ tipo: 'pessoa', id: p.id });
  const mandato = p.mandatos.find((m) => m.emExercicio) ?? null;
  const resumo = [mandato?.cargo, mandato?.uf, p.partidoAtual?.sigla].filter(Boolean).join(' · ');

  return (
    <View style={styles.cabecalho}>
      <BotaoVoltar />
      <View style={styles.identidade}>
        <FotoOficial foto={p.foto} nome={p.nome} largura={72} />
        <View style={styles.nomes}>
          <Text role="heading" style={[typography.headline, { color: theme.ink }]}>
            {p.nome}
          </Text>
          {p.nomeCivil && p.nomeCivil.toLowerCase() !== p.nome.toLowerCase() ? (
            <Text style={[typography.caption, { color: theme.ink2 }]}>{capitalizar(p.nomeCivil)}</Text>
          ) : null}
          {resumo ? <Text style={[typography.label, { color: theme.ink }]}>{resumo}</Text> : null}
          {p.foto ? (
            <Text style={[typography.dataSmall, { color: theme.ink3 }]}>Foto: {p.foto.credito}</Text>
          ) : null}
        </View>
      </View>
      <Alternar
        rotulo="Seguir"
        rotuloMarcado="Seguindo"
        descricao={`Seguir ${p.nome}`}
        marcado={segue}
        aoAlternar={() =>
          seguir.mutate({ alvo: { tipo: 'pessoa', id: p.id }, seguir: !segue, nome: p.nome, detalhe: resumo })
        }
      />
      {seguir.isError ? (
        <Text style={[typography.body, { color: theme.error }]} aria-live="assertive">
          {mensagemDeErro(seguir.error)}
        </Text>
      ) : null}

      {p.mandatos.length ? (
        <Secao titulo="Mandatos">
          {p.mandatos.map((m) => (
            <Dado
              key={`${m.casa}:${m.legislatura}:${m.inicio}`}
              rotulo={`${m.cargo}${m.uf ? ` · ${m.uf}` : ''}`}
              detalhe={[
                NOME_CASA[m.casa],
                `${m.legislatura}ª legislatura`,
                m.condicao,
                m.inicio ? `desde ${dataSimples(m.inicio)}` : null,
                m.fim ? `até ${dataSimples(m.fim)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              valor={m.emExercicio ? 'EM EXERCÍCIO' : ''}
            />
          ))}
        </Secao>
      ) : null}

      {p.filiacoes.length ? (
        <Secao titulo="Partido">
          {p.filiacoes.slice(0, 6).map((f) => (
            <View key={`${f.sigla}:${f.desde}`} style={styles.filiacao}>
              {f.partidoId ? (
                <LinkTexto
                  rotulo={f.sigla}
                  descricao={`Partido ${f.sigla}`}
                  aoTocar={() => router.push({ pathname: '/partido/[id]', params: { id: f.partidoId as string } })}
                />
              ) : (
                <Text style={[typography.label, { color: theme.ink }]}>{f.sigla}</Text>
              )}
              <Text style={[typography.data, { color: theme.ink2 }]}>
                {f.desde ? dataSimples(f.desde) : '?'} – {f.ate ? dataSimples(f.ate) : 'hoje'}
              </Text>
            </View>
          ))}
        </Secao>
      ) : null}

      {p.gastos.length ? (
        <Secao titulo="Cota parlamentar">
          {p.gastos.map((g) => (
            <View key={`${g.casa}:${g.ano}`} style={styles.bloco}>
              <Dado
                rotulo={`${g.ano} · ${NOME_CASA[g.casa]}`}
                detalhe={plural(g.documentos, 'documento', 'documentos')}
                valor={reais(g.total)}
              />
              {g.categorias.map((c) => (
                <Dado key={c.categoria} rotulo={capitalizar(c.categoria.replace(/[.\s]+$/, ''))} valor={reais(c.total)} />
              ))}
            </View>
          ))}
        </Secao>
      ) : null}

      {p.anosDeCampanha.length ? <Campanha pessoaId={p.id} anos={p.anosDeCampanha} /> : null}

      {p.candidaturas.length ? (
        <Secao titulo="Candidaturas">
          {p.candidaturas.map((c) => (
            <Dado
              key={`${c.ano}:${c.turno}:${c.sqCandidato}`}
              rotulo={`${c.ano} · ${c.cargo ? capitalizar(c.cargo) : 'Cargo não informado'}${c.uf ? ` · ${c.uf}` : ''}`}
              detalhe={[
                c.partido.sigla,
                c.numero ? `nº ${c.numero}` : null,
                c.turno > 1 ? `${c.turno}º turno` : null,
                c.situacao ? capitalizar(c.situacao) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              valor={c.resultado ?? ''}
            />
          ))}
        </Secao>
      ) : null}
    </View>
  );
}

/** Quem financiou a campanha, exatamente como a API entrega: pessoa física só é nomeada acima do limite. */
function Campanha({ pessoaId, anos }: { pessoaId: string; anos: number[] }) {
  const theme = useTheme();
  const [ano, setAno] = useState(anos[0]);
  const doadores = useDoadores(pessoaId, ano);

  return (
    <Secao titulo="Quem financiou a campanha">
      {anos.length > 1 ? (
        <View style={styles.grade} role="radiogroup" aria-label="Eleição">
          {anos.map((a) => (
            <Alternar key={a} papel="radio" rotulo={String(a)} marcado={a === ano} aoAlternar={() => setAno(a)} />
          ))}
        </View>
      ) : null}
      {doadores.isPending ? (
        <Text style={[typography.caption, { color: theme.ink2 }]}>Carregando…</Text>
      ) : doadores.isError ? (
        <Text style={[typography.body, { color: theme.error }]}>{mensagemDeErro(doadores.error)}</Text>
      ) : (
        <>
          {doadores.data.candidaturas.length === 0 ? (
            <Text style={[typography.body, { color: theme.ink2 }]}>Nenhuma receita declarada nessa eleição.</Text>
          ) : null}
          {doadores.data.candidaturas.map((c) => (
            <Candidatura key={c.sqCandidato} c={c} limite={doadores.data.limiteNomePessoaFisica} />
          ))}
          <LinkTexto
            rotulo="Prestação de contas no TSE"
            descricao="Abre os arquivos de prestação de contas do Tribunal Superior Eleitoral"
            aoTocar={() => void Linking.openURL(doadores.data.fonte.url)}
          />
        </>
      )}
    </Secao>
  );
}

function Candidatura({ c, limite }: { c: DoadoresCandidatura; limite: number }) {
  const theme = useTheme();
  const { nomeadas, outras } = c.pessoasFisicas;
  return (
    <View style={styles.bloco}>
      <Dado
        rotulo={[c.cargo ? capitalizar(c.cargo) : null, c.uf, c.partido].filter(Boolean).join(' · ')}
        detalhe={plural(c.receitas, 'receita declarada', 'receitas declaradas')}
        valor={reais(c.total)}
      />
      <Text style={[typography.overline, styles.sub, { color: theme.ink3 }]}>Por origem</Text>
      {c.porOrigem.map((o) => (
        <Dado key={o.origem} rotulo={o.origem} detalhe={plural(o.receitas, 'receita', 'receitas')} valor={reais(o.total)} />
      ))}
      {c.comCnpj.length ? (
        <>
          <Text style={[typography.overline, styles.sub, { color: theme.ink3 }]}>Partidos e outras entidades</Text>
          {c.comCnpj.map((d) => (
            <Dado key={d.cnpj} rotulo={d.nome} valor={reais(d.total)} />
          ))}
        </>
      ) : null}
      {nomeadas.length || outras.doadores ? (
        <>
          <Text style={[typography.overline, styles.sub, { color: theme.ink3 }]}>Pessoas físicas</Text>
          {nomeadas.map((d) => (
            <Dado
              key={`${d.nome}:${d.total}`}
              rotulo={d.nome}
              detalhe={`${d.doacoes} ${d.doacoes === 1 ? 'doação' : 'doações'}`}
              valor={reais(d.total)}
            />
          ))}
          {outras.doadores ? (
            <Dado
              rotulo={outras.doadores === 1 ? 'Outra pessoa física' : `Outras ${inteiro(outras.doadores)} pessoas físicas`}
              detalhe={`Não nomeadas: até ${reais(limite)} cada, somado na candidatura.`}
              valor={reais(outras.total)}
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cabecalho: { gap: space.lg },
  identidade: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' },
  nomes: { flex: 1, gap: space.xxs },
  filiacao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  bloco: { gap: 0, paddingBottom: space.sm },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  sub: { paddingTop: space.md },
});
