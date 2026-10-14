import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableShutdownHooks();

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));

  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    const openApi = new DocumentBuilder()
      .setTitle('Vida Pública API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      'docs',
      app,
      SwaggerModule.createDocument(app, openApi),
    );
  }

  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();
