import { Inject, Injectable } from '@nestjs/common';
import { Provedor } from '../auth/usuarios.repositorio';
import { Db } from '../db/db';
import {
  ContaRepositorio,
  Preferencias,
  PREFERENCIAS_PADRAO,
  ResumoConta,
} from './conta.repositorio';

interface LinhaPreferencias {
  uf: Preferencias['uf'];
  notificacoes: boolean;
  resumo_semanal: boolean;
  max_por_dia: number;
  silencio_inicio: string;
  silencio_fim: string;
  fuso: Preferencias['fuso'];
}

/** Campo da API → coluna. Só estes nomes entram no SQL. */
const COLUNAS: Record<keyof Preferencias, keyof LinhaPreferencias> = {
  uf: 'uf',
  notificacoes: 'notificacoes',
  resumoSemanal: 'resumo_semanal',
  maxPorDia: 'max_por_dia',
  silencioInicio: 'silencio_inicio',
  silencioFim: 'silencio_fim',
  fuso: 'fuso',
};

const SELECIONA = `uf, notificacoes, resumo_semanal, max_por_dia,
  to_char(silencio_inicio, 'HH24:MI') AS silencio_inicio,
  to_char(silencio_fim, 'HH24:MI') AS silencio_fim, fuso`;

function dePreferencias(l: LinhaPreferencias): Preferencias {
  return {
    uf: l.uf,
    notificacoes: l.notificacoes,
    resumoSemanal: l.resumo_semanal,
    maxPorDia: l.max_por_dia,
    silencioInicio: l.silencio_inicio,
    silencioFim: l.silencio_fim,
    fuso: l.fuso,
  };
}

@Injectable()
export class PostgresContaRepositorio extends ContaRepositorio {
  constructor(@Inject(Db) private readonly db: Db) {
    super();
  }

  async resumo(usuarioId: string): Promise<ResumoConta | null> {
    const [linha] = await this.db.query<{
      criado_em: Date;
      identidades: Provedor[];
      seguindo: number;
      sessoes: number;
    }>(
      `SELECT u.criado_em,
              coalesce((SELECT array_agg(i.provedor ORDER BY i.provedor)
                          FROM app.identidade i WHERE i.usuario_id = u.id), '{}')
                AS identidades,
              (SELECT count(*)::integer FROM app.seguindo s WHERE s.usuario_id = u.id)
                AS seguindo,
              (SELECT count(*)::integer FROM app.sessao s
                WHERE s.usuario_id = u.id AND s.revogada_em IS NULL) AS sessoes
         FROM app.usuario u WHERE u.id = $1`,
      [usuarioId],
    );
    if (!linha) return null;
    return {
      usuarioId,
      criadaEm: linha.criado_em,
      identidades: linha.identidades,
      seguindo: linha.seguindo,
      sessoesAtivas: linha.sessoes,
    };
  }

  async preferencias(usuarioId: string): Promise<Preferencias> {
    const [linha] = await this.db.query<LinhaPreferencias>(
      `SELECT ${SELECIONA} FROM app.preferencias WHERE usuario_id = $1`,
      [usuarioId],
    );
    return linha ? dePreferencias(linha) : { ...PREFERENCIAS_PADRAO };
  }

  async salvarPreferencias(
    usuarioId: string,
    mudancas: Partial<Preferencias>,
  ): Promise<Preferencias> {
    const campos = (Object.keys(COLUNAS) as Array<keyof Preferencias>).filter(
      (campo) => mudancas[campo] !== undefined,
    );
    if (campos.length === 0) return this.preferencias(usuarioId);
    const colunas = campos.map((campo) => COLUNAS[campo]);
    const marcadores = campos.map((_, i) => `$${i + 2}`);
    const [linha] = await this.db.query<LinhaPreferencias>(
      `INSERT INTO app.preferencias (usuario_id, ${colunas.join(', ')})
       VALUES ($1, ${marcadores.join(', ')})
       ON CONFLICT (usuario_id) DO UPDATE SET
         ${colunas.map((c) => `${c} = EXCLUDED.${c}`).join(', ')},
         atualizado_em = now()
       RETURNING ${SELECIONA}`,
      [usuarioId, ...campos.map((campo) => mudancas[campo])],
    );
    return dePreferencias(linha);
  }

  async excluir(usuarioId: string): Promise<boolean> {
    const linhas = await this.db.query(
      'DELETE FROM app.usuario WHERE id = $1 RETURNING 1',
      [usuarioId],
    );
    return linhas.length > 0;
  }
}
