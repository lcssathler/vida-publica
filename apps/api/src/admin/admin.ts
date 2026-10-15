import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AdminModule } from './admin.module';
import { EnvAdmin } from './env-admin';

/**
 * API do painel de revisão: só as rotas /admin, com o usuário vp_admin do
 * banco. Fica numa porta que só o painel Next.js alcança (rede privada); o
 * painel repassa o IP de quem acessa, conferido aqui também.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AdminModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableShutdownHooks();
  const config = app.get<ConfigService<EnvAdmin, true>>(ConfigService);
  app.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));
  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();
