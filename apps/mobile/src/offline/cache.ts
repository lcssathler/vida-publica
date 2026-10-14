import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import type { Query } from '@tanstack/react-query';

/** Quanto tempo o que foi visto fica disponível sem conexão. */
export const VALIDADE_CACHE_MS = 3 * 24 * 60 * 60 * 1000;

/** Páginas guardadas de cada lista com cursor (o resto volta a carregar on-line). */
export const PAGINAS_GUARDADAS = 3;

/**
 * O que vale guardar para abrir sem conexão: feed, registros, perfis,
 * propostas, o que a pessoa segue e as listas do onboarding. A busca não fica
 * guardada.
 */
const GUARDAR = new Set(['feed', 'evento', 'pessoa', 'partido', 'proposta', 'seguindo', 'assuntos', 'parlamentares', 'conta']);

export function deveGuardar(query: Query): boolean {
  return query.state.status === 'success' && GUARDAR.has(String(query.queryKey[0]));
}

interface PaginasInfinitas {
  pages: unknown[];
  pageParams: unknown[];
}

const ehInfinita = (dados: unknown): dados is PaginasInfinitas =>
  typeof dados === 'object' && dados !== null && Array.isArray((dados as PaginasInfinitas).pages);

/** Corta as listas com cursor nas primeiras páginas, para o cache não crescer sem fim. */
export function aparar(cliente: PersistedClient): PersistedClient {
  return {
    ...cliente,
    clientState: {
      ...cliente.clientState,
      queries: cliente.clientState.queries.map((q) =>
        ehInfinita(q.state.data)
          ? {
              ...q,
              state: {
                ...q.state,
                data: {
                  pages: q.state.data.pages.slice(0, PAGINAS_GUARDADAS),
                  pageParams: q.state.data.pageParams.slice(0, PAGINAS_GUARDADAS),
                },
              },
            }
          : q,
      ),
    },
  };
}

export const persistidor = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'vp.cache.v1',
  throttleTime: 2000,
  serialize: (cliente) => JSON.stringify(aparar(cliente)),
});
