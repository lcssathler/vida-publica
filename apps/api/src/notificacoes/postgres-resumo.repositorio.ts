import { Inject, Injectable } from '@nestjs/common';
import { PREFERENCIAS_PADRAO } from '../conta/conta.repositorio';
import { Db, Executor } from '../db/db';
import { Dispositivo } from './enviador';
import { PreferenciasAviso } from './fila.repositorio';
import {
  apagarDispositivo,
  lerDispositivos,
  lerPreferencias,
  travarUsuario,
} from './postgres-fila.repositorio';
import { TotalPorTipo } from './resumo';
import {
  DecisaoResumo,
  NovoResumo,
  ResumoDevido,
  ResumoDoUsuario,
  ResumoPendente,
  ResumoRepositorio,
} from './resumo.repositorio';

/**
 * Quem segue algo e ainda não tem o resumo da semana anterior, quando no fuso
 * da conta já é segunda-feira depois da hora de envio. date_trunc('week')
 * começa na segunda; a semana resumida é a anterior a ela.
 */
const DEVIDOS = `
WITH local AS (
  SELECT s.usuario_id, coalesce(p.fuso, $5) AS fuso,
         ($1::timestamptz AT TIME ZONE coalesce(p.fuso, $5)) AS agora_local
    FROM (SELECT DISTINCT usuario_id FROM app.seguindo) s
    LEFT JOIN app.preferencias p USING (usuario_id)
   WHERE NOT (s.usuario_id = ANY($4::uuid[]))
), semana AS (
  SELECT usuario_id, fuso, agora_local,
         (date_trunc('week', agora_local) - interval '7 days')::date AS semana
    FROM local
)
SELECT usuario_id, fuso, to_char(semana, 'YYYY-MM-DD') AS semana
  FROM semana w
 WHERE agora_local >= date_trunc('week', agora_local) + make_interval(mins => $2)
   AND NOT EXISTS (SELECT 1 FROM app.resumo_semanal r
                    WHERE r.usuario_id = w.usuario_id AND r.semana = w.semana)
 ORDER BY usuario_id
 LIMIT $3`;

@Injectable()
export class PostgresResumoRepositorio extends ResumoRepositorio {
  constructor(@Inject(Db) private readonly db: Db) {
    super();
  }

  async devidos(
    agora: Date,
    horaMinutos: number,
    limite: number,
    excluir: readonly string[],
  ): Promise<ResumoDevido[]> {
    const linhas = await this.db.query<{
      usuario_id: string;
      fuso: string;
      semana: string;
    }>(DEVIDOS, [
      agora,
      horaMinutos,
      limite,
      excluir,
      PREFERENCIAS_PADRAO.fuso,
    ]);
    return linhas.map((l) => ({
      usuarioId: l.usuario_id,
      fuso: l.fuso,
      semana: l.semana,
    }));
  }

