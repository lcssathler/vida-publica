import { DispositivosRepositorio } from '../../src/notificacoes/dispositivos.repositorio';
import { Plataforma } from '../../src/notificacoes/enviador';
import { MemoriaUsuarios } from './memoria-usuarios';

interface Registro {
  token: string;
  plataforma: Plataforma;
  registradoEm: Date;
}

/**
 * Aparelhos em memória, com a semântica do banco: um por sessão, token único,
 * apagado quando a sessão é encerrada ou some (exclusão da conta).
 */
export class MemoriaDispositivos extends DispositivosRepositorio {
  readonly porSessao = new Map<string, Registro>();

  constructor(private readonly usuarios: MemoriaUsuarios) {
    super();
    usuarios.aoRevogar.push((sessaoId) => this.porSessao.delete(sessaoId));
  }

  /** Cascata: sessão apagada leva o aparelho. */
  private limpar(): void {
    for (const sessaoId of this.porSessao.keys()) {
      if (!this.usuarios.sessoes.has(sessaoId)) this.porSessao.delete(sessaoId);
    }
  }

  registrar(
    sessaoId: string,
    token: string,
    plataforma: Plataforma,
  ): Promise<void> {
    for (const [outra, r] of this.porSessao) {
      if (r.token === token && outra !== sessaoId) this.porSessao.delete(outra);
    }
    this.porSessao.set(sessaoId, {
      token,
      plataforma,
      registradoEm: new Date(),
    });
    return Promise.resolve();
  }

  remover(sessaoId: string): Promise<boolean> {
    return Promise.resolve(this.porSessao.delete(sessaoId));
  }

  daSessao(
    sessaoId: string,
  ): Promise<{ plataforma: Plataforma; registradoEm: Date } | null> {
    this.limpar();
    const r = this.porSessao.get(sessaoId);
    return Promise.resolve(
      r ? { plataforma: r.plataforma, registradoEm: r.registradoEm } : null,
    );
  }

  /** Tokens registrados (para os testes). */
  tokens(): string[] {
    this.limpar();
    return [...this.porSessao.values()].map((r) => r.token);
  }
}
