import { Inject, Injectable } from '@nestjs/common';
import {
  ContaRepositorio,
  Preferencias,
  ResumoConta,
} from './conta.repositorio';

export interface Conta extends ResumoConta {
  anonima: boolean;
  preferencias: Preferencias;
}

@Injectable()
export class ContaService {
  constructor(
    @Inject(ContaRepositorio) private readonly repositorio: ContaRepositorio,
  ) {}

  async conta(usuarioId: string): Promise<Conta | null> {
    const [resumo, preferencias] = await Promise.all([
      this.repositorio.resumo(usuarioId),
      this.repositorio.preferencias(usuarioId),
    ]);
    if (!resumo) return null;
    return {
      ...resumo,
      anonima: resumo.identidades.length === 0,
      preferencias,
    };
  }

  preferencias(usuarioId: string): Promise<Preferencias> {
    return this.repositorio.preferencias(usuarioId);
  }

  salvarPreferencias(
    usuarioId: string,
    mudancas: Partial<Preferencias>,
  ): Promise<Preferencias> {
    return this.repositorio.salvarPreferencias(usuarioId, mudancas);
  }

  /**
   * Exclusão definitiva (LGPD): usuário, sessões, refresh tokens, logins
   * vinculados, o que segue e preferências. As sessões somem junto, então o
   * token de acesso deixa de valer na hora.
   */
  excluir(usuarioId: string): Promise<boolean> {
    return this.repositorio.excluir(usuarioId);
  }
}
