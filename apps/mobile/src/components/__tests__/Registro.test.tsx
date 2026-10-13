import { render, screen } from '@testing-library/react-native';
import { CarimboFonte } from '../CarimboFonte';
import { Registro } from '../Registro';

const fonte = { sigla: 'Câmara', nome: 'Câmara dos Deputados', data: '2026-10-08' };

describe('Registro', () => {
  it('é lido pelo leitor de tela como uma frase completa com a fonte', async () => {
    await render(
      <Registro
        tipo="Votação nominal"
        hora="14:32"
        manchete="Maria Exemplo votou Não na PEC 0/2026"
        contexto="Contra a orientação do partido."
        fonte={fonte}
        protocolo="2026·1008·0001"
        coletadoEm="2026-10-13"
      />,
    );
    expect(
      screen.getByLabelText(
        'Votação nominal. Maria Exemplo votou Não na PEC 0/2026. ' +
          'Contra a orientação do partido. Fonte: Câmara dos Deputados',
      ),
    ).toBeOnTheScreen();
  });

  it('mostra a data de coleta no formato brasileiro e o protocolo', async () => {
    await render(
      <Registro
        tipo="Pauta"
        hora="09:10"
        manchete="PL 0000/2026 entra na pauta"
        fonte={fonte}
        protocolo="2026·1013·0002"
        coletadoEm="2026-10-13"
      />,
    );
    expect(screen.getByText('coletado 13/10/2026 · Nº 2026·1013·0002')).toBeOnTheScreen();
  });
});

describe('CarimboFonte', () => {
  it('mostra sigla e data abreviada e lê a data por extenso', async () => {
    await render(<CarimboFonte {...fonte} />);
    expect(screen.getByText('Câmara · 08 OUT 2026')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Fonte: Câmara dos Deputados, dado de 8 de outubro de 2026'),
    ).toBeOnTheScreen();
  });
});
