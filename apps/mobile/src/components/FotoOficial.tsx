import { Image, StyleSheet, Text, View } from 'react-native';
import type { Foto } from '../api/tipos';
import { radius, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

/** As fontes oficiais ainda entregam http; o mesmo endereço responde em https. */
export function urlSegura(url: string): string {
  return url.replace(/^http:\/\//i, 'https://');
}

/** Foto oficial 3×4 (nunca círculo). Sem foto, as iniciais. Decorativa: o nome vem ao lado. */
export function FotoOficial({ foto, nome, largura = 36 }: { foto: Foto | null; nome: string; largura?: number }) {
  const theme = useTheme();
  const tamanho = { width: largura, height: Math.round((largura * 4) / 3) };
  if (!foto) {
    const iniciais = nome
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('');
    return (
      <View
        aria-hidden
        style={[styles.foto, tamanho, styles.vazia, { backgroundColor: theme.photo }]}
      >
        <Text style={[typography.dataSmall, { color: theme.ink2 }]}>{iniciais}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: urlSegura(foto.url) }}
      accessibilityIgnoresInvertColors
      aria-hidden
      style={[styles.foto, tamanho, { backgroundColor: theme.photo }]}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  foto: { borderRadius: radius.sm },
  vazia: { alignItems: 'center', justifyContent: 'center' },
});
