import { Pool } from 'pg';
import { Db } from '../../src/db/db';

/** Conexão com o banco de teste (vitest.int.config.mts), com o usuário vp_api. */
export function dbDeTeste(): Db {
  return new Db(
    new Pool({ connectionString: process.env.DATABASE_URL, max: 4 }),
  );
}
