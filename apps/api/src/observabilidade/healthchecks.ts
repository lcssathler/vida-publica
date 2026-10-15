/**
 * Sinal de vida no healthchecks.io: um check por processo (slug), criado no
 * primeiro ping. Sucesso a cada volta; /fail quando a volta falha. Se os
 * pings param (processo travado ou fora do ar), o healthchecks.io avisa.
 * Sem chave, o sinal fica só no log e no arquivo do healthcheck do contêiner.
 */
export interface SinalDeVida {
  ping(ok: boolean, texto?: string): Promise<void>;
}

export class SemSinalExterno implements SinalDeVida {
  ping(): Promise<void> {
    return Promise.resolve();
  }
}

export class PingHealthchecks implements SinalDeVida {
  constructor(
    private readonly chave: string,
    private readonly slug: string,
    private readonly base = 'https://hc-ping.com',
    private readonly aoFalhar: (msg: Record<string, unknown>) => void = () =>
      undefined,
    private readonly buscar: typeof fetch = fetch,
  ) {}

  async ping(ok: boolean, texto = ''): Promise<void> {
    const url = `${this.base.replace(/\/$/, '')}/${this.chave}/${this.slug}${ok ? '' : '/fail'}?create=1`;
    try {
      const resposta = await this.buscar(url, {
        method: 'POST',
        body: texto.slice(0, 10_000),
        signal: AbortSignal.timeout(10_000),
      });
      if (!resposta.ok) {
        this.aoFalhar({
          msg: 'ping ao healthchecks.io recusado',
          status: resposta.status,
        });
      }
    } catch (erro) {
      // Sem a chave na mensagem: só o tipo do erro.
      this.aoFalhar({
        msg: 'ping ao healthchecks.io falhou',
        erro: erro instanceof Error ? erro.name : 'desconhecido',
      });
    }
  }
}
