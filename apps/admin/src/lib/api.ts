import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { config, COOKIE_SESSAO } from './config';
import { ipDoCliente } from './ips';

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

/**
 * Pedido à API do admin, do servidor do painel: leva o token da sessão (do
 * cookie httpOnly) e o IP de quem acessa, que a API confere de novo. Sessão
 * vencida ou encerrada volta para o login.
 */
export async function api<T>(
  caminho: string,
  opcoes: { metodo?: 'GET' | 'POST'; corpo?: unknown; semSessao?: boolean } = {},
): Promise<T> {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  const ip = ipDoCliente((await headers()).get('x-forwarded-for'));
  const resposta = await fetch(`${config().apiUrl}${caminho}`, {
    method: opcoes.metodo ?? 'GET',
    cache: 'no-store',
    headers: {
      ...(token && !opcoes.semSessao ? { authorization: `Bearer ${token}` } : {}),
      ...(ip ? { 'x-forwarded-for': ip } : {}),
      ...(opcoes.corpo !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
  });
  if (resposta.status === 401 && !opcoes.semSessao) redirect('/entrar?expirou=1');
  if (resposta.status === 204) return undefined as T;
  const corpo = (await resposta.json().catch(() => ({}))) as { message?: unknown };
  if (!resposta.ok) {
    const mensagem =
      typeof corpo.message === 'string' ? corpo.message : `Erro ${resposta.status}`;
    throw new ErroApi(resposta.status, mensagem);
  }
  return corpo as T;
}
