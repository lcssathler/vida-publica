import { randomUUID } from 'node:crypto';
import {
  MotivoRevogacao,
  Plataforma,
  Provedor,
  ResultadoRotacao,
  SessaoCriada,
  UsuariosRepositorio,
} from '../../src/auth/usuarios.repositorio';

interface Sessao {
  usuarioId: string;
  plataforma: Plataforma | null;
  revogada: MotivoRevogacao | null;
}

interface Refresh {
  sessaoId: string;
  expiraEm: Date;
  usado: boolean;
}

/** Adaptador em memória com a mesma semântica do Postgres, para testes. */
export class MemoriaUsuarios extends UsuariosRepositorio {
  readonly usuarios = new Set<string>();
  readonly sessoes = new Map<string, Sessao>();
  readonly refreshs = new Map<string, Refresh>();
  readonly identidades = new Map<string, string>();
  /** Chamado na fusão de contas (os outros módulos registram o que mover). */
  readonly aoFundir: Array<(origem: string, destino: string) => void> = [];

  criarAnonimo(
    plataforma: Plataforma | null,
    refreshHash: string,
    refreshExpiraEm: Date,
  ): Promise<SessaoCriada> {
    const usuarioId = randomUUID();
    const sessaoId = randomUUID();
    this.usuarios.add(usuarioId);
    this.sessoes.set(sessaoId, { usuarioId, plataforma, revogada: null });
    this.refreshs.set(refreshHash, {
      sessaoId,
      expiraEm: refreshExpiraEm,
      usado: false,
    });
    return Promise.resolve({ usuarioId, sessaoId });
  }

  rotacionar(
    hashAtual: string,
    hashNovo: string,
    novoExpiraEm: Date,
  ): Promise<ResultadoRotacao> {
    const token = this.refreshs.get(hashAtual);
    const sessao = token && this.sessoes.get(token.sessaoId);
    if (!token || !sessao || sessao.revogada || token.expiraEm <= new Date()) {
      return Promise.resolve({ status: 'invalido' });
    }
    if (token.usado) {
      sessao.revogada = 'reuso';
      return Promise.resolve({ status: 'reusado' });
    }
    token.usado = true;
    this.refreshs.set(hashNovo, {
      sessaoId: token.sessaoId,
      expiraEm: novoExpiraEm,
      usado: false,
    });
    return Promise.resolve({
      status: 'ok',
      usuarioId: sessao.usuarioId,
      sessaoId: token.sessaoId,
    });
  }

  novoRefresh(sessaoId: string, hash: string, expiraEm: Date): Promise<void> {
    for (const [chave, token] of this.refreshs) {
      if (token.sessaoId === sessaoId && !token.usado) {
        this.refreshs.delete(chave);
      }
    }
    this.refreshs.set(hash, { sessaoId, expiraEm, usado: false });
    return Promise.resolve();
  }

  revogarSessao(sessaoId: string, motivo: MotivoRevogacao): Promise<void> {
    const sessao = this.sessoes.get(sessaoId);
    if (sessao && !sessao.revogada) sessao.revogada = motivo;
    return Promise.resolve();
  }

  sessaoAtiva(sessaoId: string, usuarioId: string): Promise<boolean> {
    const sessao = this.sessoes.get(sessaoId);
    return Promise.resolve(
      !!sessao && sessao.usuarioId === usuarioId && !sessao.revogada,
    );
  }

  usuarioDaIdentidade(
    provedor: Provedor,
    sujeito: string,
  ): Promise<string | null> {
    return Promise.resolve(
      this.identidades.get(`${provedor}:${sujeito}`) ?? null,
    );
  }

  temIdentidade(usuarioId: string): Promise<boolean> {
    return Promise.resolve([...this.identidades.values()].includes(usuarioId));
  }

  vincularIdentidade(
    usuarioId: string,
    provedor: Provedor,
    sujeito: string,
  ): Promise<void> {
    const chave = `${provedor}:${sujeito}`;
    if (!this.identidades.has(chave)) this.identidades.set(chave, usuarioId);
    return Promise.resolve();
  }

  moverSessao(
    sessaoId: string,
    origemId: string,
    destinoId: string,
    fundir: boolean,
  ): Promise<void> {
    const sessao = this.sessoes.get(sessaoId);
    if (sessao?.usuarioId === origemId) sessao.usuarioId = destinoId;
    if (fundir) {
      for (const fusao of this.aoFundir) fusao(origemId, destinoId);
      for (const outra of this.sessoes.values()) {
        if (outra.usuarioId === origemId) outra.usuarioId = destinoId;
      }
      this.usuarios.delete(origemId);
    }
    return Promise.resolve();
  }
}
