import { Pressable, StyleSheet, Text } from 'react-native';
import { radius, space, toque, typography } from '../theme/tokens';
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
   * opcao: escolha num grupo (estado, assunto), marcada em tinta cheia.
   * seguir: botão de seguir, marcado no acento suave.
   */
  aparencia?: 'opcao' | 'seguir';
}

/**
 * Botão de liga/desliga (seguir, escolher assunto). O estado não depende só
 * da cor: marcado ganha o ✓ e o leitor de tela anuncia "marcado".
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
  const cores = marcado
    ? tipo === 'seguir'
      ? { fundo: theme.accentWash, borda: theme.accentWash, texto: theme.accent }
      : { fundo: theme.ink, borda: theme.ink, texto: theme.background }
    : { fundo: theme.surface, borda: theme.rule, texto: theme.ink };

  return (
    <Pressable
      role={papel}
      aria-label={descricao ?? rotulo}
      aria-checked={marcado}
      aria-disabled={!!desabilitado}
      disabled={desabilitado}
      onPress={aoAlternar}
      hitSlop={4}
      style={({ pressed }) => [
        styles.alternar,
        { backgroundColor: cores.fundo, borderColor: cores.borda },
        pressed && styles.apertado,
        desabilitado && styles.apagado,
      ]}
    >
      {marcado ? (
        <Icone nome="check" tamanho={15} cor={cores.texto} />
      ) : tipo === 'seguir' && papel === 'checkbox' ? (
        <Icone nome="plus" tamanho={15} cor={cores.texto} />
      ) : null}
      <Text style={[typography.label, { color: cores.texto }]}>{texto}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  alternar: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: space.xs,
    minHeight: toque.minimo,
    paddingHorizontal: space.md + 2,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apertado: { transform: [{ scale: 0.97 }] },
  apagado: { opacity: 0.5 },
});
