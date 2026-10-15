import { BlockList, isIPv4, isIPv6 } from 'node:net';

/**
 * IPs ou faixas CIDR que podem abrir o painel (ADMIN_IPS). Lista vazia: ninguém.
 * A API do admin confere de novo, com o IP que o painel repassa.
 */
export function listaDeIps(faixas: readonly string[]): (ip: string | null) => boolean {
  const lista = new BlockList();
  for (const faixa of faixas) {
    const [endereco, prefixo] = faixa.split('/');
    const tipo = isIPv4(endereco) ? 'ipv4' : isIPv6(endereco) ? 'ipv6' : null;
    const max = tipo === 'ipv4' ? 32 : 128;
    const bits = prefixo === undefined ? max : Number(prefixo);
    if (!tipo || !Number.isInteger(bits) || bits < 0 || bits > max) {
      throw new Error(`Faixa de IP inválida em ADMIN_IPS: ${faixa}`);
    }
    lista.addSubnet(endereco, bits, tipo);
  }
  return (ip) => {
    if (!ip) return false;
    const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    if (isIPv4(v4)) return lista.check(v4, 'ipv4');
    if (isIPv6(ip)) return lista.check(ip, 'ipv6');
    return false;
  };
}

/**
 * IP de quem acessa: o último endereço do X-Forwarded-For, que é o que o
 * salto mais próximo escreveu (o próprio Next, a partir da conexão, ou o proxy
 * reverso à frente, que sobrescreve o que o cliente mandou).
 */
export function ipDoCliente(xForwardedFor: string | null): string | null {
  const ultimo = xForwardedFor?.split(',').at(-1)?.trim();
  return ultimo ? ultimo : null;
}
