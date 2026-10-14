/** API falsa para testes: responde por "MÉTODO /caminho" e registra os pedidos. */

export interface PedidoRegistrado {
  metodo: string;
  caminho: string;
  corpo: unknown;
  autorizacao: string | null;
}

export interface RespostaFalsa {
  status?: number;
  corpo?: unknown;
  cabecalhos?: Record<string, string>;
}

type Rota = RespostaFalsa | ((pedido: PedidoRegistrado) => RespostaFalsa);

export function apiFalsa(rotas: Record<string, Rota>) {
  const pedidos: PedidoRegistrado[] = [];
  let emitidos = 0;

  const par = () => {
    emitidos += 1;
    return {
      usuarioId: 'usuario-1',
      acesso: { token: `acesso-${emitidos}`, expiraEm: new Date(Date.now() + 15 * 60_000).toISOString() },
      refresh: { token: `refresh-${emitidos}`, expiraEm: new Date(Date.now() + 86_400_000).toISOString() },
    };
  };

  const padrao: Record<string, Rota> = {
    'POST /auth/anonimo': () => ({ status: 201, corpo: par() }),
    'POST /auth/renovar': () => ({ corpo: par() }),
  };

  const fetchFalso = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const caminho = url.replace(/^https?:\/\/[^/]+/, '');
    const metodo = init.method ?? 'GET';
    const cabecalhos = (init.headers ?? {}) as Record<string, string>;
    const pedido: PedidoRegistrado = {
      metodo,
      caminho,
      corpo: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      autorizacao: cabecalhos.Authorization ?? null,
    };
    pedidos.push(pedido);
    const semConsulta = caminho.split('?')[0];
    const rota =
      rotas[`${metodo} ${caminho}`] ?? rotas[`${metodo} ${semConsulta}`] ?? padrao[`${metodo} ${semConsulta}`];
    const resposta = typeof rota === 'function' ? rota(pedido) : (rota ?? { status: 404, corpo: { message: 'rota falsa ausente' } });
    const status = resposta.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(resposta.corpo ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json', ...resposta.cabecalhos },
    });
  };

  return { fetch: fetchFalso as unknown as typeof fetch, pedidos, par };
}

export function cofreEmMemoria(inicial: string | null = null) {
  let valor = inicial;
  return {
    get valor() {
      return valor;
    },
    ler: async () => valor,
    gravar: async (v: string) => {
      valor = v;
    },
    apagar: async () => {
      valor = null;
    },
  };
}
