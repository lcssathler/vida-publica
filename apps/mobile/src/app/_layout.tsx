import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { useColorScheme } from 'react-native';
import { novoQueryClient } from '../api/queryClient';
import { SessaoProvider, useSessao } from '../sessao/Sessao';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

export default function RootLayout() {
  const [fontsLoaded] = useFonts(fonts);
  const [consultas] = useState(novoQueryClient);
  const scheme = useColorScheme();

  if (!fontsLoaded) return null;

  return (
    <QueryClientProvider client={consultas}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <SessaoProvider>
        <Rotas />
      </SessaoProvider>
    </QueryClientProvider>
  );
}

/** Até concluir o onboarding, só as telas dele ficam acessíveis. */
function Rotas() {
  const theme = useTheme();
  const { local } = useSessao();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.paper },
      }}
    >
      <Stack.Protected guard={local.onboardingConcluido}>
        <Stack.Screen name="(abas)" />
        <Stack.Screen name="evento/[id]" />
        <Stack.Screen name="pessoa/[id]" />
        <Stack.Screen name="partido/[id]" />
      </Stack.Protected>
      <Stack.Protected guard={!local.onboardingConcluido}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
    </Stack>
  );
}
