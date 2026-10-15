import { NextResponse, type NextRequest } from 'next/server';
import { config as lerConfig, COOKIE_SESSAO } from './lib/config';
import { ipDoCliente, listaDeIps } from './lib/ips';

const { ips } = lerConfig();
const permitido = listaDeIps(ips);

/**
 * Antes de qualquer página: IP fora da lista recebe 403 (nem a tela de login
 * aparece); sem cookie de sessão, vai para /entrar. Quem confere a sessão de
 * verdade é a API do admin, a cada pedido.
 */
export function proxy(request: NextRequest) {
  const ip = ipDoCliente(request.headers.get('x-forwarded-for'));
  if (!permitido(ip)) {
    return new NextResponse('Endereço sem acesso ao painel.', { status: 403 });
  }
  const caminho = request.nextUrl.pathname;
  if (caminho !== '/entrar' && !request.cookies.has(COOKIE_SESSAO)) {
    return NextResponse.redirect(new URL('/entrar', request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Tudo, menos os arquivos estáticos do Next e a saúde do contêiner.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|saude$).*)'],
};
