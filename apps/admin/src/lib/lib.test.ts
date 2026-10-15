import { itensDoFormulario } from '../app/(painel)/eventos/itens';
import { dinheiro, quando } from './formato';
import { ipDoCliente, listaDeIps } from './ips';

describe('IP de quem acessa', () => {
  it('usa o último endereço do X-Forwarded-For (o salto mais próximo)', () => {
    expect(ipDoCliente('203.0.113.9')).toBe('203.0.113.9');
    expect(ipDoCliente('1.1.1.1, 10.0.0.2')).toBe('10.0.0.2');
    expect(ipDoCliente(null)).toBeNull();
    expect(ipDoCliente('')).toBeNull();
  });

  it('confere a lista; vazia, ninguém entra', () => {
    const permitido = listaDeIps(['127.0.0.1', '::1', '10.0.0.0/8']);
    expect(permitido('127.0.0.1')).toBe(true);
    expect(permitido('::ffff:127.0.0.1')).toBe(true);
    expect(permitido('::1')).toBe(true);
    expect(permitido('10.9.8.7')).toBe(true);
    expect(permitido('192.168.0.10')).toBe(false);
    expect(permitido(null)).toBe(false);
    expect(listaDeIps([])('127.0.0.1')).toBe(false);
    expect(() => listaDeIps(['10.0.0.0/40'])).toThrow(/inválida/);
  });
});

describe('itens marcados para revisão', () => {
  const id = '6f1b6f4e-4f3a-4c55-9c39-0d7f2c1e5a11';
  const hash = 'a'.repeat(64);

  it('lê id e versão, sem repetir e ignorando lixo', () => {
    expect(
      itensDoFormulario([`${id}:${hash}`, `${id}:${hash}`, 'lixo', `${id}:curto`]),
    ).toEqual([{ id, contentHash: hash }]);
  });
});

describe('formato', () => {
  it('dinheiro e datas de Brasília', () => {
    expect(dinheiro(750000).replace(/\s/g, ' ')).toBe('R$ 750.000,00');
    expect(dinheiro(null)).toBe('—');
    expect(quando('2026-10-15T03:00:00Z')).toBe('15/10/2026');
    expect(quando('2026-10-15T17:30:00Z')).toBe('15/10/2026, 14:30');
  });
});
