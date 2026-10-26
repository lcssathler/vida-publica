import { StyleSheet, TextInput } from 'react-native';
import { radius, space, toque, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export function CampoBusca({ valor, aoMudar, rotulo, placeholder }: {
  valor: string; aoMudar: (valor: string) => void; rotulo: string; placeholder: string;
}) {
  const theme = useTheme();
  return (
    <TextInput
      value={valor}
      onChangeText={aoMudar}
      aria-label={rotulo}
      placeholder={placeholder}
      placeholderTextColor={theme.ink3}
      autoCorrect={false}
      returnKeyType="search"
      clearButtonMode="while-editing"
      style={[typography.body, styles.campo, { backgroundColor: theme.surface, color: theme.ink, borderColor: theme.rule }]}
    />
  );
}

const styles = StyleSheet.create({
  campo: { minHeight: toque.minimo, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: space.md },
});
