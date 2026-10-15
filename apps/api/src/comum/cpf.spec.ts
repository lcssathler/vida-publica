import { pareceCpf, semCpf } from './cpf';

describe('CPF em texto livre', () => {
  it('acha CPF formatado ou com 11 dígitos', () => {
    expect(pareceCpf('meu cpf é 123.456.789-09')).toBe(true);
    expect(pareceCpf('12345678909')).toBe(true);
    expect(pareceCpf('doador 12345678909, ok')).toBe(true);
  });

  it('não confunde com CNPJ, valores ou protocolos', () => {
    expect(pareceCpf('CNPJ 12.345.678/0001-90')).toBe(false);
    expect(pareceCpf('CNPJ 12345678000190')).toBe(false);
    expect(pareceCpf('R$ 1.234.567,89')).toBe(false);
    expect(pareceCpf('PL 2338/2023')).toBe(false);
  });

  it('troca cada ocorrência', () => {
    expect(semCpf('a 123.456.789-09 b 98765432100')).toBe(
      'a [CPF removido] b [CPF removido]',
    );
    expect(semCpf('sem nada')).toBe('sem nada');
  });
});
