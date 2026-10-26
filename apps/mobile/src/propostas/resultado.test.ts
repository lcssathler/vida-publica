import { resultadoDaVotacao } from './resultado';

describe('objeto da votação', () => {
  it('não confunde subemenda, requerimento e projeto', () => {
    expect(resultadoDaVotacao(false, 'Rejeitada a Subemenda Substitutiva ao Projeto de Lei.'))
      .toEqual({ rotulo: 'Subemenda', valor: 'Rejeitada' });
    expect(resultadoDaVotacao(false, 'Rejeitado o Requerimento.'))
      .toEqual({ rotulo: 'Requerimento', valor: 'Rejeitado' });
    expect(resultadoDaVotacao(true, 'Aprovado o Projeto de Lei.'))
      .toEqual({ rotulo: 'Projeto nesta votação', valor: 'Aprovado' });
  });

  it('não classifica o resultado do projeto por palavras citadas no meio da descrição', () => {
    expect(resultadoDaVotacao(false, 'Parecer sobre projeto e subemenda.'))
      .toEqual({ rotulo: 'Nesta votação', valor: 'Rejeitado' });
    expect(resultadoDaVotacao(true, null))
      .toEqual({ rotulo: 'Nesta votação', valor: 'Aprovado' });
  });
});
