import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { novoQueryClient } from '../api/queryClient';
import { deveGuardar, persistidor, VALIDADE_CACHE_MS } from '../offline/cache';
import { useAvisos } from '../notificacoes/avisos';
import { ligarConexao } from '../offline/conexao';
import { SessaoProvider, useSessao } from '../sessao/Sessao';
import { fonts } from '../theme/fonts';
import { useEsquema } from '../theme/preferencia';
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
  const scheme = useEsquema();

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
  useAvisos(local.onboardingConcluido && local.avisos);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Protected guard={local.onboardingConcluido}>
        <Stack.Screen name="(abas)" />
        <Stack.Screen
          name="evento/[id]"
          options={{
            presentation: 'formSheet',
            sheetGrabberVisible: true,
            sheetCornerRadius: 22,
            sheetAllowedDetents: [0.92],
            contentStyle: { backgroundColor: theme.sheet },
          }}
        />
        <Stack.Screen name="pessoa/[id]" />
        <Stack.Screen name="partido/[id]" />
        <Stack.Screen name="proposta/[id]" />
        <Stack.Screen name="reportar/[id]" />
        <Stack.Screen name="erratas" />
      </Stack.Protected>
      <Stack.Protected guard={!local.onboardingConcluido}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
    </Stack>
  );
}
