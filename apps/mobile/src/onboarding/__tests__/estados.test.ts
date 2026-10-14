import { ESTADOS_POR_NOME, estadoDoCep, formatarCep } from '../estados';

describe('estadoDoCep', () => {
  it.each([
    ['01310-100', 'SP'],
    ['20040-020', 'RJ'],
    ['30130-010', 'MG'],
    ['70040-010', 'DF'],
    ['73000-000', 'DF'],
    ['72800-000', 'GO'],
    ['69301-000', 'RR'],
    ['69400-000', 'AM'],
    ['68900-000', 'AP'],
    ['76800-000', 'RO'],
    ['99999-999', 'RS'],
  ])('%s fica em %s', (cep, uf) => {
    expect(estadoDoCep(cep)).toBe(uf);
  });

  it('incompleto ou fora das faixas: null', () => {
    expect(estadoDoCep('0131')).toBeNull();
    expect(estadoDoCep('00000-000')).toBeNull();
  });

  it('formata enquanto digita e ignora o que não é número', () => {
    expect(formatarCep('0131')).toBe('0131');
    expect(formatarCep('01310100')).toBe('01310-100');
    expect(formatarCep('01.310-100 x')).toBe('01310-100');
  });

  it('lista os 27 estados por nome', () => {
    expect(ESTADOS_POR_NOME).toHaveLength(27);
    expect(ESTADOS_POR_NOME[0]).toBe('AC');
    expect(ESTADOS_POR_NOME.at(-1)).toBe('TO');
  });
});
