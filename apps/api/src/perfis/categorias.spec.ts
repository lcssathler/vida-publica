import { TIPOS_EVENTO } from '../feed/evento';
import { CATEGORIAS, porCategoria } from './categorias';

describe('categorias do perfil', () => {
  it('cada um dos 15 tipos cai em exatamente uma categoria', () => {
    const tipos = Object.values(CATEGORIAS).flat();
    expect([...tipos].sort()).toEqual([...TIPOS_EVENTO].sort());
  });

  it('soma a contagem por tipo em cada categoria, sem omitir as vazias', () => {
    const resultado = porCategoria({
      voto_nominal: 3,
      voto_contra_orientacao: 1,
      doacao: 2,
    });
    expect(resultado.map((c) => [c.categoria, c.eventos])).toEqual([
      ['votos', 4],
      ['presenca', 0],
      ['gastos', 0],
      ['propostas', 0],
      ['campanha', 2],
      ['eleicoes', 0],
    ]);
    expect(resultado[0].porTipo).toEqual({
      voto_nominal: 3,
      voto_contra_orientacao: 1,
    });
  });
});
