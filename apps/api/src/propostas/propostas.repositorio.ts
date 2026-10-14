export interface Autor {
  nome: string;
  tipo: string | null;
  proponente: boolean | null;
  /** A pessoa no canon, quando o autor é parlamentar casado. */
  pessoa: { id: string; nome: string } | null;
}

export interface PropostaDados {
  id: string;
  casa: 'camara' | 'senado';
  identificacao: string;
  siglaTipo: string;
  numero: number | null;
  ano: number | null;
  descricaoTipo: string | null;
  ementa: string | null;
  ementaDetalhada: string | null;
  apelido: string | null;
  apresentadaEm: string | null;
  situacao: string | null;
  situacaoEm: string | null;
  orgao: string | null;
  regime: string | null;
  tramitando: boolean | null;
  urlInteiroTeor: string | null;
  autores: Autor[];
  temas: string[];
  /** Proposta principal, quando esta tramita apensada a outra. */
  principal: { id: string; identificacao: string } | null;
  fonte: { url: string };
}

export interface ItemTramitacao {
  tipo: 'tramitacao';
  data: Date;
  orgao: string | null;
  descricao: string;
  situacao: string | null;
  despacho: string | null;
  /** Documento da etapa, quando a fonte informa. */
  url: string | null;
  /** Evento publicado do feed que destaca esta etapa (relator, parecer...). */
  eventoId: string | null;
}

export interface ItemVotacao {
  tipo: 'votacao';
  data: Date;
  orgao: string | null;
  descricao: string | null;
  /** true aprovada, false rejeitada, null sem resultado informado. */
  aprovada: boolean | null;
  nominal: boolean;
  placar: {
    sim: number;
    nao: number;
    abstencao: number;
    outros: number;
  } | null;
  fonte: { url: string };
}

/** Porta de leitura das propostas no canon. */
export abstract class PropostasRepositorio {
  abstract proposta(id: string): Promise<PropostaDados | null>;

  /** Tramitações (todas, na ordem da fonte) e votações da proposta. */
  abstract historico(id: string): Promise<Array<ItemTramitacao | ItemVotacao>>;
}
