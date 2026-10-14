import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { Env } from '../config/env';
import { Db } from './db';

/**
 * Pool de conexões único da aplicação. Conecta só na primeira consulta, então
 * a API sobe (e responde /health) mesmo com o banco fora do ar.
 */
@Global()
@Module({
  providers: [
    {
      provide: Db,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new Db(
          new Pool({
            connectionString: config.get('DATABASE_URL', { infer: true }),
            max: config.get('DB_POOL_MAX', { infer: true }),
            application_name: 'vida-publica-api',
          }),
        ),
    },
  ],
  exports: [Db],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(Db) private readonly db: Db) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.fechar();
  }
}
