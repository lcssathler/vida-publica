import { Pressable, StyleSheet, Text } from 'react-native';
import { radius, space, toque, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

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
  /** radio quando só um do grupo pode ser escolhido (estado). */
  papel?: 'checkbox' | 'radio';
}

/**
 * Botão de liga/desliga (seguir, escolher assunto). O estado não depende só
 * da cor: marcado ganha "✓" e o leitor de tela anuncia "marcado".
 */
export function Alternar({
  rotulo,
  rotuloMarcado,
  descricao,
  marcado,
  aoAlternar,
  desabilitado,
  papel = 'checkbox',
}: AlternarProps) {
  const theme = useTheme();
  const texto = marcado ? `✓ ${rotuloMarcado ?? rotulo}` : rotulo;

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
        marcado
          ? { backgroundColor: theme.stampWash, borderColor: theme.stamp }
          : { backgroundColor: 'transparent', borderColor: theme.ink2 },
        (pressed || desabilitado) && styles.apagado,
      ]}
    >
      <Text style={[typography.label, { color: marcado ? theme.stamp : theme.ink }]}>{texto}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  alternar: {
    alignSelf: 'flex-start',
    minHeight: toque.minimo,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderRadius: radius.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apagado: { opacity: 0.6 },
});
