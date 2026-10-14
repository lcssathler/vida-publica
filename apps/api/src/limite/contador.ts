export interface Registro {
  permitido: boolean;
  limite: number;
  restantes: number;
  /** Segundos até a janela reiniciar. */
  reiniciaEm: number;
}

/**
 * Porta: conta requisições por chave numa janela fixa. O adaptador em memória
 * vale para uma instância só; com mais de uma, troca-se por um contador
 * compartilhado (Redis, Postgres) sem mexer na guarda.
 */
export abstract class ContadorRequisicoes {
  abstract registrar(
    chave: string,
    max: number,
    janelaMs: number,
    agora?: number,
  ): Registro;
}

const TETO_CHAVES = 50_000;

export class ContadorEmMemoria extends ContadorRequisicoes {
  private readonly janelas = new Map<string, { inicio: number; n: number }>();

  registrar(
    chave: string,
    max: number,
    janelaMs: number,
    agora = Date.now(),
  ): Registro {
    let janela = this.janelas.get(chave);
    if (!janela || agora - janela.inicio >= janelaMs) {
      if (!janela && this.janelas.size >= TETO_CHAVES)
        this.limpar(agora, janelaMs);
      janela = { inicio: agora, n: 0 };
      this.janelas.set(chave, janela);
    }
    janela.n += 1;
    return {
      permitido: janela.n <= max,
      limite: max,
      restantes: Math.max(0, max - janela.n),
      reiniciaEm: Math.ceil((janela.inicio + janelaMs - agora) / 1000),
    };
  }

  /** Descarta janelas vencidas; se ainda estiver cheio, as mais antigas. */
  private limpar(agora: number, janelaMs: number): void {
    for (const [chave, janela] of this.janelas) {
      if (agora - janela.inicio >= janelaMs) this.janelas.delete(chave);
    }
    const excesso = this.janelas.size - TETO_CHAVES / 2;
    if (excesso > 0) {
      const chaves = [...this.janelas.keys()].slice(0, excesso);
      for (const chave of chaves) this.janelas.delete(chave);
    }
  }
}
