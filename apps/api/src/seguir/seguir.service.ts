import { Inject, Injectable } from '@nestjs/common';
import { Alvo } from './alvo';
import {
  AlvoSeguido,
  Assunto,
  SeguindoRepositorio,
} from './seguindo.repositorio';

/** Teto por usuário: protege o feed (consulta por alvos) e o banco. */
export const LIMITE_SEGUINDO = 500;

export class AlvoInexistente extends Error {}

export class LimiteSeguindo extends Error {}

@Injectable()
export class SeguirService {
  constructor(
    @Inject(SeguindoRepositorio)
    private readonly seguindo: SeguindoRepositorio,
  ) {}

  listar(usuarioId: string): Promise<AlvoSeguido[]> {
    return this.seguindo.listar(usuarioId);
  }

  /** Segue um alvo que existe no canon. Seguir de novo não faz nada. */
  async seguir(usuarioId: string, alvo: Alvo): Promise<boolean> {
    if (!(await this.seguindo.existe(alvo))) throw new AlvoInexistente();
    if ((await this.seguindo.contar(usuarioId)) >= LIMITE_SEGUINDO) {
      throw new LimiteSeguindo();
    }
    return this.seguindo.seguir(usuarioId, alvo);
  }

  segue(usuarioId: string, alvo: Alvo): Promise<boolean> {
    return this.seguindo.segue(usuarioId, alvo);
  }

  deixar(usuarioId: string, alvo: Alvo): Promise<boolean> {
    return this.seguindo.deixar(usuarioId, alvo);
  }

  assuntos(): Promise<Assunto[]> {
    return this.seguindo.assuntos();
  }
}
