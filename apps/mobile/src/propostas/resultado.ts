/** Só nomeia o objeto quando ele está explícito no início da descrição oficial. */
export function resultadoDaVotacao(aprovada: boolean, descricao?: string | null) {
  const inicio = descricao?.trim() ?? '';
  const objetos = [
    { padrao: /^(?:aprovad[ao]|rejeitad[ao])\s+(?:a\s+)?subemenda\b/i, nome: 'Subemenda', feminino: true },
    { padrao: /^(?:aprovad[ao]|rejeitad[ao])\s+(?:a\s+)?emenda\b/i, nome: 'Emenda', feminino: true },
    { padrao: /^(?:aprovad[ao]|rejeitad[ao])\s+(?:o\s+)?requerimento\b/i, nome: 'Requerimento', feminino: false },
    { padrao: /^(?:aprovad[ao]|rejeitad[ao])\s+(?:o\s+)?substitutivo\b/i, nome: 'Substitutivo', feminino: false },
    { padrao: /^(?:aprovad[ao]|rejeitad[ao])\s+(?:o\s+)?projeto\b/i, nome: 'Projeto nesta votação', feminino: false },
  ];
  const objeto = objetos.find((o) => o.padrao.test(inicio));
  return {
    rotulo: objeto?.nome ?? 'Nesta votação',
    valor: `${aprovada ? 'Aprovad' : 'Rejeitad'}${objeto?.feminino ? 'a' : 'o'}`,
  };
}
