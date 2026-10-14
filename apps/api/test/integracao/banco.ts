import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Db } from '../../src/db/db';

/** Conexão com o banco de teste (vitest.int.config.mts), com o usuário vp_api. */
export function dbDeTeste(): Db {
  return new Db(
    new Pool({ connectionString: process.env.DATABASE_URL, max: 4 }),
  );
}

/**
 * Dados fictícios em canon e feed, gravados com o dono do banco (a API não
 * escreve lá). Cada teste apaga o que criou em `limpar()`.
 */
export class Semente {
  readonly db: Db;
  private readonly pessoas: string[] = [];
  private readonly partidos: number[] = [];
  private readonly proposicoes: string[] = [];

  constructor() {
    const url = process.env.VP_API_TEST_OWNER_URL;
    if (!url) throw new Error('Defina VP_API_TEST_OWNER_URL (dono do banco)');
    this.db = new Db(new Pool({ connectionString: url, max: 2 }));
  }

  async pessoa(nome = `Pessoa Fictícia ${randomUUID().slice(0, 8)}`) {
    const [linha] = await this.db.query<{ id: string }>(
      `INSERT INTO canon.pessoa (nome_civil, nome_exibicao) VALUES ($1, $1) RETURNING id`,
      [nome],
    );
    this.pessoas.push(linha.id);
    return linha.id;
  }

  async partido(sigla = `T${randomUUID().slice(0, 6).toUpperCase()}`) {
    const [linha] = await this.db.query<{ id: number }>(
      `INSERT INTO canon.partido (numero_tse, sigla, sigla_normalizada, nome)
       VALUES (99, $1, $1, $2) RETURNING id`,
      [sigla, `Partido Fictício ${sigla}`],
    );
    this.partidos.push(linha.id);
    return String(linha.id);
  }

  async proposicao(temas: string[] = []) {
    const idFonte = `teste-${randomUUID()}`;
    const [linha] = await this.db.query<{ id: string }>(
      `INSERT INTO canon.proposicao (casa, id_fonte, sigla_tipo, numero, ano, identificacao,
                                     ementa, content_hash)
       VALUES ('camara', $1, 'PL', 1, 10001, 'PL 1/10001', 'Ementa fictícia', repeat('0', 64))
       RETURNING id`,
      [idFonte],
    );
    this.proposicoes.push(linha.id);
    for (const tema of temas) {
      await this.db.query(
        'INSERT INTO canon.proposicao_tema (proposicao_id, tema) VALUES ($1, $2)',
        [linha.id, tema],
      );
    }
    return linha.id;
  }

  async limpar(): Promise<void> {
    await this.db.query(
      'DELETE FROM canon.proposicao WHERE id = ANY($1::uuid[])',
      [this.proposicoes],
    );
    await this.db.query('DELETE FROM canon.partido WHERE id = ANY($1::int[])', [
      this.partidos,
    ]);
    await this.db.query('DELETE FROM canon.pessoa WHERE id = ANY($1::uuid[])', [
      this.pessoas,
    ]);
    await this.db.fechar();
  }
}
