/** Configuração do painel, lida do ambiente do servidor (nunca vai ao navegador). */
export function config() {
  return {
    /** API do admin (processo src/admin/admin.ts da API), na rede privada. */
    apiUrl: process.env.ADMIN_API_URL ?? 'http://127.0.0.1:3001',
    /** IPs ou faixas CIDR que podem abrir o painel; vazio, ninguém. */
    ips: (process.env.ADMIN_IPS ?? '127.0.0.1,::1')
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean),
    /** Cookie só por HTTPS fora do desenvolvimento. */
    cookieSeguro: process.env.NODE_ENV === 'production' && process.env.PAINEL_HTTP !== '1',
  };
}

/** Cookie com o token da sessão do painel (httpOnly: o JavaScript da página não lê). */
export const COOKIE_SESSAO = 'vp_painel';
