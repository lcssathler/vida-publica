import {
  base32,
  cifrar,
  codigoTotp,
  conferirSenha,
  conferirTotp,
  decifrar,
  deBase32,
  HASH_FICTICIO,
  hashSenha,
  lerChave,
  passoTotp,
  segredoTotp,
  senhaAleatoria,
  uriTotp,
} from './cripto';
import { IpsPermitidos } from './ips';

describe('senha', () => {
  it('confere a senha certa e recusa a errada', async () => {
    const hash = await hashSenha('uma senha longa de teste');
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$/);
    await expect(conferirSenha('uma senha longa de teste', hash)).resolves.toBe(
      true,
    );
    await expect(conferirSenha('outra senha', hash)).resolves.toBe(false);
    await expect(conferirSenha('qualquer', HASH_FICTICIO)).resolves.toBe(false);
    await expect(conferirSenha('qualquer', 'texto')).resolves.toBe(false);
  });

  it('senha aleatória sem caracteres ambíguos', () => {
    const senha = senhaAleatoria();
    expect(senha).toHaveLength(20);
    expect(senha).not.toMatch(/[0O1l]/);
  });
});

describe('TOTP (RFC 6238)', () => {
  // Vetor de teste do apêndice B da RFC 6238 (SHA-1, segredo "12345678901234567890").
  const segredo = base32(Buffer.from('12345678901234567890'));

  it('gera os códigos do apêndice da RFC', () => {
    expect(codigoTotp(segredo, passoTotp(new Date(59_000)))).toBe('287082');
    expect(codigoTotp(segredo, passoTotp(new Date(1_111_111_109_000)))).toBe(
      '081804',
    );
    expect(codigoTotp(segredo, passoTotp(new Date(2_000_000_000_000)))).toBe(
      '279037',
    );
  });

  it('aceita o passo vizinho e recusa os de longe', () => {
    const agora = new Date(1_111_111_109_000);
    const passo = passoTotp(agora);
    expect(conferirTotp(segredo, codigoTotp(segredo, passo), agora)).toBe(
      passo,
    );
    expect(conferirTotp(segredo, codigoTotp(segredo, passo - 1), agora)).toBe(
      passo - 1,
    );
    expect(
      conferirTotp(segredo, codigoTotp(segredo, passo - 2), agora),
    ).toBeNull();
    expect(conferirTotp(segredo, 'abcdef', agora)).toBeNull();
    expect(conferirTotp(segredo, '12345', agora)).toBeNull();
  });

  it('segredo novo em base32 de 160 bits e endereço otpauth', () => {
    const novo = segredoTotp();
    expect(deBase32(novo)).toHaveLength(20);
    expect(uriTotp(novo, 'a@b.org')).toMatch(
      /^otpauth:\/\/totp\/Vida%20P%C3%BAblica%3Aa%40b\.org\?secret=[A-Z2-7]+&issuer=/,
    );
  });
});

describe('cifra do segredo do 2FA', () => {
  const chave = lerChave('segredo-de-teste-'.repeat(2));

  it('cifra e decifra; outra chave não abre', () => {
    const guardado = cifrar('SEGREDO', chave);
    expect(guardado).toMatch(/^v1\./);
    expect(guardado).not.toContain('SEGREDO');
    expect(decifrar(guardado, chave)).toBe('SEGREDO');
    const outra = lerChave('outro-segredo-de-teste-'.repeat(2));
    expect(() => decifrar(guardado, outra)).toThrow();
  });

  it('recusa segredo curto', () => {
    expect(() => lerChave('curto')).toThrow(/32 caracteres/);
  });
});

describe('IPs permitidos', () => {
  it('confere endereços e faixas IPv4 e IPv6', () => {
    const ips = new IpsPermitidos(['127.0.0.1', '10.0.0.0/8', '2001:db8::/32']);
    expect(ips.permite('127.0.0.1')).toBe(true);
    expect(ips.permite('::ffff:10.20.30.40')).toBe(true);
    expect(ips.permite('2001:db8::1')).toBe(true);
    expect(ips.permite('192.168.0.1')).toBe(false);
    expect(ips.permite('2001:db9::1')).toBe(false);
    expect(ips.permite(undefined)).toBe(false);
  });

  it('lista vazia não deixa ninguém entrar; faixa inválida derruba', () => {
    expect(new IpsPermitidos([]).permite('127.0.0.1')).toBe(false);
    expect(() => new IpsPermitidos(['10.0.0.0/33'])).toThrow(/inválida/);
    expect(() => new IpsPermitidos(['exemplo.org'])).toThrow(/inválida/);
  });
});