  async usuariosComPendentes(
    agora: Date,
    limite: number,
    excluir: readonly string[],
  ): Promise<string[]> {
    const linhas = await this.db.query<{ usuario_id: string }>(
      `SELECT usuario_id FROM app.resumo_semanal
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
    fn: (resumo: ResumoDoUsuario) => Promise<T>,
  ): Promise<T | null> {
    return this.db.transacao(async (tx) => {
      if (!(await travarUsuario(tx, usuarioId))) return null;
      return fn(new ResumoPostgres(tx, usuarioId));
    });
  }
}

class ResumoPostgres implements ResumoDoUsuario {
  constructor(
    private readonly tx: Executor,
    private readonly usuarioId: string,
  ) {}

  preferencias(): Promise<PreferenciasAviso> {
    return lerPreferencias(this.tx, this.usuarioId);
  }

  async totais(
    desde: Date,
    ate: Date,
    tipos: readonly string[],
  ): Promise<TotalPorTipo[]> {
    // Cada evento uma vez, mesmo com vários alvos seguidos; só o que foi
    // publicado depois do início da fila (a carga inicial não entra) e depois
    // de a pessoa passar a seguir.
    const linhas = await this.tx.query<{
      tipo: string;
      registros: number;
      valor: string | null;
    }>(
      `SELECT tipo, count(*)::integer AS registros, sum(valor)::text AS valor
         FROM (SELECT DISTINCT e.id, e.tipo, e.valor
                 FROM feed.evento e
                 JOIN feed.evento_alvo a ON a.evento_id = e.id
                 JOIN app.seguindo s ON s.alvo_tipo = a.alvo_tipo AND s.alvo_id = a.alvo_id
                                    AND s.usuario_id = $1 AND s.criado_em <= e.publicado_em
                WHERE e.status = 'publicado' AND e.fonte_url IS NOT NULL
                  AND e.tipo = ANY($4::text[])
                  AND e.publicado_em >= $2 AND e.publicado_em < $3
                  AND e.publicado_em > coalesce(
                    (SELECT iniciado_em FROM app.notificacao_cursor WHERE nome = 'eventos'),
                    'infinity')) x
        GROUP BY tipo
        ORDER BY tipo`,
      [this.usuarioId, desde, ate, tipos],
    );
    return linhas.map((l) => ({
      tipo: l.tipo,
      registros: l.registros,
      valor: l.valor === null ? null : Number(l.valor),
    }));
  }

  async excedentes(desde: Date, ate: Date): Promise<number> {
    const [linha] = await this.tx.query<{ n: number }>(
      `SELECT count(*)::integer AS n FROM app.notificacao
        WHERE usuario_id = $1 AND status = 'resumo' AND motivo = 'teto'
          AND criada_em >= $2 AND criada_em < $3`,
      [this.usuarioId, desde, ate],
    );
    return linha.n;
  }

  async criar(semana: string, resumo: NovoResumo): Promise<boolean> {
    const pendente = resumo.status === 'pendente' ? resumo : null;
    const linhas = await this.tx.query(
      `INSERT INTO app.resumo_semanal (usuario_id, semana, status, motivo, conteudo, titulo,
                                       corpo, url, enviar_apos)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, now()))
       ON CONFLICT (usuario_id, semana) DO NOTHING RETURNING 1`,
      [
        this.usuarioId,
        semana,
        resumo.status,
        resumo.status === 'descartado'
          ? resumo.motivo
          : (pendente?.motivo ?? null),
        JSON.stringify(resumo.conteudo),
        pendente?.titulo ?? null,
        pendente?.corpo ?? null,
        pendente?.url ?? null,
        pendente?.enviarApos ?? null,
      ],
    );
    return linhas.length > 0;
  }

  async pendentes(agora: Date): Promise<ResumoPendente[]> {
    const linhas = await this.tx.query<{
      semana: string;
      titulo: string;
      corpo: string;
      url: string;
      tentativas: number;
    }>(
      `SELECT to_char(semana, 'YYYY-MM-DD') AS semana, titulo, corpo, url, tentativas
         FROM app.resumo_semanal
        WHERE usuario_id = $1 AND status = 'pendente' AND enviar_apos <= $2
        ORDER BY semana
          FOR UPDATE`,
      [this.usuarioId, agora],
    );
    return linhas;
  }

  dispositivos(): Promise<Dispositivo[]> {
    return lerDispositivos(this.tx, this.usuarioId);
  }

  async registrar(semana: string, d: DecisaoResumo): Promise<void> {
    switch (d.status) {
      case 'enviado':
        await this.tx.query(
          `UPDATE app.resumo_semanal
              SET status = 'enviado', motivo = NULL, enviado_em = $3, dispositivos = $4,
                  tentativas = tentativas + 1, atualizado_em = now()
            WHERE usuario_id = $1 AND semana = $2`,
          [this.usuarioId, semana, d.em, d.dispositivos],
        );
        break;
      case 'pendente':
        await this.tx.query(
          `UPDATE app.resumo_semanal
              SET motivo = $3, enviar_apos = $4, tentativas = $5, atualizado_em = now()
            WHERE usuario_id = $1 AND semana = $2`,
          [this.usuarioId, semana, d.motivo, d.enviarApos, d.tentativas],
        );
        break;
      default:
        await this.tx.query(
          `UPDATE app.resumo_semanal
              SET status = $3, motivo = $4, atualizado_em = now()
            WHERE usuario_id = $1 AND semana = $2`,
          [this.usuarioId, semana, d.status, d.motivo],
        );
    }
  }

  removerDispositivo(token: string): Promise<void> {
    return apagarDispositivo(this.tx, token);
  }
}
