import { Inject, Injectable } from '@nestjs/common';
import { Db } from '../db/db';
import { DispositivosRepositorio } from './dispositivos.repositorio';
import { Plataforma } from './enviador';

@Injectable()
export class PostgresDispositivosRepositorio extends DispositivosRepositorio {
  constructor(@Inject(Db) private readonly db: Db) {
    super();
  }

  registrar(
    sessaoId: string,
    token: string,
    plataforma: Plataforma,
  ): Promise<void> {
    return this.db.transacao(async (tx) => {
      await tx.query(
        'DELETE FROM app.dispositivo WHERE token = $1 AND sessao_id <> $2',
        [token, sessaoId],
      );
      await tx.query(
        `INSERT INTO app.dispositivo (sessao_id, token, plataforma) VALUES ($1, $2, $3)
         ON CONFLICT (sessao_id) DO UPDATE
           SET token = EXCLUDED.token, plataforma = EXCLUDED.plataforma,
               registrado_em = now()`,
        [sessaoId, token, plataforma],
      );
    });
  }

  async remover(sessaoId: string): Promise<boolean> {
    const linhas = await this.db.query(
      'DELETE FROM app.dispositivo WHERE sessao_id = $1 RETURNING 1',
      [sessaoId],
    );
    return linhas.length > 0;
  }

  async daSessao(
    sessaoId: string,
  ): Promise<{ plataforma: Plataforma; registradoEm: Date } | null> {
    const [linha] = await this.db.query<{
      plataforma: Plataforma;
      registrado_em: Date;
    }>(
      'SELECT plataforma, registrado_em FROM app.dispositivo WHERE sessao_id = $1',
      [sessaoId],
    );
    return linha
      ? { plataforma: linha.plataforma, registradoEm: linha.registrado_em }
      : null;
  }
}
