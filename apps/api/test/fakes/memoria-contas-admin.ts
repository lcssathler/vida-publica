import { randomUUID } from 'node:crypto';
import {
  ContaAdmin,
  ContasAdminRepositorio,
  SessaoAdmin,
} from '../../src/admin/contas.repositorio';

/** Contas do painel em memória, com o mesmo contrato do adaptador Postgres. */
export class MemoriaContas extends ContasAdminRepositorio {
  contas = new Map<string, ContaAdmin>();
  sessoes = new Map<
    string,
    { id: string; usuarioId: string; expiraEm: Date; encerrada: boolean }
  >();

  porEmail(email: string) {
    return Promise.resolve(
      [...this.contas.values()].find((c) => c.email === email) ?? null,
    );
  }
  registrarFalha(id: string, bloquearAte: Date | null) {
    const c = this.contas.get(id)!;
    c.falhas = bloquearAte ? 0 : c.falhas + 1;
    if (bloquearAte) c.bloqueadoAte = bloquearAte;
    return Promise.resolve(c.falhas);
  }
  registrarAcesso(id: string, passo: number) {
    const c = this.contas.get(id)!;
    if (c.totpUltimoPasso >= passo) return Promise.resolve(false);
    Object.assign(c, { falhas: 0, bloqueadoAte: null, totpUltimoPasso: passo });
    return Promise.resolve(true);
  }
  criarSessao(
    usuarioId: string,
    tokenHash: string,
    _ip: unknown,
    expiraEm: Date,
  ) {
    const id = randomUUID();
    this.sessoes.set(tokenHash, { id, usuarioId, expiraEm, encerrada: false });
    return Promise.resolve(id);
  }
  sessaoAtiva(tokenHash: string): Promise<SessaoAdmin | null> {
    const s = this.sessoes.get(tokenHash);
    const c = s && this.contas.get(s.usuarioId);
    if (!s || !c || s.encerrada || !c.ativo) return Promise.resolve(null);
    return Promise.resolve({
      sessaoId: s.id,
      usuarioId: c.id,
      nome: c.nome,
      email: c.email,
      expiraEm: s.expiraEm,
    });
  }
  encerrarSessao(sessaoId: string) {
    for (const s of this.sessoes.values()) {
      if (s.id === sessaoId) s.encerrada = true;
    }
    return Promise.resolve();
  }
  criar(): Promise<string> {
    throw new Error('não usado');
  }
  redefinir(): Promise<boolean> {
    throw new Error('não usado');
  }
  desativar(): Promise<boolean> {
    throw new Error('não usado');
  }
}
