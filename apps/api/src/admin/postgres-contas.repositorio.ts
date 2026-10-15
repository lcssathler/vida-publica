import { Inject, Injectable } from '@nestjs/common';
import { Db } from '../db/db';
import {
  ContaAdmin,
  ContasAdminRepositorio,
  SessaoAdmin,
} from './contas.repositorio';

@Injectable()
export class PostgresContasAdminRepositorio extends ContasAdminRepositorio {
  constructor(@Inject(Db) private readonly db: Db) {
    super();
  }

  async porEmail(email: string): Promise<ContaAdmin | null> {
    const [linha] = await this.db.query<ContaAdmin>(
      `SELECT id, email, nome, senha_hash AS "senhaHash", totp_segredo AS "totpSegredo",
              totp_ultimo_passo::float8 AS "totpUltimoPasso", ativo, falhas,
              bloqueado_ate AS "bloqueadoAte"
         FROM admin.usuario WHERE email = lower($1)`,
      [email],
    );
    return linha ?? null;
  }

  async registrarFalha(id: string, bloquearAte: Date | null): Promise<number> {
    const [linha] = await this.db.query<{ falhas: number }>(
      `UPDATE admin.usuario
          SET falhas = CASE WHEN $2::timestamptz IS NULL THEN falhas + 1 ELSE 0 END,
              bloqueado_ate = coalesce($2::timestamptz, bloqueado_ate)
        WHERE id = $1 RETURNING falhas`,
      [id, bloquearAte],
    );
    return linha?.falhas ?? 0;
  }

  async registrarAcesso(id: string, passo: number): Promise<boolean> {
    const linhas = await this.db.query(
      `UPDATE admin.usuario
          SET falhas = 0, bloqueado_ate = NULL, totp_ultimo_passo = $2,
              ultimo_acesso_em = now()
        WHERE id = $1 AND totp_ultimo_passo < $2 RETURNING 1`,
      [id, passo],
    );
    return linhas.length === 1;
  }

  async criarSessao(
    usuarioId: string,
    tokenHash: string,
    ip: string | null,
    expiraEm: Date,
  ): Promise<string> {
    const [linha] = await this.db.query<{ id: string }>(
      `INSERT INTO admin.sessao (usuario_id, token_hash, ip, expira_em)
       VALUES ($1, $2, $3::inet, $4) RETURNING id`,
      [usuarioId, tokenHash, ip, expiraEm],
    );
    return linha.id;
  }

  async sessaoAtiva(tokenHash: string): Promise<SessaoAdmin | null> {
    const [linha] = await this.db.query<SessaoAdmin>(
      `SELECT s.id AS "sessaoId", u.id AS "usuarioId", u.nome, u.email,
              s.expira_em AS "expiraEm"
         FROM admin.sessao s JOIN admin.usuario u ON u.id = s.usuario_id
        WHERE s.token_hash = $1 AND s.encerrada_em IS NULL
          AND s.expira_em > now() AND u.ativo`,
      [tokenHash],
    );
    return linha ?? null;
  }

  async encerrarSessao(sessaoId: string): Promise<void> {
    await this.db.query(
      `UPDATE admin.sessao SET encerrada_em = now()
        WHERE id = $1 AND encerrada_em IS NULL`,
      [sessaoId],
    );
  }

  async criar(dados: {
    email: string;
    nome: string;
    senhaHash: string;
    totpSegredo: string;
  }): Promise<string> {
    const [linha] = await this.db.query<{ id: string }>(
      `INSERT INTO admin.usuario (email, nome, senha_hash, totp_segredo)
       VALUES (lower($1), $2, $3, $4) RETURNING id`,
      [dados.email, dados.nome, dados.senhaHash, dados.totpSegredo],
    );
    return linha.id;
  }

  async redefinir(
    email: string,
    dados: { senhaHash?: string; totpSegredo?: string },
  ): Promise<boolean> {
    return this.db.transacao(async (tx) => {
      const linhas = await tx.query<{ id: string }>(
        `UPDATE admin.usuario
            SET senha_hash = coalesce($2, senha_hash),
                totp_segredo = coalesce($3, totp_segredo),
                totp_ultimo_passo = CASE WHEN $3 IS NULL THEN totp_ultimo_passo ELSE 0 END,
                falhas = 0, bloqueado_ate = NULL, ativo = true
          WHERE email = lower($1) RETURNING id`,
        [email, dados.senhaHash ?? null, dados.totpSegredo ?? null],
      );
      if (linhas.length === 0) return false;
      await tx.query(
        `UPDATE admin.sessao SET encerrada_em = now()
          WHERE usuario_id = $1 AND encerrada_em IS NULL`,
        [linhas[0].id],
      );
      return true;
    });
  }

  async desativar(email: string): Promise<boolean> {
    return this.db.transacao(async (tx) => {
      const linhas = await tx.query<{ id: string }>(
        `UPDATE admin.usuario SET ativo = false WHERE email = lower($1) RETURNING id`,
        [email],
      );
      if (linhas.length === 0) return false;
      await tx.query(
        `UPDATE admin.sessao SET encerrada_em = now()
          WHERE usuario_id = $1 AND encerrada_em IS NULL`,
        [linhas[0].id],
      );
      return true;
    });
  }
}
