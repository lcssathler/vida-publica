import { Inject, Injectable } from '@nestjs/common';
import { Db, Executor } from '../db/db';
import {
  MotivoRevogacao,
  Plataforma,
  Provedor,
  ResultadoRotacao,
  SessaoCriada,
  UsuariosRepositorio,
} from './usuarios.repositorio';

/**
 * O que passa da conta anônima para a conta de destino numa fusão ($1 =
 * origem, $2 = destino). O resto da origem some com ela, em cascata.
 */
const FUSOES: readonly string[] = [
  `INSERT INTO app.seguindo (usuario_id, alvo_tipo, alvo_id, criado_em)
   SELECT $2, alvo_tipo, alvo_id, criado_em FROM app.seguindo WHERE usuario_id = $1
   ON CONFLICT DO NOTHING`,
];

@Injectable()
export class PostgresUsuariosRepositorio extends UsuariosRepositorio {
  constructor(@Inject(Db) private readonly db: Db) {
    super();
  }

  criarAnonimo(
    plataforma: Plataforma | null,
    refreshHash: string,
    refreshExpiraEm: Date,
  ): Promise<SessaoCriada> {
    return this.db.transacao(async (tx) => {
      const [usuario] = await tx.query<{ id: string }>(
        'INSERT INTO app.usuario DEFAULT VALUES RETURNING id',
      );
      const [sessao] = await tx.query<{ id: string }>(
        'INSERT INTO app.sessao (usuario_id, plataforma) VALUES ($1, $2) RETURNING id',
        [usuario.id, plataforma],
      );
      await inserirRefresh(tx, sessao.id, refreshHash, refreshExpiraEm);
      return { usuarioId: usuario.id, sessaoId: sessao.id };
    });
  }

  rotacionar(
    hashAtual: string,
    hashNovo: string,
    novoExpiraEm: Date,
  ): Promise<ResultadoRotacao> {
    return this.db.transacao(async (tx) => {
      // Trava o token: duas renovações simultâneas com o mesmo token não
      // passam as duas.
      const [token] = await tx.query<{
        sessao_id: string;
        usado: boolean;
        expirado: boolean;
        usuario_id: string;
        revogada: boolean;
      }>(
        `SELECT t.sessao_id, t.usado_em IS NOT NULL AS usado,
                t.expira_em <= now() AS expirado, s.usuario_id,
                s.revogada_em IS NOT NULL AS revogada
           FROM app.refresh_token t
           JOIN app.sessao s ON s.id = t.sessao_id
          WHERE t.hash = $1
          FOR UPDATE OF t, s`,
        [hashAtual],
      );
      if (!token || token.revogada || token.expirado) {
        return { status: 'invalido' };
      }
      if (token.usado) {
        await revogar(tx, token.sessao_id, 'reuso');
        return { status: 'reusado' };
      }
      await tx.query(
        'UPDATE app.refresh_token SET usado_em = now() WHERE hash = $1',
        [hashAtual],
      );
      await inserirRefresh(tx, token.sessao_id, hashNovo, novoExpiraEm);
      await tx.query('UPDATE app.sessao SET usada_em = now() WHERE id = $1', [
        token.sessao_id,
      ]);
      return {
        status: 'ok',
        usuarioId: token.usuario_id,
        sessaoId: token.sessao_id,
      };
    });
  }

  novoRefresh(sessaoId: string, hash: string, expiraEm: Date): Promise<void> {
    return this.db.transacao(async (tx) => {
      await tx.query(
        'DELETE FROM app.refresh_token WHERE sessao_id = $1 AND usado_em IS NULL',
        [sessaoId],
      );
      await inserirRefresh(tx, sessaoId, hash, expiraEm);
    });
  }

  async revogarSessao(
    sessaoId: string,
    motivo: MotivoRevogacao,
  ): Promise<void> {
    await revogar(this.db, sessaoId, motivo);
  }

  async sessaoAtiva(sessaoId: string, usuarioId: string): Promise<boolean> {
    const linhas = await this.db.query(
      `SELECT 1 FROM app.sessao
        WHERE id = $1 AND usuario_id = $2 AND revogada_em IS NULL`,
      [sessaoId, usuarioId],
    );
    return linhas.length > 0;
  }

  async usuarioDaIdentidade(
    provedor: Provedor,
    sujeito: string,
  ): Promise<string | null> {
    const [linha] = await this.db.query<{ usuario_id: string }>(
      'SELECT usuario_id FROM app.identidade WHERE provedor = $1 AND sujeito = $2',
      [provedor, sujeito],
    );
    return linha?.usuario_id ?? null;
  }

  async temIdentidade(usuarioId: string): Promise<boolean> {
    const linhas = await this.db.query(
      'SELECT 1 FROM app.identidade WHERE usuario_id = $1 LIMIT 1',
      [usuarioId],
    );
    return linhas.length > 0;
  }

  async vincularIdentidade(
    usuarioId: string,
    provedor: Provedor,
    sujeito: string,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO app.identidade (provedor, sujeito, usuario_id) VALUES ($1, $2, $3)
       ON CONFLICT (provedor, sujeito) DO NOTHING`,
      [provedor, sujeito, usuarioId],
    );
  }

  moverSessao(
    sessaoId: string,
    origemId: string,
    destinoId: string,
    fundir: boolean,
  ): Promise<void> {
    return this.db.transacao(async (tx) => {
      await tx.query(
        'UPDATE app.sessao SET usuario_id = $1 WHERE id = $2 AND usuario_id = $3',
        [destinoId, sessaoId, origemId],
      );
      if (!fundir) return;
      for (const fusao of FUSOES) await tx.query(fusao, [origemId, destinoId]);
      // Outras sessões da conta anônima (não deveria haver) vão junto.
      await tx.query(
        'UPDATE app.sessao SET usuario_id = $2 WHERE usuario_id = $1',
        [origemId, destinoId],
      );
      await tx.query('DELETE FROM app.usuario WHERE id = $1', [origemId]);
    });
  }
}

async function inserirRefresh(
  tx: Executor,
  sessaoId: string,
  hash: string,
  expiraEm: Date,
): Promise<void> {
  await tx.query(
    'INSERT INTO app.refresh_token (hash, sessao_id, expira_em) VALUES ($1, $2, $3)',
    [hash, sessaoId, expiraEm],
  );
}

async function revogar(
  executor: Executor,
  sessaoId: string,
  motivo: MotivoRevogacao,
): Promise<void> {
  await executor.query(
    `UPDATE app.sessao SET revogada_em = now(), motivo_revogacao = $2
      WHERE id = $1 AND revogada_em IS NULL`,
    [sessaoId, motivo],
  );
}
