import { Inject, Injectable } from '@nestjs/common';
import { PREFERENCIAS_PADRAO } from '../conta/conta.repositorio';
import { Db, Executor } from '../db/db';
import { Dispositivo } from './enviador';
import {
  Decisao,
  Enfileiramento,
  FilaDoUsuario,
  FilaRepositorio,
  ParametrosEnfileirar,
  Pendente,
  PreferenciasAviso,
} from './fila.repositorio';

/**
 * Um aviso por usuário e evento publicado na janela, para quem seguia um alvo
 * do evento antes da publicação (sem aviso retroativo de quem passou a seguir
 * depois) e não desligou os avisos. Visibilidade "seguidores" está coberta: só
 * quem segue um alvo entra. O fato precisa ser recente na publicação e não
 * pode estar mais adiante que depois de amanhã (a mesma régua do feed).
 */
const ENFILEIRAR = `
INSERT INTO app.notificacao (usuario_id, evento_id, tipo, criada_em, enviar_apos)
SELECT DISTINCT s.usuario_id, e.id, e.tipo, $5::timestamptz, $5::timestamptz
  FROM feed.evento e
  JOIN feed.evento_alvo a ON a.evento_id = e.id
  JOIN app.seguindo s ON s.alvo_tipo = a.alvo_tipo AND s.alvo_id = a.alvo_id
                     AND s.criado_em <= e.publicado_em
  LEFT JOIN app.preferencias p ON p.usuario_id = s.usuario_id
 WHERE e.status = 'publicado'
   AND e.fonte_url IS NOT NULL
   AND e.publicado_em > $1 AND e.publicado_em <= $2
   AND e.tipo = ANY($3::text[])
   AND e.ocorrido_em >= e.publicado_em - make_interval(days => $4)
   AND e.ocorrido_em <= $2::timestamptz + interval '2 days'
   AND coalesce(p.notificacoes, true)
ON CONFLICT (usuario_id, evento_id) DO NOTHING`;

@Injectable()
export class PostgresFilaRepositorio extends FilaRepositorio {
  constructor(@Inject(Db) private readonly db: Db) {
    super();
  }

  enfileirar(p: ParametrosEnfileirar): Promise<Enfileiramento> {
    return this.db.transacao(async (tx) => {
      const [cursor] = await tx.query<{
        iniciado_em: Date;
        publicado_ate: Date;
      }>(
        `SELECT iniciado_em, publicado_ate FROM app.notificacao_cursor
          WHERE nome = 'eventos' FOR UPDATE`,
      );
      if (!cursor) {
        // Primeira execução: tudo o que já estava publicado fica sem aviso.
        await tx.query(
          `INSERT INTO app.notificacao_cursor (nome, iniciado_em, publicado_ate)
           VALUES ('eventos', $1, $1) ON CONFLICT (nome) DO NOTHING`,
          [p.ate],
        );
        return { inicial: true, enfileiradas: 0, desde: null, ate: p.ate };
      }
      // Relê a margem antes do cursor, mas nunca antes da primeira execução.
      const desde = new Date(
        Math.max(
          cursor.publicado_ate.getTime() - p.margemMs,
          cursor.iniciado_em.getTime(),
        ),
      );
      const inseridas = await tx.query(`${ENFILEIRAR} RETURNING 1`, [
        desde,
        p.ate,
        p.tipos,
        p.frescorDias,
        p.ate,
      ]);
      await tx.query(
        `UPDATE app.notificacao_cursor
            SET publicado_ate = greatest(publicado_ate, $1), atualizado_em = now()
          WHERE nome = 'eventos'`,
        [p.ate],
      );
      return {
        inicial: false,
        enfileiradas: inseridas.length,
        desde,
        ate: p.ate,
      };
    });
  }

  async usuariosComPendentes(
    agora: Date,
    limite: number,
    excluir: readonly string[],
  ): Promise<string[]> {
    const linhas = await this.db.query<{ usuario_id: string }>(
      `SELECT usuario_id FROM app.notificacao
        WHERE status = 'pendente' AND enviar_apos <= $1
          AND NOT (usuario_id = ANY($3::uuid[]))
        GROUP BY usuario_id
        ORDER BY min(enviar_apos), usuario_id
        LIMIT $2`,
      [agora, limite, excluir],
    );
    return linhas.map((l) => l.usuario_id);
  }

  comUsuario<T>(
    usuarioId: string,
    fn: (fila: FilaDoUsuario) => Promise<T>,
  ): Promise<T | null> {
    return this.db.transacao(async (tx) => {
      if (!(await travarUsuario(tx, usuarioId))) return null;
      return fn(new FilaPostgres(tx, usuarioId));
    });
  }
}

class FilaPostgres implements FilaDoUsuario {
  constructor(
    private readonly tx: Executor,
    private readonly usuarioId: string,
  ) {}

  preferencias(): Promise<PreferenciasAviso> {
    return lerPreferencias(this.tx, this.usuarioId);
  }

