import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { radius, space, toque, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { CarimboFonte, type CarimboFonteProps } from './CarimboFonte';
import { Icone } from './Icone';

export interface RegistroProps {
  /** Tipo e assunto, ex.: "Votação nominal · Trabalho e Emprego". */
  tipo: string;
  /** Hora exibida no alto do cartão, ex.: "14:32"; null quando o fato só tem data. */
  hora: string | null;
  /** Manchete factual: ator, verbo no passado e objeto. */
  manchete: string;
  /** Contexto curto, sem adjetivos. */
  contexto?: string;
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

/**
 * Item do feed: cartão flutuante com o tipo no alto, a manchete, o contexto e
 * a fonte no pé. Lido pelo leitor de tela como uma única frase completa.
 */
export function Registro(props: RegistroProps) {
  const { tipo, hora, manchete, contexto, fonte, protocolo, coletadoEm, novo, aoTocar } = props;
  const theme = useTheme();
  // Com fonte grande (acessibilidade), a etiqueta e a hora ficam uma embaixo da outra.
  const empilhado = useWindowDimensions().fontScale > 1.3;
  const frase = [novo ? 'Novo' : null, tipo, manchete, contexto, `Fonte: ${fonte.nome}`]
    .filter((parte): parte is string => Boolean(parte))
    .map((parte) => parte.replace(/\.$/, ''))
    .join('. ');

  const conteudo = (
    <>
      <View style={[styles.topo, empilhado && styles.topoEmpilhado]}>
        <View style={[styles.etiqueta, { backgroundColor: theme.accentWash }]}>
          <Text style={[typography.overline, { color: theme.accent }]} numberOfLines={1}>
            {tipo}
          </Text>
        </View>
        <Text style={[typography.dataSmall, { color: theme.ink3 }]}>
          {hora ?? ''}
          {novo ? <Text style={{ color: theme.accent }}>{hora ? ' · novo' : 'novo'}</Text> : null}
        </Text>
      </View>
      <Text style={[typography.title, { color: theme.ink }]}>{manchete}</Text>
      {contexto ? (
        <Text style={[typography.body, styles.contexto, { color: theme.ink2 }]} numberOfLines={aoTocar ? 3 : undefined}>
          {contexto}
        </Text>
      ) : null}
      <View style={[styles.rodape, { borderTopColor: theme.line }]}>
        <View style={styles.fonte}>
          <CarimboFonte {...fonte} />
          <Text style={[typography.dataSmall, { color: theme.ink3 }]}>
            coletado {coletadoEm.split('-').reverse().join('/')} · Nº {protocolo}
          </Text>
        </View>
        {aoTocar ? <Icone nome="chevron-right" tamanho={18} cor={theme.ink3} /> : null}
      </View>
    </>
  );

  const cartao = [styles.registro, { backgroundColor: theme.surface, boxShadow: theme.shadowCard }];

  if (aoTocar) {
    return (
      <Pressable
        role="button"
        aria-label={frase}
        accessibilityHint="Abre o registro com a fonte"
        onPress={aoTocar}
        style={({ pressed }) => [...cartao, pressed && styles.apertado]}
      >
        {conteudo}
      </Pressable>
    );
  }
  return (
    <View accessible aria-label={frase} style={cartao}>
      {conteudo}
    </View>
  );
}

const styles = StyleSheet.create({
  registro: {
    minHeight: toque.minimo,
    padding: space.md + 2,
    gap: space.sm,
    borderRadius: radius.card,
    marginBottom: space.sm + 2,
  },
  apertado: { transform: [{ scale: 0.985 }], opacity: 0.92 },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  topoEmpilhado: { flexDirection: 'column', alignItems: 'flex-start' },
  etiqueta: { flexShrink: 1, paddingHorizontal: space.sm + 1, paddingVertical: space.xs, borderRadius: radius.pill },
  contexto: { fontSize: 14, lineHeight: 20 },
  rodape: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xs,
    paddingTop: space.sm + 2,
    borderTopWidth: 1,
  },
  fonte: { flex: 1, gap: space.xs },
});
