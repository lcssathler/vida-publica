import AsyncStorage from '@react-native-async-storage/async-storage';
import { onlineManager, QueryClient, QueryClientProvider, type Query } from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ClienteApi } from '../api/cliente';
import { aparar, deveGuardar, PAGINAS_GUARDADAS } from '../offline/cache';
import { AvisoSemConexao } from '../offline/AvisoSemConexao';
import { SessaoProvider } from '../sessao/Sessao';
import { cofreEmMemoria } from '../test/apiFalsa';

const consulta = (chave: string, status: 'success' | 'error' = 'success') =>
  ({ queryKey: [chave], state: { status } }) as unknown as Query;

describe('cache offline', () => {
  it('guarda feed, registros, perfis, propostas e seguindo; não guarda busca nem erro', () => {
    for (const chave of ['feed', 'evento', 'pessoa', 'partido', 'proposta', 'seguindo', 'assuntos', 'parlamentares', 'conta']) {
      expect(deveGuardar(consulta(chave))).toBe(true);
    }
    expect(deveGuardar(consulta('busca'))).toBe(false);
    expect(deveGuardar(consulta('feed', 'error'))).toBe(false);
  });

  it('apara as listas com cursor nas primeiras páginas', () => {
    const paginas = Array.from({ length: 10 }, (_, i) => ({ itens: [i], proximoCursor: `c${i}` }));
    const cliente = {
      timestamp: 0,
      buster: 'v1',
      clientState: {
        mutations: [],
        queries: [
          { queryKey: ['feed'], queryHash: 'f', state: { data: { pages: paginas, pageParams: paginas.map((_, i) => i) } } },
          { queryKey: ['evento', 'e1'], queryHash: 'e', state: { data: { id: 'e1' } } },
        ],
      },
    } as unknown as PersistedClient;
    const aparado = aparar(cliente);
    const feed = aparado.clientState.queries[0].state.data as { pages: unknown[]; pageParams: unknown[] };
    expect(feed.pages).toHaveLength(PAGINAS_GUARDADAS);
    expect(feed.pageParams).toEqual([0, 1, 2]);
    expect(aparado.clientState.queries[1].state.data).toEqual({ id: 'e1' });
  });
});

describe('sem conexão', () => {
  const semRede = () =>
    new ClienteApi({
      baseUrl: 'http://api.teste',
      cofre: cofreEmMemoria('refresh-guardado'),
      plataforma: 'android',
      fetch: (async () => {
        throw new TypeError('Network request failed');
      }) as unknown as typeof fetch,
    });

  const abrir = async (local: object) => {
    await AsyncStorage.setItem('vp.local.v1', JSON.stringify(local));
    await render(
      <QueryClientProvider client={new QueryClient()}>
        <SessaoProvider cliente={semRede()}>
          <Text>App aberto</Text>
        </SessaoProvider>
      </QueryClientProvider>,
    );
  };

  it('quem já passou do onboarding abre o app com o que está guardado', async () => {
    await abrir({ onboardingConcluido: true, uf: 'SP', parouAqui: {} });
    expect(await screen.findByText('App aberto')).toBeOnTheScreen();
  });

  it('na primeira abertura, sem rede, explica e oferece tentar de novo', async () => {
    await abrir({ onboardingConcluido: false, uf: null, parouAqui: {} });
    expect(await screen.findByText('Sem conexão com o servidor.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeOnTheScreen();
  });

  it('o aviso aparece só sem conexão, com a hora dos dados guardados', async () => {
    await render(<AvisoSemConexao atualizadoEm={Date.parse('2026-10-14T17:32:00.000Z')} />);
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => onlineManager.setOnline(false));
    expect(
      screen.getByText('Sem conexão. Mostrando o que está guardado neste aparelho. Salvo em 14/10/2026 às 14:32.'),
    ).toBeOnTheScreen();
    await act(async () => onlineManager.setOnline(true));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
