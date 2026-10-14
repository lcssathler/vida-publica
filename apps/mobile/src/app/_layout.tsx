import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { useColorScheme } from 'react-native';
import { novoQueryClient } from '../api/queryClient';
import { deveGuardar, persistidor, VALIDADE_CACHE_MS } from '../offline/cache';
import { ligarConexao } from '../offline/conexao';
import { SessaoProvider, useSessao } from '../sessao/Sessao';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

ligarConexao();

const persistencia = {
  persister: persistidor,
  maxAge: VALIDADE_CACHE_MS,
  buster: 'v1',
  dehydrateOptions: { shouldDehydrateQuery: deveGuardar },
};

export default function RootLayout() {
  const [fontsLoaded] = useFonts(fonts);
  const [consultas] = useState(novoQueryClient);
  const scheme = useColorScheme();

  if (!fontsLoaded) return null;

  return (
    <PersistQueryClientProvider client={consultas} persistOptions={persistencia}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <SessaoProvider>
        <Rotas />
      </SessaoProvider>
    </PersistQueryClientProvider>
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
        <Stack.Screen name="proposta/[id]" />
      </Stack.Protected>
      <Stack.Protected guard={!local.onboardingConcluido}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
    </Stack>
  );
}
