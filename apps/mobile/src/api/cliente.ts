import { ErroApi, ErroLimite, ErroRede, segundosRetryAfter } from './erros';
import type { ParDeTokens, Plataforma } from './tipos';

/** Onde o refresh token fica guardado (armazenamento seguro do aparelho). */
export interface Cofre {
  ler(): Promise<string | null>;
  gravar(refresh: string): Promise<void>;
  apagar(): Promise<void>;
}

export interface OpcoesCliente {
  baseUrl: string;
  cofre: Cofre;
  plataforma: Plataforma;
  fetch?: typeof fetch;
  agora?: () => number;
  esperar?: (ms: number) => Promise<void>;
  /** Retry-After até este valor (s) é esperado uma vez sem avisar a tela. */
  esperaAutomatica?: number;
  /** Tempo máximo de uma requisição, em ms. */
  tempoLimite?: number;
  /** A API recusou o refresh (reuso ou expirado): a conta do aparelho foi trocada. */
  aoEncerrarSessao?: () => void;
}

type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Renova o token de acesso quando faltar menos que isso para expirar. */
const MARGEM_MS = 60_000;

/**
 * Cliente HTTP da API. Cuida da sessão:
 * - primeira abertura: cria a conta anônima (POST /auth/anonimo);
 * - o refresh token só fica no cofre; o token de acesso, só na memória;
 * - renova antes de expirar e depois de um 401, uma renovação por vez, e grava
 *   o par novo que cada renovação devolve (o antigo deixa de valer);
 * - 429: espera o Retry-After curto uma vez; acima disso, ErroLimite.
 */
export class ClienteApi {
  private readonly fetch: typeof fetch;
  private readonly agora: () => number;
  private readonly esperar: (ms: number) => Promise<void>;
  private acesso: { token: string; expiraEm: number } | null = null;
  private usuario: string | null = null;
  private renovacao: Promise<void> | null = null;
  private readonly ouvintes = new Set<() => void>();

  constructor(private readonly opcoes: OpcoesCliente) {
    if (opcoes.aoEncerrarSessao) this.ouvintes.add(opcoes.aoEncerrarSessao);
    this.fetch = opcoes.fetch ?? ((...args) => fetch(...args));
    this.agora = opcoes.agora ?? Date.now;
    this.esperar = opcoes.esperar ?? ((ms) => new Promise((ok) => setTimeout(ok, ms)));
  }

  get usuarioId(): string | null {
    return this.usuario;
  }

  /** Garante uma sessão válida (cria a conta anônima na primeira abertura). */
  async iniciar(): Promise<string> {
    await this.tokenValido();
    return this.usuario as string;
  }

  /** Avisa quando a API recusa o refresh e a conta do aparelho é trocada. */
  ouvirEncerramento(ouvinte: () => void): () => void {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  }

  get<T>(caminho: string): Promise<T> {
    return this.pedir<T>('GET', caminho);
  }

  put<T>(caminho: string, corpo?: unknown): Promise<T> {
    return this.pedir<T>('PUT', caminho, corpo);
  }

  patch<T>(caminho: string, corpo: unknown): Promise<T> {
    return this.pedir<T>('PATCH', caminho, corpo);
  }

  post<T>(caminho: string, corpo?: unknown): Promise<T> {
    return this.pedir<T>('POST', caminho, corpo);
  }

  delete(caminho: string): Promise<void> {
    return this.pedir<void>('DELETE', caminho);
  }

  /** Adota um par recebido fora da renovação (login Apple ou Google). */
  async adotar(par: ParDeTokens): Promise<void> {
    await this.aplicar(par);
  }

  /** Esquece a sessão no aparelho (depois de sair ou excluir a conta). */
  async esquecer(): Promise<void> {
    this.acesso = null;
    this.usuario = null;
    await this.opcoes.cofre.apagar();
  }

