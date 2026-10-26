import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { novoQueryClient } from '../api/queryClient';
import { deveGuardar, persistidor, VALIDADE_CACHE_MS } from '../offline/cache';
import { useAvisos } from '../notificacoes/avisos';
import { ligarConexao } from '../offline/conexao';
import { SessaoProvider, useSessao } from '../sessao/Sessao';
import { fonts } from '../theme/fonts';
import { useEsquema } from '../theme/preferencia';
import { useTheme } from '../theme/useTheme';
import { space, toque } from '../theme/tokens';

ligarConexao();

const persistencia = {
  persister: persistidor,
  maxAge: VALIDADE_CACHE_MS,
  buster: 'v1',
  dehydrateOptions: { shouldDehydrateQuery: deveGuardar },
};

export default function RootLayout() {
  const [tentativa, setTentativa] = useState(0);
  const [consultas] = useState(novoQueryClient);
  const scheme = useEsquema();

  return (
    <PrepararFontes key={tentativa} aoTentar={() => setTentativa((v) => v + 1)}>
    <PersistQueryClientProvider client={consultas} persistOptions={persistencia}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <SessaoProvider>
        <Rotas />
      </SessaoProvider>
    </PersistQueryClientProvider>
    </PrepararFontes>
  );
}

function PrepararFontes({ children, aoTentar }: { children: ReactNode; aoTentar: () => void }) {
  const [carregadas, erro] = useFonts(fonts);
  const theme = useTheme();
  if (carregadas) return children;
  // Esta tela usa a fonte do sistema: não depende do recurso que falhou.
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.lg, backgroundColor: theme.background }}>
      {erro ? (
        <>
          <Text role="heading" style={{ fontSize: 20, color: theme.ink }}>Não foi possível carregar as fontes</Text>
          <Text style={{ color: theme.ink2 }}>Confira a conexão e tente novamente.</Text>
          <Pressable role="button" aria-label="Tentar novamente" onPress={aoTentar} style={{ minHeight: toque.minimo, minWidth: toque.minimo, justifyContent: 'center', paddingHorizontal: space.lg }}>
            <Text style={{ color: theme.accent }}>Tentar novamente</Text>
          </Pressable>
        </>
      ) : (
        <View role="progressbar" aria-label="Preparando o Vida Pública" style={{ gap: space.md }}>
          <ActivityIndicator color={theme.accent} />
          <Text style={{ color: theme.ink2 }}>Preparando o Vida Pública…</Text>
        </View>
      )}
    </View>
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
