import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { Foto } from '../api/tipos';
import { radius, recuo, rules, space, toque, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { CarimboFonte, type CarimboFonteProps } from './CarimboFonte';
import { FotoOficial } from './FotoOficial';
import { Icone, type NomeIcone } from './Icone';

/** Um dado da caixa de voto: rótulo acima, valor abaixo. */
export interface Fato {
  rotulo: string;
  valor: string;
  /** sim: verde (Sim, aprovado); nao: vermelho (Não, rejeitado); neutro: valores. */
  sentido: 'sim' | 'nao' | 'neutro';
  icone?: NomeIcone;
}

export interface RegistroProps {
  /** Tipo e assunto, lidos pelo leitor de tela, ex.: "Votação nominal · Trabalho e Emprego". */
  tipo: string;
  /** Nome curto do tipo, no alto em caixa alta. Padrão: o próprio tipo. */
  etiqueta?: string;
  icone?: NomeIcone;
  /** Proposta ou assunto ao lado do tipo, ex.: "PLP 281/2019". */
  projeto?: string | null;
  /** Hora exibida no alto, ex.: "14:32"; null quando o fato só tem data. */
  hora: string | null;
  /** Manchete factual: ator, verbo no passado e objeto. */
  manchete: string;
  /** Contexto curto, sem adjetivos. */
  contexto?: string;
  /** Quem fez: com pessoa, a publicação ocupa a largura toda; sem, vira cartão. */
  pessoa?: { nome: string; meta?: string | null; foto: Foto | null } | null;
  /** Voto, orientação, resultado ou valor, em destaque. */
  fatos?: Fato[];
  fonte: CarimboFonteProps;
  /** Número de protocolo, ex.: "2026·1008·0311". */
  protocolo: string;
  /** Data em que o app coletou o dado (AAAA-MM-DD). */
  coletadoEm: string;
  /** Marca o registro como novo desde a última leitura. */
  novo?: boolean;
  /** Abre o detalhe do registro. */
  aoTocar?: () => void;
}

const ICONE_SENTIDO: Record<Fato['sentido'], NomeIcone> = { sim: 'check', nao: 'x', neutro: 'minus' };

/**
 * Publicação do feed. Com pessoa, ocupa a largura toda e se separa da
 * vizinha por uma faixa; sem pessoa (pauta, tramitação), é um cartão
 * arredondado. Lida pelo leitor de tela como uma única frase completa.
 */
export function Registro(props: RegistroProps) {
  const { tipo, etiqueta, icone, projeto, hora, manchete, contexto, pessoa, fatos, fonte } = props;
  const { protocolo, coletadoEm, novo, aoTocar } = props;
  const theme = useTheme();
  const empilhado = useWindowDimensions().fontScale > 1.3;
  const cartao = !pessoa;
  const frase = [novo ? 'Novo' : null, tipo, manchete, contexto, `Fonte: ${fonte.nome}`]
    .filter((parte): parte is string => Boolean(parte))
    .map((parte) => parte.replace(/\.$/, ''))
    .join('. ');
  const corSentido = { sim: theme.yes, nao: theme.no, neutro: theme.ink };

  const conteudo = (
    <>
      <View style={[styles.topo, empilhado && styles.topoEmpilhado]}>
        <View style={styles.tipo}>
          {icone ? <Icone nome={icone} tamanho={14} cor={theme.accent} /> : null}
          <Text style={[typography.tipo, { color: theme.accent }]}>{etiqueta ?? tipo}</Text>
          {projeto ? (
            <Text style={[typography.caption, { color: theme.ink3 }]} numberOfLines={1}>
              · {projeto}
            </Text>
          ) : null}
        </View>
        <Text style={[typography.dataSmall, { color: theme.ink3 }]}>
          {hora ?? ''}
          {novo ? <Text style={{ color: theme.accent }}>{hora ? ' · novo' : 'novo'}</Text> : null}
        </Text>
      </View>

      {pessoa ? (
        <View style={styles.pessoa}>
          <FotoOficial foto={pessoa.foto} nome={pessoa.nome} largura={36} />
          <View style={styles.pessoaTexto}>
            <Text style={[typography.bodyStrong, styles.nome, { color: theme.ink }]}>{pessoa.nome}</Text>
            {pessoa.meta ? <Text style={[typography.caption, { color: theme.ink2 }]}>{pessoa.meta}</Text> : null}
          </View>
        </View>
      ) : null}

      <Text style={[cartao ? typography.headline : typography.title, styles.manchete, { color: theme.ink }]}>
        {manchete}
      </Text>
      {contexto ? (
        <Text style={[typography.body, styles.contexto, { color: theme.ink2 }]} numberOfLines={aoTocar ? 3 : undefined}>
          {contexto}
        </Text>
      ) : null}

      {fatos?.length ? (
        <View style={[styles.fatos, { backgroundColor: theme.voteBox }]}>
          {fatos.map((f, i) => (
            <View key={f.rotulo} style={[styles.fato, i > 0 && { borderLeftWidth: 1, borderLeftColor: theme.rule }]}>
              <Text style={[typography.caption, { color: theme.ink2 }]}>{f.rotulo}</Text>
              <View style={styles.valor}>
                <Icone nome={f.icone ?? ICONE_SENTIDO[f.sentido]} tamanho={20} cor={corSentido[f.sentido]} />
                <Text
                  style={[typography.dataLarge, { color: corSentido[f.sentido] }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {f.valor}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[styles.rodape, { borderTopColor: theme.line }]}>
        <View style={styles.fonte}>
          <CarimboFonte {...fonte} />
          <Text style={[typography.dataSmall, { color: theme.ink3 }]}>
            coletado {coletadoEm.split('-').reverse().join('/')} · Nº {protocolo}
          </Text>
        </View>
        {aoTocar ? <Icone nome="arrow-up-right" tamanho={18} cor={theme.ink3} /> : null}
      </View>
    </>
  );

  const estilo = cartao
    ? [styles.cartao, { backgroundColor: theme.surface, boxShadow: theme.shadowCard }]
    : [styles.post, { backgroundColor: theme.surface, borderBottomColor: theme.postGap }];

  if (aoTocar) {
    return (
      <Pressable
        role="button"
        aria-label={frase}
        accessibilityHint="Abre o registro com a fonte"
        onPress={aoTocar}
        style={({ pressed }) => [...estilo, pressed && styles.apertado]}
      >
        {conteudo}
      </Pressable>
    );
  }
  return (
    <View accessible aria-label={frase} style={estilo}>
      {conteudo}
    </View>
  );
}

const styles = StyleSheet.create({
  post: {
    minHeight: toque.minimo,
    paddingTop: recuo,
    paddingHorizontal: recuo,
    borderBottomWidth: rules.faixa,
  },
  cartao: {
    minHeight: toque.minimo,
    marginHorizontal: recuo,
    marginBottom: rules.faixa,
    paddingTop: space.lg + 1,
    paddingHorizontal: space.lg + 2,
    borderRadius: radius.md,
  },
  apertado: { opacity: 0.85 },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, minHeight: 24 },
  topoEmpilhado: { flexDirection: 'column', alignItems: 'flex-start' },
  tipo: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs + 2, flexShrink: 1 },
  pessoa: { flexDirection: 'row', alignItems: 'center', gap: space.md - 1, marginTop: space.md + 2 },
  pessoaTexto: { flex: 1, gap: 2 },
  nome: { fontSize: 14, lineHeight: 19 },
  manchete: { marginTop: space.md + 2 },
  contexto: { fontSize: 14, lineHeight: 21, marginTop: space.sm },
  fatos: {
    flexDirection: 'row',
    marginTop: space.lg + 1,
    paddingVertical: space.md + 1,
    paddingHorizontal: space.md,
    borderRadius: radius.voto,
    minHeight: 83,
  },
  fato: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xs + 3, paddingHorizontal: space.sm },
  valor: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, maxWidth: '100%' },
  rodape: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.lg + 1,
    paddingVertical: space.md,
    borderTopWidth: rules.hairline,
  },
  fonte: { flex: 1, gap: space.xs },
});
