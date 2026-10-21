import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icone, type NomeIcone } from '../../components/Icone';
import { barra, space, toque } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

type PropsDaBarra = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICONES: Record<string, NomeIcone> = {
  index: 'grid',
  navegar: 'compass',
  seguindo: 'users',
  busca: 'search',
  conta: 'user',
};

/**
 * Dock flutuante: cápsula com os destinos; o ativo vira uma cápsula clara com
 * o nome, os outros ficam só com o ícone. O nome de cada aba é o que o leitor
 * de tela lê.
 */
function Dock({ state, descriptors, navigation }: PropsDaBarra) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.ancora, { bottom: insets.bottom + barra.margemInferior }]}>
      <View
        role="tablist"
        style={[styles.dock, { backgroundColor: theme.bar, borderColor: theme.barBorder, boxShadow: theme.shadowBar }]}
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
                ativa && [styles.itemAtivo, { backgroundColor: theme.barActive }],
                pressed && !ativa && styles.apertado,
              ]}
            >
              <Icone nome={ICONES[rota.name] ?? 'circle'} tamanho={ativa ? 17 : 19} cor={ativa ? theme.barActiveIcon : theme.barIcon} />
              {ativa ? <Text style={[styles.rotulo, { color: theme.barActiveIcon }]}>{titulo}</Text> : null}
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
  ancora: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    padding: space.xs + 1,
    borderRadius: 28,
    borderWidth: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm - 1,
    minWidth: toque.minimo,
    height: toque.minimo,
    minHeight: toque.minimo,
    borderRadius: 24,
  },
  itemAtivo: { minWidth: 92, paddingHorizontal: space.md },
  rotulo: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 16 },
  apertado: { opacity: 0.6 },
});
