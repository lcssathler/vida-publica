import { Alvo } from '../../src/seguir/alvo';
import {
  AlvoSeguido,
  Assunto,
  SeguindoRepositorio,
} from '../../src/seguir/seguindo.repositorio';

const chave = (alvo: Alvo) => `${alvo.tipo}:${alvo.id}`;

/** Seguidos em memória, com um catálogo fictício de alvos que "existem". */
export class MemoriaSeguindo extends SeguindoRepositorio {
  readonly catalogo = new Map<
    string,
    { nome: string; detalhe: string | null }
  >();
  readonly seguidos = new Map<string, Map<string, Alvo & { desde: Date }>>();

  /** Registra um alvo como existente no canon. */
  cadastrar(alvo: Alvo, nome: string, detalhe: string | null = null): Alvo {
    this.catalogo.set(chave(alvo), { nome, detalhe });
    return alvo;
  }

  /** Para ligar em MemoriaUsuarios.aoFundir. */
  fundir = (origem: string, destino: string): void => {
    const deOrigem = this.seguidos.get(origem);
    if (!deOrigem) return;
    const deDestino = this.do(destino);
    for (const [k, item] of deOrigem)
      if (!deDestino.has(k)) deDestino.set(k, item);
    this.seguidos.delete(origem);
  };

  private do(usuarioId: string): Map<string, Alvo & { desde: Date }> {
    let mapa = this.seguidos.get(usuarioId);
    if (!mapa) {
      mapa = new Map();
      this.seguidos.set(usuarioId, mapa);
    }
    return mapa;
  }

  listar(usuarioId: string): Promise<AlvoSeguido[]> {
    const itens = [...this.do(usuarioId).values()].map((item) => {
      const info = this.catalogo.get(chave(item));
      return {
        tipo: item.tipo,
        id: item.id,
        nome: info?.nome ?? item.id,
        detalhe: info?.detalhe ?? null,
        desde: item.desde,
      };
    });
    return Promise.resolve(itens.reverse());
  }

  contar(usuarioId: string): Promise<number> {
    return Promise.resolve(this.do(usuarioId).size);
  }

  existe(alvo: Alvo): Promise<boolean> {
    return Promise.resolve(this.catalogo.has(chave(alvo)));
  }

  segue(usuarioId: string, alvo: Alvo): Promise<boolean> {
    return Promise.resolve(this.do(usuarioId).has(chave(alvo)));
  }

  seguir(usuarioId: string, alvo: Alvo): Promise<boolean> {
    const mapa = this.do(usuarioId);
    if (mapa.has(chave(alvo))) return Promise.resolve(false);
    mapa.set(chave(alvo), { ...alvo, desde: new Date() });
    return Promise.resolve(true);
  }

  deixar(usuarioId: string, alvo: Alvo): Promise<boolean> {
    return Promise.resolve(this.do(usuarioId).delete(chave(alvo)));
  }

  assuntos(): Promise<Assunto[]> {
    return Promise.resolve(
      [...this.catalogo.entries()]
        .filter(([k]) => k.startsWith('assunto:'))
        .map(([, info]) => ({ nome: info.nome, proposicoes: 1 })),
    );
  }
}
