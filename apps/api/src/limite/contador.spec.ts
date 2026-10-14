import { ContadorEmMemoria } from './contador';

describe('ContadorEmMemoria', () => {
  it('permite até o máximo na janela e recusa o resto', () => {
    const contador = new ContadorEmMemoria();
    const t0 = 1_000_000;
    const registros = [1, 2, 3].map(() =>
      contador.registrar('a', 2, 60_000, t0),
    );
    expect(registros.map((r) => [r.permitido, r.restantes])).toEqual([
      [true, 1],
      [true, 0],
      [false, 0],
    ]);
    expect(registros[2].reiniciaEm).toBe(60);
  });

  it('reinicia quando a janela vence', () => {
    const contador = new ContadorEmMemoria();
    contador.registrar('a', 1, 60_000, 0);
    expect(contador.registrar('a', 1, 60_000, 59_999).permitido).toBe(false);
    expect(contador.registrar('a', 1, 60_000, 60_000).permitido).toBe(true);
  });

  it('conta cada chave separadamente', () => {
    const contador = new ContadorEmMemoria();
    contador.registrar('a', 1, 60_000, 0);
    expect(contador.registrar('b', 1, 60_000, 0).permitido).toBe(true);
  });
});
