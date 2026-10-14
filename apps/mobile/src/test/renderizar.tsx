import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { useCallback, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { ClienteApi } from '../api/cliente';
import { SessaoContexto } from '../sessao/Sessao';
import { ESTADO_INICIAL, type EstadoLocal } from '../sessao/local';
import { apiFalsa, cofreEmMemoria, type RespostaFalsa, type PedidoRegistrado } from './apiFalsa';

interface Opcoes {
  rotas?: Record<string, RespostaFalsa | ((p: PedidoRegistrado) => RespostaFalsa)>;
  local?: Partial<EstadoLocal>;
}

/**
 * Renderiza uma tela com sessão pronta, cliente real e API falsa. Devolve os
 * pedidos feitos à API e o estado local atual.
 */
export async function renderizar(ui: ReactElement, { rotas = {}, local = {} }: Opcoes = {}) {
  const api = apiFalsa(rotas);
  const cliente = new ClienteApi({
    baseUrl: 'http://api.teste',
    cofre: cofreEmMemoria(),
    plataforma: 'android',
    fetch: api.fetch,
    esperar: async () => {},
  });
  await cliente.iniciar();
  api.pedidos.length = 0;
  const consultas = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  const atual = { local: { ...ESTADO_INICIAL, ...local } };

  function Sessao({ children }: { children: ReactNode }) {
    const [estado, setEstado] = useState(atual.local);
    const atualizarLocal = useCallback((mudancas: Partial<EstadoLocal>) => {
      setEstado((anterior) => (atual.local = { ...anterior, ...mudancas }));
    }, []);
    const valor = useMemo(() => ({ cliente, local: estado, atualizarLocal }), [estado, atualizarLocal]);
    return <SessaoContexto.Provider value={valor}>{children}</SessaoContexto.Provider>;
  }

  const resultado = await render(
    <QueryClientProvider client={consultas}>
      <Sessao>{ui}</Sessao>
    </QueryClientProvider>,
  );
  return { ...resultado, api, cliente, consultas, local: () => atual.local };
}
