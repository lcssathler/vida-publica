import {
  ContaRepositorio,
  Preferencias,
  PREFERENCIAS_PADRAO,
  ResumoConta,
} from '../../src/conta/conta.repositorio';
import { MemoriaSeguindo } from './memoria-seguindo';
import { MemoriaUsuarios } from './memoria-usuarios';

/** Conta em memória, ligada aos fakes de usuários e de seguidos. */
export class MemoriaConta extends ContaRepositorio {
  readonly preferenciasPorUsuario = new Map<string, Preferencias>();

  constructor(
    private readonly usuarios: MemoriaUsuarios,
    private readonly seguindo: MemoriaSeguindo,
  ) {
    super();
  }

  async resumo(usuarioId: string): Promise<ResumoConta | null> {
    if (!this.usuarios.usuarios.has(usuarioId)) return null;
    const identidades = [...this.usuarios.identidades.entries()]
      .filter(([, dono]) => dono === usuarioId)
      .map(([chave]) => chave.split(':')[0] as 'apple' | 'google');
    const sessoesAtivas = [...this.usuarios.sessoes.values()].filter(
      (s) => s.usuarioId === usuarioId && !s.revogada,
    ).length;
    return {
      usuarioId,
      criadaEm: new Date(),
      identidades,
      seguindo: await this.seguindo.contar(usuarioId),
      sessoesAtivas,
    };
  }

  preferencias(usuarioId: string): Promise<Preferencias> {
    return Promise.resolve({
      ...(this.preferenciasPorUsuario.get(usuarioId) ?? PREFERENCIAS_PADRAO),
    });
  }

  async salvarPreferencias(
    usuarioId: string,
    mudancas: Partial<Preferencias>,
  ): Promise<Preferencias> {
    const atuais = await this.preferencias(usuarioId);
    const novas = { ...atuais, ...mudancas };
    this.preferenciasPorUsuario.set(usuarioId, novas);
    return novas;
  }

  /** Mesma cascata do banco: sessões, identidades, seguidos, preferências. */
  excluir(usuarioId: string): Promise<boolean> {
    const existia = this.usuarios.usuarios.delete(usuarioId);
    for (const [id, sessao] of this.usuarios.sessoes) {
      if (sessao.usuarioId === usuarioId) this.usuarios.sessoes.delete(id);
    }
    for (const [chave, dono] of this.usuarios.identidades) {
      if (dono === usuarioId) this.usuarios.identidades.delete(chave);
    }
    this.seguindo.seguidos.delete(usuarioId);
    this.preferenciasPorUsuario.delete(usuarioId);
    return Promise.resolve(existia);
  }
}
