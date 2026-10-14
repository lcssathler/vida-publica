import { Inject, Injectable } from '@nestjs/common';
import { Db } from '../db/db';
import { Alvo, AlvoTipo } from './alvo';
import {
  AlvoSeguido,
  Assunto,
  SeguindoRepositorio,
} from './seguindo.repositorio';

const EXISTE: Record<AlvoTipo, string> = {
  pessoa: 'SELECT 1 FROM canon.pessoa WHERE id = $1::uuid',
  partido: 'SELECT 1 FROM canon.partido WHERE id = $1::integer',
  proposicao: 'SELECT 1 FROM canon.proposicao WHERE id = $1::uuid',
  assunto: 'SELECT 1 FROM canon.proposicao_tema WHERE tema = $1 LIMIT 1',
};

@Injectable()
export class PostgresSeguindoRepositorio extends SeguindoRepositorio {
  constructor(@Inject(Db) private readonly db: Db) {
    super();
  }

  async listar(usuarioId: string): Promise<AlvoSeguido[]> {
    const linhas = await this.db.query<{
      alvo_tipo: AlvoTipo;
      alvo_id: string;
      nome: string | null;
      detalhe: string | null;
      criado_em: Date;
    }>(
      `SELECT s.alvo_tipo, s.alvo_id, s.criado_em,
              CASE s.alvo_tipo
                WHEN 'pessoa' THEN coalesce(pe.nome_exibicao, pe.nome_civil)
                WHEN 'partido' THEN pa.sigla
                WHEN 'proposicao' THEN pr.identificacao
                ELSE s.alvo_id
              END AS nome,
              CASE s.alvo_tipo
                WHEN 'pessoa' THEN (
                  SELECT m.cargo || coalesce(' · ' || m.uf, '')
                    FROM canon.mandato m
                   WHERE m.pessoa_id = pe.id
                   ORDER BY m.em_exercicio DESC, m.inicio DESC NULLS LAST
                   LIMIT 1)
                WHEN 'partido' THEN pa.nome
                WHEN 'proposicao' THEN pr.ementa
              END AS detalhe
         FROM app.seguindo s
         LEFT JOIN canon.pessoa pe
           ON pe.id = CASE WHEN s.alvo_tipo = 'pessoa' THEN s.alvo_id::uuid END
         LEFT JOIN canon.partido pa
           ON pa.id = CASE WHEN s.alvo_tipo = 'partido' THEN s.alvo_id::integer END
         LEFT JOIN canon.proposicao pr
           ON pr.id = CASE WHEN s.alvo_tipo = 'proposicao' THEN s.alvo_id::uuid END
        WHERE s.usuario_id = $1
        ORDER BY s.criado_em DESC, s.alvo_tipo, s.alvo_id`,
      [usuarioId],
    );
    return linhas.map((l) => ({
      tipo: l.alvo_tipo,
      id: l.alvo_id,
      nome: l.nome ?? l.alvo_id,
      detalhe: l.detalhe,
      desde: l.criado_em,
    }));
  }

  async contar(usuarioId: string): Promise<number> {
    const [linha] = await this.db.query<{ n: number }>(
      'SELECT count(*)::integer AS n FROM app.seguindo WHERE usuario_id = $1',
      [usuarioId],
    );
    return linha.n;
  }

  async existe(alvo: Alvo): Promise<boolean> {
    const linhas = await this.db.query(EXISTE[alvo.tipo], [alvo.id]);
    return linhas.length > 0;
  }

  async seguir(usuarioId: string, alvo: Alvo): Promise<boolean> {
    const linhas = await this.db.query(
      `INSERT INTO app.seguindo (usuario_id, alvo_tipo, alvo_id) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING RETURNING 1`,
      [usuarioId, alvo.tipo, alvo.id],
    );
    return linhas.length > 0;
  }

  async deixar(usuarioId: string, alvo: Alvo): Promise<boolean> {
    const linhas = await this.db.query(
      `DELETE FROM app.seguindo
        WHERE usuario_id = $1 AND alvo_tipo = $2 AND alvo_id = $3 RETURNING 1`,
      [usuarioId, alvo.tipo, alvo.id],
    );
    return linhas.length > 0;
  }

  async assuntos(): Promise<Assunto[]> {
    return this.db.query<Assunto>(
      `SELECT tema AS nome, count(DISTINCT proposicao_id)::integer AS proposicoes
         FROM canon.proposicao_tema
        GROUP BY tema
        ORDER BY proposicoes DESC, tema`,
    );
  }
}
