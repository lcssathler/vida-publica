import { Pool, PoolClient, QueryResultRow } from 'pg';

/** Executa SQL parametrizado. Implementado pelo pool e por uma transação aberta. */
export interface Executor {
  query<T extends QueryResultRow>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<T[]>;
}

class ExecutorCliente implements Executor {
  constructor(private readonly cliente: PoolClient) {}

  async query<T extends QueryResultRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    const resultado = await this.cliente.query<T>(sql, [...params]);
    return resultado.rows;
  }
}

/** Acesso ao Postgres com o usuário vp_api. Só os adaptadores usam. */
export class Db implements Executor {
  constructor(private readonly pool: Pool) {}

  async query<T extends QueryResultRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    const resultado = await this.pool.query<T>(sql, [...params]);
    return resultado.rows;
  }

  /** Roda a função numa transação: confirma se ela termina, desfaz se lança. */
  async transacao<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      const resultado = await fn(new ExecutorCliente(cliente));
      await cliente.query('COMMIT');
      return resultado;
    } catch (erro) {
      await cliente.query('ROLLBACK');
      throw erro;
    } finally {
      cliente.release();
    }
  }

  async fechar(): Promise<void> {
    await this.pool.end();
  }
}
