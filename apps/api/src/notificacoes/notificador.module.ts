import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { DbModule } from '../db/db.module';
import { Enviador, Relogio, RelogioDoSistema } from './enviador';
import { EnviadorFalso } from './enviador-falso';
import { EnvNotificador, validarEnvNotificador } from './env-notificador';
import { FilaRepositorio } from './fila.repositorio';
import { CONFIG_FILA, ConfigFila, FilaService } from './fila.service';
import { PostgresFilaRepositorio } from './postgres-fila.repositorio';

/**
 * Notificador: processo separado da API (src/notificacoes/notificador.ts), com
 * o usuário vp_notify do banco. Envia pelo adaptador falso, que só registra.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validarEnvNotificador }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvNotificador, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    DbModule,
  ],
  providers: [
    FilaService,
    { provide: FilaRepositorio, useClass: PostgresFilaRepositorio },
    { provide: Enviador, useFactory: () => new EnviadorFalso() },
    { provide: Relogio, useClass: RelogioDoSistema },
    {
      provide: CONFIG_FILA,
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<EnvNotificador, true>,
      ): ConfigFila => ({
        margemMinutos: config.get('NOTIF_MARGEM_MINUTOS', { infer: true }),
        frescorDias: config.get('NOTIF_FRESCOR_DIAS', { infer: true }),
        lote: config.get('NOTIF_LOTE', { infer: true }),
        maxTentativas: config.get('NOTIF_MAX_TENTATIVAS', { infer: true }),
      }),
    },
  ],
})
export class NotificadorModule {}
