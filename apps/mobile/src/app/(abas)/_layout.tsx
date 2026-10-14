import { Tabs } from 'expo-router';
import { rules, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

/** Abas só com rótulo (sem ícone): o texto é o que o leitor de tela lê. */
export default function Abas() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarIcon: () => null,
        tabBarIconStyle: { display: 'none' },
        tabBarLabelPosition: 'beside-icon',
        tabBarActiveTintColor: theme.stamp,
        tabBarInactiveTintColor: theme.ink2,
        tabBarLabelStyle: { ...typography.label, fontSize: 14 },
        tabBarStyle: {
          backgroundColor: theme.paper,
          borderTopColor: theme.rule,
          borderTopWidth: rules.hairline,
          minHeight: 56,
        },
        sceneStyle: { backgroundColor: theme.paper },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Feed' }} />
      <Tabs.Screen name="busca" options={{ title: 'Busca' }} />
      <Tabs.Screen name="seguindo" options={{ title: 'Seguindo' }} />
      <Tabs.Screen name="conta" options={{ title: 'Conta' }} />
    </Tabs>
  );
}
