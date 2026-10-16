import { Tabs } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icone, type NomeIcone } from '../../components/Icone';
import { barra, movimento, space, toque } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

type PropsDaBarra = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICONES: Record<string, NomeIcone> = {
  index: 'align-left',
  busca: 'search',
  seguindo: 'bookmark',
  conta: 'user',
};

const LARGURA_ITEM = 64;
const VAO = 4;

function useMovimentoReduzido(): boolean {
  const [reduzido, setReduzido] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduzido);
    const inscricao = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduzido);
    return () => inscricao.remove();
  }, []);
  return reduzido;
}

/**
 * Barra de navegação flutuante: cápsula só com ícones, centralizada acima da
 * borda. O nome de cada aba é o que o leitor de tela lê. A marca da aba ativa
 * desliza até a aba tocada.
 */
function BarraFlutuante({ state, descriptors, navigation }: PropsDaBarra) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduzido = useMovimentoReduzido();
  const [posicao] = useState(() => new Animated.Value(state.index));

  useEffect(() => {
    if (reduzido) {
      posicao.setValue(state.index);
      return;
    }
    Animated.timing(posicao, {
      toValue: state.index,
      duration: movimento.padrao,
      easing: Easing.bezier(...movimento.curva),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [state.index, reduzido, posicao]);

  const deslocamento = posicao.interpolate({
    inputRange: [0, 1],
    outputRange: [0, LARGURA_ITEM + VAO],
  });

  return (
    <View pointerEvents="box-none" style={[styles.ancora, { bottom: insets.bottom + barra.margemInferior }]}>
      <View
        role="tablist"
        style={[
          styles.barra,
          { backgroundColor: theme.bar, borderColor: theme.barBorder, boxShadow: theme.shadowBar },
        ]}
      >
        <Animated.View
          aria-hidden
          style={[styles.marca, { backgroundColor: theme.barActive, transform: [{ translateX: deslocamento }] }]}
        />
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
              style={styles.item}
            >
              <Icone nome={ICONES[rota.name] ?? 'circle'} tamanho={22} cor={ativa ? theme.barActiveIcon : theme.barIcon} />
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
      tabBar={(props) => <BarraFlutuante {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.background } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Feed' }} />
      <Tabs.Screen name="busca" options={{ title: 'Busca' }} />
      <Tabs.Screen name="seguindo" options={{ title: 'Seguindo' }} />
      <Tabs.Screen name="conta" options={{ title: 'Conta' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  ancora: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  barra: {
    flexDirection: 'row',
    gap: VAO,
    padding: space.xs + 1,
    borderRadius: 999,
    borderWidth: 1,
  },
  marca: {
    position: 'absolute',
    top: space.xs + 1,
    left: space.xs + 1,
    width: LARGURA_ITEM,
    height: toque.minimo,
    borderRadius: 999,
  },
  item: {
    width: LARGURA_ITEM,
    height: toque.minimo,
    minHeight: toque.minimo,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