  async pedir<T>(metodo: Metodo, caminho: string, corpo?: unknown): Promise<T> {
    for (let tentativa = 0; ; tentativa++) {
      const token = await this.tokenValido();
      const resposta = await this.chamar(metodo, caminho, corpo, token);
      if (resposta.status === 401 && tentativa === 0) {
        // Só renova se ninguém renovou enquanto esta requisição ia e voltava.
        if (this.acesso?.token === token) this.acesso = null;
        continue;
      }
      if (resposta.status === 429) {
        const segundos = segundosRetryAfter(resposta.headers.get('Retry-After'), this.agora());
        if (tentativa === 0 && segundos <= (this.opcoes.esperaAutomatica ?? 5)) {
          await this.esperar(segundos * 1000);
          continue;
        }
        throw new ErroLimite(segundos);
      }
      return this.ler<T>(resposta);
    }
  }

  private async tokenValido(): Promise<string> {
    if (!this.acesso || this.acesso.expiraEm - this.agora() < MARGEM_MS) {
      this.renovacao ??= this.renovar().finally(() => {
        this.renovacao = null;
      });
      await this.renovacao;
    }
    return (this.acesso as { token: string }).token;
  }

  private async renovar(): Promise<void> {
    const refresh = await this.opcoes.cofre.ler();
    if (refresh) {
      const resposta = await this.chamar('POST', '/auth/renovar', { refresh }, null);
      if (resposta.ok) {
        await this.aplicar(await this.ler<ParDeTokens>(resposta));
        return;
      }
      if (resposta.status === 429) {
        throw new ErroLimite(segundosRetryAfter(resposta.headers.get('Retry-After'), this.agora()));
      }
      // Outros erros (rede, 5xx) mantêm o refresh para tentar de novo.
      if (resposta.status !== 401) await this.ler(resposta);
      // Refresh recusado (já usado ou expirado): a API encerrou a sessão.
      await this.esquecer();
      this.ouvintes.forEach((ouvinte) => ouvinte());
    }
    const resposta = await this.chamar(
      'POST',
      '/auth/anonimo',
      { plataforma: this.opcoes.plataforma },
      null,
    );
    if (resposta.status === 429) {
      throw new ErroLimite(segundosRetryAfter(resposta.headers.get('Retry-After'), this.agora()));
    }
    await this.aplicar(await this.ler<ParDeTokens>(resposta));
  }

  private async aplicar(par: ParDeTokens): Promise<void> {
    // O refresh vai para o cofre antes de qualquer outro uso do par.
    await this.opcoes.cofre.gravar(par.refresh.token);
    this.usuario = par.usuarioId;
    this.acesso = { token: par.acesso.token, expiraEm: Date.parse(par.acesso.expiraEm) };
  }

  private async chamar(
    metodo: Metodo,
    caminho: string,
    corpo: unknown,
    token: string | null,
  ): Promise<Response> {
    const cabecalhos: Record<string, string> = { Accept: 'application/json' };
    if (token) cabecalhos.Authorization = `Bearer ${token}`;
    if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), this.opcoes.tempoLimite ?? 15_000);
    try {
      return await this.fetch(`${this.opcoes.baseUrl}${caminho}`, {
        method: metodo,
        headers: cabecalhos,
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: controle.signal,
      });
    } catch {
      throw new ErroRede();
    } finally {
      clearTimeout(relogio);
    }
  }

  private async ler<T>(resposta: Response): Promise<T> {
    if (resposta.ok) {
      if (resposta.status === 204) return undefined as T;
      return (await resposta.json()) as T;
    }
    let mensagem = `Erro ${resposta.status}`;
    try {
      const corpo = (await resposta.json()) as { message?: string | string[] };
      if (corpo.message) {
        mensagem = Array.isArray(corpo.message) ? corpo.message.join('; ') : corpo.message;
      }
    } catch {
      // corpo sem JSON: fica a mensagem genérica
    }
    throw new ErroApi(resposta.status, mensagem);
  }
}
