import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, rules, space, toque, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { Icone } from './Icone';

export interface AlternarProps {
  /** Texto visível, ex.: "Seguir" ou o nome do assunto. */
  rotulo: string;
  /** Texto visível quando marcado, ex.: "Seguindo". Padrão: o próprio rótulo. */
  rotuloMarcado?: string;
  /** Nome lido pelo leitor de tela, ex.: "Seguir Maria Exemplo". */
  descricao?: string;
  marcado: boolean;
  aoAlternar: () => void;
  desabilitado?: boolean;
  /** radio quando só um do grupo pode ser escolhido (estado); switch para ligar e desligar. */
  papel?: 'checkbox' | 'radio' | 'switch';
  /**
   * opcao: escolha curta num grupo (ano), marcada em tinta cheia.
   * seguir: botão de seguir, marcado no acento suave.
   * linha: item de lista de largura total, com o marcador à direita.
   */
  aparencia?: 'opcao' | 'seguir' | 'linha';
}

/**
 * Liga/desliga: seguir, escolher um item, ligar um aviso. O estado não
 * depende só da cor: marcado ganha o ✓ (ou a bolinha, ou a chave do outro
 * lado) e o leitor de tela anuncia "marcado".
 */
export function Alternar({
  rotulo,
  rotuloMarcado,
  descricao,
  marcado,
  aoAlternar,
  desabilitado,
  papel = 'checkbox',
  aparencia,
}: AlternarProps) {
  const theme = useTheme();
  const tipo = aparencia ?? (rotuloMarcado ? 'seguir' : 'opcao');
  const texto = marcado ? (rotuloMarcado ?? rotulo) : rotulo;
  const comum = {
    role: papel,
    'aria-label': descricao ?? rotulo,
    'aria-checked': marcado,
    'aria-disabled': !!desabilitado,
    disabled: desabilitado,
    onPress: aoAlternar,
  } as const;

  if (papel === 'switch') {
    return (
      <Pressable {...comum} hitSlop={8} style={({ pressed }) => [styles.alvoChave, pressed && styles.apagado]}>
        <View style={[styles.trilho, { backgroundColor: marcado ? theme.accent : theme.rule }]}>
          <View
            style={[
              styles.botaoChave,
              { backgroundColor: marcado ? theme.surface : theme.ink2 },
              marcado && styles.botaoLigado,
            ]}
          />
        </View>
      </Pressable>
    );
  }

  if (tipo === 'linha') {
    return (
      <Pressable
        {...comum}
        style={({ pressed }) => [styles.linha, { borderBottomColor: theme.line }, pressed && styles.apagado]}
      >
        {papel === 'checkbox' ? (
          <View
            style={[
              styles.caixa,
              marcado ? { backgroundColor: theme.accent } : { borderWidth: 1.5, borderColor: theme.inactive },
            ]}
          >
            {marcado ? <Icone nome="check" tamanho={13} cor={theme.surface} /> : null}
          </View>
        ) : null}
        <Text style={[marcado ? typography.bodyStrong : typography.body, styles.textoLinha, { color: theme.ink }]}>
          {texto}
        </Text>
        {papel === 'radio' ? (
          <View style={[styles.radio, { borderColor: marcado ? theme.accent : theme.inactive }]}>
            {marcado ? <View style={[styles.miolo, { backgroundColor: theme.accent }]} /> : null}
          </View>
        ) : null}
      </Pressable>
    );
  }

  const cores = marcado
    ? tipo === 'seguir'
      ? { fundo: theme.accentWash, borda: theme.accentWash, texto: theme.accent }
      : { fundo: theme.ink, borda: theme.ink, texto: theme.background }
    : { fundo: 'transparent', borda: theme.rule, texto: theme.ink };

  return (
    <Pressable
      {...comum}
      hitSlop={4}
      style={({ pressed }) => [
        styles.alternar,
        { backgroundColor: cores.fundo, borderColor: cores.borda },
        pressed && styles.apertado,
        desabilitado && styles.apagado,
      ]}
    >
      {marcado ? (
        <Icone nome="check" tamanho={14} cor={cores.texto} />
      ) : tipo === 'seguir' && papel === 'checkbox' ? (
        <Icone nome="plus" tamanho={14} cor={cores.texto} />
      ) : null}
      <Text style={[typography.label, { color: cores.texto, flexShrink: 1 }]}>{texto}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  alternar: {
    maxWidth: '100%',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: space.xs + 2,
    minHeight: toque.minimo,
    paddingHorizontal: space.md + 2,
    borderWidth: 1,
    borderRadius: radius.voto,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 52,
    borderBottomWidth: rules.hairline,
  },
  textoLinha: { flex: 1 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  miolo: { width: 10, height: 10, borderRadius: 5 },
  caixa: { width: 20, height: 20, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  alvoChave: { minWidth: toque.minimo, minHeight: toque.minimo, alignItems: 'flex-end', justifyContent: 'center' },
  trilho: { width: 40, height: 24, borderRadius: radius.pill, padding: 3 },
  botaoChave: { width: 18, height: 18, borderRadius: 9 },
  botaoLigado: { transform: [{ translateX: 16 }] },
  apertado: { transform: [{ scale: 0.97 }] },
  apagado: { opacity: 0.5 },
});