  async pendentes(agora: Date): Promise<Pendente[]> {
    const linhas = await this.tx.query<{
      id: string;
      evento_id: string;
      tipo: string;
      tentativas: number;
      titulo: string;
      resumo: string | null;
      publicado: boolean;
      segue: boolean;
    }>(
      `SELECT n.id::text AS id, n.evento_id, n.tipo, n.tentativas, e.titulo, e.resumo,
              (e.status = 'publicado' AND e.fonte_url IS NOT NULL) AS publicado,
              EXISTS (SELECT 1 FROM feed.evento_alvo a
                        JOIN app.seguindo s ON s.alvo_tipo = a.alvo_tipo
                                           AND s.alvo_id = a.alvo_id
                       WHERE a.evento_id = n.evento_id AND s.usuario_id = n.usuario_id)
                AS segue
         FROM app.notificacao n
         JOIN feed.evento e ON e.id = n.evento_id
        WHERE n.usuario_id = $1 AND n.status = 'pendente' AND n.enviar_apos <= $2
        ORDER BY n.criada_em, e.ocorrido_em, n.id
          FOR UPDATE OF n`,
      [this.usuarioId, agora],
    );
    return linhas.map((l) => ({
      id: l.id,
      eventoId: l.evento_id,
      tipo: l.tipo,
      tentativas: l.tentativas,
      titulo: l.titulo,
      resumo: l.resumo,
      publicado: l.publicado,
      segue: l.segue,
    }));
  }

  dispositivos(): Promise<Dispositivo[]> {
    return lerDispositivos(this.tx, this.usuarioId);
  }

  async enviadasDesde(instante: Date): Promise<number> {
    const [linha] = await this.tx.query<{ n: number }>(
      `SELECT count(*)::integer AS n FROM app.notificacao
        WHERE usuario_id = $1 AND status = 'enviada' AND enviada_em >= $2`,
      [this.usuarioId, instante],
    );
    return linha.n;
  }

  async registrar(decisoes: Decisao[]): Promise<void> {
    for (const d of decisoes) {
      switch (d.status) {
        case 'enviada':
          await this.tx.query(
            `UPDATE app.notificacao
                SET status = 'enviada', motivo = NULL, enviada_em = $2, titulo = $3,
                    corpo = $4, dispositivos = $5, tentativas = tentativas + 1,
                    atualizada_em = now()
              WHERE id = $1`,
            [d.id, d.em, d.titulo, d.corpo, d.dispositivos],
          );
          break;
        case 'pendente':
          await this.tx.query(
            `UPDATE app.notificacao
                SET motivo = $2, enviar_apos = $3, tentativas = $4, atualizada_em = now()
              WHERE id = $1`,
            [d.id, d.motivo, d.enviarApos, d.tentativas],
          );
          break;
        default:
          await this.tx.query(
            `UPDATE app.notificacao
                SET status = $2, motivo = $3, atualizada_em = now()
              WHERE id = $1`,
            [d.id, d.status, d.motivo],
          );
      }
    }
  }

  removerDispositivo(token: string): Promise<void> {
    return apagarDispositivo(this.tx, token);
  }
}

/** Preferências de aviso do usuário (padrões da conta sem linha gravada). */
export async function lerPreferencias(
  tx: Executor,
  usuarioId: string,
): Promise<PreferenciasAviso> {
  const [linha] = await tx.query<{
    notificacoes: boolean;
    resumo_semanal: boolean;
    max_por_dia: number;
    silencio_inicio: string;
    silencio_fim: string;
    fuso: string;
  }>(
    `SELECT notificacoes, resumo_semanal, max_por_dia,
            to_char(silencio_inicio, 'HH24:MI') AS silencio_inicio,
            to_char(silencio_fim, 'HH24:MI') AS silencio_fim, fuso
       FROM app.preferencias WHERE usuario_id = $1`,
    [usuarioId],
  );
  if (!linha) {
    const p = PREFERENCIAS_PADRAO;
    return {
      notificacoes: p.notificacoes,
      resumoSemanal: p.resumoSemanal,
      maxPorDia: p.maxPorDia,
      silencioInicio: p.silencioInicio,
      silencioFim: p.silencioFim,
      fuso: p.fuso,
    };
  }
  return {
    notificacoes: linha.notificacoes,
    resumoSemanal: linha.resumo_semanal,
    maxPorDia: linha.max_por_dia,
    silencioInicio: linha.silencio_inicio,
    silencioFim: linha.silencio_fim,
    fuso: linha.fuso,
  };
}

/** Aparelhos das sessões ativas do usuário. */
export async function lerDispositivos(
  tx: Executor,
  usuarioId: string,
): Promise<Dispositivo[]> {
  const linhas = await tx.query<{
    sessao_id: string;
    token: string;
    plataforma: Dispositivo['plataforma'];
  }>(
    `SELECT d.sessao_id, d.token, d.plataforma
       FROM app.dispositivo d
       JOIN app.sessao s ON s.id = d.sessao_id
      WHERE s.usuario_id = $1 AND s.revogada_em IS NULL
      ORDER BY d.registrado_em`,
    [usuarioId],
  );
  return linhas.map((l) => ({
    sessaoId: l.sessao_id,
    token: l.token,
    plataforma: l.plataforma,
  }));
}

/** Apaga o aparelho cujo token o FCM disse que não vale mais. */
export async function apagarDispositivo(
  tx: Executor,
  token: string,
): Promise<void> {
  await tx.query('DELETE FROM app.dispositivo WHERE token = $1', [token]);
}

/** Trava o usuário na transação; false se outro notificador está com ele. */
export async function travarUsuario(
  tx: Executor,
  usuarioId: string,
): Promise<boolean> {
  const [trava] = await tx.query<{ ok: boolean }>(
    `SELECT pg_try_advisory_xact_lock(hashtextextended('notificacao:' || $1, 0)) AS ok`,
    [usuarioId],
  );
  return trava.ok;
}
