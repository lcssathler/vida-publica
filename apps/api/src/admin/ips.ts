import { BlockList, isIPv4, isIPv6 } from 'node:net';

/**
 * Lista de IPs que podem usar o painel (endereços ou faixas CIDR, IPv4 e
 * IPv6). Vazia, ninguém entra: o painel nunca fica aberto por esquecimento.
 */
export class IpsPermitidos {
  private readonly lista = new BlockList();

  constructor(readonly faixas: readonly string[]) {
    for (const faixa of faixas) {
      const [endereco, prefixo] = faixa.split('/');
      const tipo = isIPv4(endereco) ? 'ipv4' : isIPv6(endereco) ? 'ipv6' : null;
      if (!tipo) throw new Error(`Faixa de IP inválida: ${faixa}`);
      const bits =
        prefixo === undefined ? (tipo === 'ipv4' ? 32 : 128) : Number(prefixo);
      const max = tipo === 'ipv4' ? 32 : 128;
      if (!Number.isInteger(bits) || bits < 0 || bits > max) {
        throw new Error(`Faixa de IP inválida: ${faixa}`);
      }
      this.lista.addSubnet(endereco, bits, tipo);
    }
  }

  permite(ip: string | undefined): boolean {
    if (!ip) return false;
    // IPv4 visto por um socket IPv6 (::ffff:10.0.0.1).
    const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    if (isIPv4(v4)) return this.lista.check(v4, 'ipv4');
    if (isIPv6(ip)) return this.lista.check(ip, 'ipv6');
    return false;
  }
}
