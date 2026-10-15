import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { DbModule } from '../db/db.module';
import { ContadorEmMemoria, ContadorRequisicoes } from '../limite/contador';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { ContasAdminRepositorio } from './contas.repositorio';
import {
  CONFIG_CONTAS,
  ConfigContas,
  ContasAdminService,
  RELOGIO_ADMIN,
} from './contas.service';
import { lerChave } from './cripto';
import { EnvAdmin, validarEnvAdmin } from './env-admin';
import { IpsPermitidos } from './ips';
import { PostgresContasAdminRepositorio } from './postgres-contas.repositorio';
import { PostgresRevisaoRepositorio } from './postgres-revisao.repositorio';
import { RevisaoRepositorio } from './revisao.repositorio';

/**
 * Processo do painel de revisão (src/admin/admin.ts): mesmo código da API,
 * só as rotas do admin, outro usuário do banco (vp_admin). O painel Next.js
 * (apps/admin) é o único cliente.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validarEnvAdmin }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvAdmin, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    DbModule,
  ],
  controllers: [AdminController],
  providers: [
    ContasAdminService,
    {
      provide: ContasAdminRepositorio,
      useClass: PostgresContasAdminRepositorio,
    },
    { provide: RevisaoRepositorio, useClass: PostgresRevisaoRepositorio },
    { provide: ContadorRequisicoes, useClass: ContadorEmMemoria },
    { provide: RELOGIO_ADMIN, useValue: () => new Date() },
    {
      provide: IpsPermitidos,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvAdmin, true>) =>
        new IpsPermitidos(config.get('ADMIN_IPS', { infer: true })),
    },
    {
      provide: CONFIG_CONTAS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvAdmin, true>): ConfigContas => ({
        chaveTotp: lerChave(config.get('ADMIN_TOTP_CHAVE', { infer: true })),
        sessaoHoras: config.get('ADMIN_SESSAO_HORAS', { infer: true }),
      }),
    },
    { provide: APP_GUARD, useClass: AdminGuard },
  ],
})
export class AdminModule {}
