import {
  cortar,
  linkDoEvento,
  textoDoAviso,
  textoSeguro,
  TIPOS_AVISO,
  TIPOS_RESUMO,
} from './regras';

describe('regras dos avisos', () => {
  it('dinheiro e despesas vão para o resumo, nunca para o push', () => {
    for (const tipo of TIPOS_RESUMO) {
      expect(TIPOS_AVISO as readonly string[]).not.toContain(tipo);
    }
    expect(TIPOS_AVISO as readonly string[]).not.toContain('presenca');
    expect(TIPOS_AVISO as readonly string[]).not.toContain('proposta_parada');
  });

  it('texto: título do feed, resumo e a chamada para a fonte', () => {
    expect(
      textoDoAviso({
        titulo: 'Missionário José Olimpio votou Sim — PLP 74/2026',
        resumo:
          'Aprovada a Subemenda. Sim: 346; Não: 46; Abstenção: 3; Total: 395.',
      }),
    ).toEqual({
      titulo: 'Missionário José Olimpio votou Sim — PLP 74/2026',
      corpo:
        'Aprovada a Subemenda. Sim: 346; Não: 46; Abstenção: 3; Total: 395. Toque para ver a fonte.',
    });
    expect(
      textoDoAviso({
        titulo: 'CAPI: não eleito para Senador (AP) em 2026',
        resumo: null,
      }),
    ).toEqual({
      titulo: 'CAPI: não eleito para Senador (AP) em 2026',
      corpo: 'Toque para ver a fonte.',
    });
  });

  it('corta textos longos na palavra, com reticências', () => {
    const longo = 'palavra '.repeat(40);
    const cortado = cortar(longo, 50);
    expect(cortado.length).toBeLessThanOrEqual(50);
    expect(cortado.endsWith('palavra…')).toBe(true);
    expect(cortar('  curto   demais ', 50)).toBe('curto demais');
    const { titulo, corpo } = textoDoAviso({ titulo: longo, resumo: longo });
    expect(titulo.length).toBeLessThanOrEqual(110);
    expect(corpo.length).toBeLessThanOrEqual(150 + 24);
  });

  it('recusa texto com algo parecido com CPF', () => {
    const base = {
      titulo: 'Fulano recebeu R$ 4.961.519.777,00',
      corpo: 'Total: 388.',
    };
    expect(textoSeguro(base)).toBe(true);
    expect(textoSeguro({ ...base, corpo: 'Doador 123.456.789-09' })).toBe(
      false,
    );
    expect(textoSeguro({ ...base, titulo: 'Doador 12345678909' })).toBe(false);
    expect(textoSeguro({ ...base, titulo: 'Requerimento nº 4140/2026' })).toBe(
      true,
    );
  });

  it('link abre o registro no app', () => {
    expect(linkDoEvento('0b7d…')).toBe('vidapublica://evento/0b7d…');
  });
});
