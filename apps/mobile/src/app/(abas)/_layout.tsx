import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icone, type NomeIcone } from '../../components/Icone';
import { barra, space, toque } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { useTecladoAberto } from '../../comum/useTecladoAberto';

type PropsDaBarra = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICONES: Record<string, NomeIcone> = {
  index: 'grid',
  navegar: 'compass',
  seguindo: 'users',
  busca: 'search',
  conta: 'user',
};

/**
 * Dock flutuante com destinos de largura estável e rótulos sempre visíveis.
 */
function Dock({ state, descriptors, navigation }: PropsDaBarra) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const tecladoAberto = useTecladoAberto();
  const ampliada = fontScale > 1.3;
  const colunas = fontScale > 2 || width < 360 ? 2 : 3;
  if (tecladoAberto) return null;

  return (
    <View style={[styles.ancora, { paddingBottom: insets.bottom + barra.margemInferior, backgroundColor: theme.background }]}>
      <View
        role="tablist"
        style={[styles.dock, ampliada && styles.dockAmpliado, { backgroundColor: theme.bar, borderColor: theme.barBorder, boxShadow: theme.shadowBar }]}
      >
        {state.routes.map((rota, i) => {
          const ativa = state.index === i;
          const titulo = descriptors[rota.key].options.title ?? rota.name;
          return (
            <Pressable
              key={rota.key}
              role="tab"
              aria-label={titulo}
              aria-selected={ativa}
              onPress={() => {
                const evento = navigation.emit({ type: 'tabPress', target: rota.key, canPreventDefault: true });
                if (!ativa && !evento.defaultPrevented) navigation.navigate(rota.name, rota.params);
              }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: rota.key })}
              style={({ pressed }) => [
                styles.item,
                ampliada && { flex: 0, width: colunas === 2 ? '50%' : '33.333333%' },
                ativa && { backgroundColor: theme.barActive },
                pressed && !ativa && styles.apertado,
              ]}
            >
              <Icone nome={ICONES[rota.name] ?? 'circle'} tamanho={19} cor={ativa ? theme.barActiveIcon : theme.barIcon} />
              <Text style={[styles.rotulo, { color: ativa ? theme.barActiveIcon : theme.barIcon }]}>{titulo}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function Abas() {
  const theme = useTheme();
  return (
    <Tabs
      tabBar={(props) => <Dock {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.background } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Feed' }} />
      <Tabs.Screen name="navegar" options={{ title: 'Navegar' }} />
      <Tabs.Screen name="seguindo" options={{ title: 'Seguindo' }} />
      <Tabs.Screen name="busca" options={{ title: 'Busca' }} />
      <Tabs.Screen name="conta" options={{ title: 'Conta' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  ancora: { paddingHorizontal: space.sm, paddingTop: space.sm, alignItems: 'center' },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 440,
    padding: space.xs + 1,
    borderRadius: 28,
    borderWidth: 1,
  },
  dockAmpliado: { flexWrap: 'wrap', justifyContent: 'center' },
  item: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    minWidth: toque.minimo,
    minHeight: toque.minimo + space.lg,
    paddingVertical: space.sm,
    borderRadius: 22,
  },
  rotulo: { fontFamily: 'Inter_600SemiBold', fontSize: 11, lineHeight: 16, textAlign: 'center' },
  apertado: { opacity: 0.6 },
});
