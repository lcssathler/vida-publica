import { consultaTextual, identificacaoDeProposta, normalizar } from './termos';

describe('termos da busca', () => {
  it('normaliza acento, caixa e espaços', () => {
    expect(normalizar('  Reforma   TRIBUTÁRIA  ')).toBe('reforma tributaria');
    expect(normalizar('Ação Coração')).toBe('acao coracao');
  });

  it('monta consulta textual com prefixo na última palavra', () => {
    expect(consultaTextual('reforma trib')).toBe('reforma & trib:*');
    expect(consultaTextual('saúde')).toBe('saude:*');
  });

  it('não deixa passar sintaxe do to_tsquery', () => {
    expect(consultaTextual("a' | b & !c <-> (d)")).toBe('a & b & c & d:*');
    expect(consultaTextual('!!! ???')).toBeNull();
  });

  it.each([
    ['PL 2338/2023', { sigla: 'PL', numero: 2338, ano: 2023 }],
    ['pl2338', { sigla: 'PL', numero: 2338, ano: null }],
    ['PEC 45/19', { sigla: 'PEC', numero: 45, ano: 2019 }],
    ['plp 74 / 2026', { sigla: 'PLP', numero: 74, ano: 2026 }],
    ['PDL 1/98', { sigla: 'PDL', numero: 1, ano: 1998 }],
  ])('reconhece a identificação %s', (texto, esperado) => {
    expect(identificacaoDeProposta(texto)).toEqual(esperado);
  });

  it.each(['reforma tributaria', 'PL', '2338', 'pl 2338/2023 saude'])(
    'não confunde %s com identificação',
    (texto) => {
      expect(identificacaoDeProposta(texto)).toBeNull();
    },
  );
});
