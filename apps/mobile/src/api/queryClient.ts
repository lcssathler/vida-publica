import { QueryClient } from '@tanstack/react-query';
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
      },
      mutations: { retry: false },
    },
  });
}
