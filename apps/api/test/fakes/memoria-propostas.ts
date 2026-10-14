import {
  ItemTramitacao,
  ItemVotacao,
  PropostaDados,
  PropostasRepositorio,
} from '../../src/propostas/propostas.repositorio';

export class MemoriaPropostas extends PropostasRepositorio {
  readonly propostas = new Map<string, PropostaDados>();
  readonly historicos = new Map<string, Array<ItemTramitacao | ItemVotacao>>();

  proposta(id: string): Promise<PropostaDados | null> {
    return Promise.resolve(this.propostas.get(id) ?? null);
  }

  historico(id: string): Promise<Array<ItemTramitacao | ItemVotacao>> {
    return Promise.resolve(this.historicos.get(id) ?? []);
  }
}
