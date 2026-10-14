import { Pressable, StyleSheet, Text, View } from 'react-native';
import { rules, space, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { CarimboFonte, type CarimboFonteProps } from './CarimboFonte';

export interface RegistroProps {
  /** Tipo e assunto, ex.: "Votação nominal · Trabalho e Emprego". */
  tipo: string;
  /** Hora exibida na coluna de margem, ex.: "14:32"; null quando o fato só tem data. */
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
  /** Grifa o registro como novo desde a última leitura. */
  novo?: boolean;
  /** Abre o detalhe do registro. */
  aoTocar?: () => void;
}

/**
 * Item do feed. Lido pelo leitor de tela como uma única frase completa, com
 * a fonte; a coluna de margem dá o ritmo de jornal.
 */
export function Registro(props: RegistroProps) {
  const { tipo, hora, manchete, contexto, fonte, protocolo, coletadoEm, novo, aoTocar } = props;
  const theme = useTheme();
  const frase = [novo ? 'Novo' : null, tipo, manchete, contexto, `Fonte: ${fonte.nome}`]
    .filter((parte): parte is string => Boolean(parte))
    .map((parte) => parte.replace(/\.$/, ''))
    .join('. ');

  const conteudo = (
    <>
      <View style={styles.margem}>
        <Text style={[typography.dataSmall, { color: theme.ink3 }]}>{hora ?? ''}</Text>
      </View>
      <View style={styles.corpo}>
        <Text style={[typography.overline, { color: theme.ink2 }]}>{tipo}</Text>
        <Text
          style={[
            typography.title,
            { color: theme.ink },
            novo ? { backgroundColor: theme.highlight } : null,
          ]}
        >
          {manchete}
        </Text>
        {contexto ? (
          <Text style={[typography.body, { color: theme.ink2 }]} numberOfLines={aoTocar ? 3 : undefined}>
            {contexto}
          </Text>
        ) : null}
        <View style={styles.rodape}>
          <CarimboFonte {...fonte} />
          <Text style={[typography.dataSmall, { color: theme.ink3 }]}>
            coletado {coletadoEm.split('-').reverse().join('/')} · Nº {protocolo}
          </Text>
        </View>
      </View>
    </>
  );

  if (aoTocar) {
    return (
      <Pressable
        role="button"
        aria-label={frase}
        accessibilityHint="Abre o registro com a fonte"
        onPress={aoTocar}
        style={({ pressed }) => [
          styles.registro,
          { borderBottomColor: theme.rule },
          pressed && { backgroundColor: theme.paperRaised },
        ]}
      >
        {conteudo}
      </Pressable>
    );
  }
  return (
    <View accessible aria-label={frase} style={[styles.registro, { borderBottomColor: theme.rule }]}>
      {conteudo}
    </View>
  );
}

const styles = StyleSheet.create({
  registro: {
    flexDirection: 'row',
    paddingVertical: space.lg,
    borderBottomWidth: rules.hairline,
  },
  margem: { width: space.margin, paddingTop: space.xxs },
  corpo: { flex: 1, gap: space.xs },
  rodape: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.sm,
  },
});
