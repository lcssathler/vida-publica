import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useAssuntos, useBusca, useParlamentares } from '../../api/consultas';
import { mensagemDeErro } from '../../api/erros';
import type { GrupoBusca, ResultadoBusca } from '../../api/tipos';
import { inteiro, plural } from '../../comum/formato';
import { useAtrasado } from '../../comum/useAtrasado';
import { Botao } from '../../components/Botao';
import { Vazio } from '../../components/Estado';
import { LinhaDeAlvo } from '../../components/LinhaDeAlvo';
import { Secao } from '../../components/Secao';
import { Tela } from '../../components/Tela';
import { NOME_ESTADO } from '../../onboarding/estados';
import { useSessao } from '../../sessao/Sessao';
import { radius, space, toque, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const NOME_GRUPO: Record<GrupoBusca, string> = {
  pessoa: 'Pessoas',
  partido: 'Partidos',
  proposicao: 'Propostas',
  assunto: 'Assuntos',
};

/** Itens por grupo quando a busca traz todos os grupos (a API devolve até 5). */
const POR_GRUPO = 5;

export default function Busca() {
  const theme = useTheme();
  const [texto, setTexto] = useState('');
  const [grupo, setGrupo] = useState<GrupoBusca | null>(null);
  const termo = useAtrasado(texto);
  const busca = useBusca(termo, grupo);
  const buscando = termo.trim().length >= 2;

  return (
    <Tela comBarra titulo="Busca" descricao="Pessoas, partidos, propostas e assuntos. Sem acento também acha.">
      <TextInput
        value={texto}
        onChangeText={(t) => {
          setTexto(t);
          setGrupo(null);
        }}
        placeholder="Nome, sigla, PL 1234/2025, tema…"
        placeholderTextColor={theme.ink3}
        aria-label="Buscar"
        accessibilityHint="Os resultados aparecem enquanto você digita"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={[
          typography.body,
          styles.campo,
          { color: theme.ink, borderColor: theme.rule, backgroundColor: theme.surface },
        ]}
      />
      {texto.trim().length === 1 ? (
        <Text style={[typography.caption, { color: theme.ink2 }]}>Digite ao menos 2 letras.</Text>
      ) : null}

      {!buscando ? (
        <Explorar />
      ) : busca.isError ? (
        <View style={styles.erro} aria-live="polite">
          <Text style={[typography.body, { color: theme.error }]}>{mensagemDeErro(busca.error)}</Text>
          <Botao variante="secundario" rotulo="Tentar de novo" aoTocar={() => void busca.refetch()} />
        </View>
      ) : !busca.data ? (
        <Text style={[typography.caption, { color: theme.ink2 }]} aria-live="polite">
          Buscando…
        </Text>
      ) : (
        <Resultados r={busca.data} grupo={grupo} aoEscolherGrupo={setGrupo} />
      )}
    </Tela>
  );
}

function Resultados({
  r,
  grupo,
  aoEscolherGrupo,
}: {
  r: ResultadoBusca;
  grupo: GrupoBusca | null;
  aoEscolherGrupo: (g: GrupoBusca | null) => void;
}) {
  const theme = useTheme();
  const total = r.pessoas.length + r.partidos.length + r.propostas.length + r.assuntos.length;
  if (total === 0) return <Vazio mensagem={`Nada encontrado para "${r.q}".`} />;

  const verMais = (g: GrupoBusca, quantos: number) =>
    !grupo && quantos >= POR_GRUPO ? (
      <Botao variante="texto" rotulo={`Ver mais ${NOME_GRUPO[g].toLowerCase()}`} aoTocar={() => aoEscolherGrupo(g)} estilo={styles.verMais} />
    ) : null;

  return (
    <View style={styles.resultados}>
      <Text style={[typography.caption, { color: theme.ink2 }]} aria-live="polite">
        {plural(total, 'resultado', 'resultados')}
        {grupo ? ` em ${NOME_GRUPO[grupo].toLowerCase()}` : ''}
      </Text>
      {grupo ? <Botao variante="texto" rotulo="Voltar a todos os grupos" aoTocar={() => aoEscolherGrupo(null)} estilo={styles.verMais} /> : null}
      {r.pessoas.length ? (
        <Secao titulo={NOME_GRUPO.pessoa}>
          {r.pessoas.map((p) => (
            <LinhaDeAlvo key={p.id} alvo={{ tipo: 'pessoa', id: p.id }} nome={p.nome} detalhe={p.detalhe} />
          ))}
          {verMais('pessoa', r.pessoas.length)}
        </Secao>
      ) : null}
      {r.partidos.length ? (
        <Secao titulo={NOME_GRUPO.partido}>
          {r.partidos.map((p) => (
            <LinhaDeAlvo
              key={p.id}
              alvo={{ tipo: 'partido', id: p.id }}
              nome={p.sigla}
              detalhe={[p.nome, p.sucessor ? `hoje ${p.sucessor.sigla}` : null].filter(Boolean).join(' · ')}
            />
          ))}
          {verMais('partido', r.partidos.length)}
        </Secao>
      ) : null}
      {r.propostas.length ? (
        <Secao titulo={NOME_GRUPO.proposicao}>
          {r.propostas.map((p) => (
            <LinhaDeAlvo
              key={p.id}
              alvo={{ tipo: 'proposicao', id: p.id }}
              nome={p.identificacao}
              detalhe={[p.situacao, p.ementa].filter(Boolean).join(' · ')}
            />
          ))}
          {verMais('proposicao', r.propostas.length)}
        </Secao>
      ) : null}
      {r.assuntos.length ? (
        <Secao titulo={NOME_GRUPO.assunto}>
          {r.assuntos.map((a) => (
            <LinhaDeAlvo
              key={a.nome}
              alvo={{ tipo: 'assunto', id: a.nome }}
              nome={a.nome}
              detalhe={plural(a.proposicoes, 'proposta', 'propostas')}
            />
          ))}
          {verMais('assunto', r.assuntos.length)}
        </Secao>
      ) : null}
    </View>
  );
}

/** Sem busca: quem representa o estado e os assuntos com mais propostas. */
function Explorar() {
  const theme = useTheme();
  const { local } = useSessao();
  const parlamentares = useParlamentares(local.uf);
  const assuntos = useAssuntos();
  const [todos, setTodos] = useState(false);
  const lista = parlamentares.data ?? [];
  const mostrados = todos ? lista : lista.slice(0, 6);
  const maiores = [...(assuntos.data ?? [])].sort((a, b) => b.proposicoes - a.proposicoes).slice(0, 12);

  return (
    <View style={styles.resultados}>
      {local.uf ? (
        <Secao titulo={`Quem representa ${NOME_ESTADO[local.uf]}`}>
          {parlamentares.isError ? (
            <Text style={[typography.body, { color: theme.error }]}>{mensagemDeErro(parlamentares.error)}</Text>
          ) : null}
          {mostrados.map((p) => (
            <LinhaDeAlvo
              key={p.id}
              alvo={{ tipo: 'pessoa', id: p.id }}
              nome={p.nome}
              detalhe={[p.cargo, p.partido].filter(Boolean).join(' · ')}
            />
          ))}
          {!todos && lista.length > mostrados.length ? (
            <Botao
              variante="texto"
              rotulo={`Ver todos os ${inteiro(lista.length)}`}
              aoTocar={() => setTodos(true)}
              estilo={styles.verMais}
            />
          ) : null}
        </Secao>
      ) : null}
      {maiores.length ? (
        <Secao titulo="Assuntos com mais propostas">
          {maiores.map((a) => (
            <LinhaDeAlvo
              key={a.nome}
              alvo={{ tipo: 'assunto', id: a.nome }}
              nome={a.nome}
              detalhe={plural(a.proposicoes, 'proposta', 'propostas')}
            />
          ))}
        </Secao>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  campo: {
    minHeight: toque.minimo,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
  },
  resultados: { gap: space.xl },
  erro: { gap: space.sm, alignItems: 'flex-start' },
  verMais: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
