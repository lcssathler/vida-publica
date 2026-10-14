import { QueryClient } from '@tanstack/react-query';
import { VALIDADE_CACHE_MS } from '../offline/cache';
import { ErroRede } from './erros';

/**
 * Tenta de novo só falhas de rede (até 2 vezes). Erros da API (4xx, 5xx) e o
 * 429, que já esperou o Retry-After curto no cliente, vão direto para a tela.
 */
export function novoQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (falhas, erro) => erro instanceof ErroRede && falhas < 2,
        staleTime: 60 * 1000,
        // Guardadas no aparelho pelo mesmo tempo que o cache offline vale.
        gcTime: VALIDADE_CACHE_MS,
      },
      mutations: { retry: false },
    },
  });
}
