import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { DbModule } from '../db/db.module';
import {
  Enviador,
  Relogio,
  RelogioDoSistema,
  RelogioSimulado,
} from './enviador';
import { EnviadorFalso } from './enviador-falso';
import { EnviadorFcm, lerCredenciais } from './enviador-fcm';
import { EnvNotificador, validarEnvNotificador } from './env-notificador';
import { FilaRepositorio } from './fila.repositorio';
import { CONFIG_FILA, ConfigFila, FilaService } from './fila.service';
import { PostgresFilaRepositorio } from './postgres-fila.repositorio';
import { PostgresResumoRepositorio } from './postgres-resumo.repositorio';
import { ResumoRepositorio } from './resumo.repositorio';
import { CONFIG_RESUMO, ConfigResumo, ResumoService } from './resumo.service';

/**
 * Notificador: processo separado da API (src/notificacoes/notificador.ts), com
 * o usuário vp_notify do banco. Envia pelo FCM quando há conta de serviço;
 * sem ela, pelo adaptador falso, que só registra.
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
    ResumoService,
    { provide: FilaRepositorio, useClass: PostgresFilaRepositorio },
    { provide: ResumoRepositorio, useClass: PostgresResumoRepositorio },
    {
      provide: CONFIG_RESUMO,
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<EnvNotificador, true>,
      ): ConfigResumo => ({
        hora: config.get('NOTIF_RESUMO_HORA', { infer: true }),
      }),
    },
    {
      provide: Enviador,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvNotificador, true>): Enviador => {
        const log = new Logger('Notificador');
        const conta = lerCredenciais({
          FCM_CREDENCIAIS_JSON: config.get('FCM_CREDENCIAIS_JSON', {
            infer: true,
          }),
          FCM_CREDENCIAIS_ARQUIVO: config.get('FCM_CREDENCIAIS_ARQUIVO', {
            infer: true,
          }),
        });
        if (!conta) {
          log.log('Sem credenciais do FCM: adaptador falso (só registra)');
          return new EnviadorFalso();
        }
        const validarApenas = config.get('FCM_VALIDAR_APENAS', { infer: true });
        log.log({
          msg: 'FCM ligado',
          projeto: conta.project_id,
          validarApenas,
        });
        return new EnviadorFcm(conta, { validarApenas });
      },
    },
    {
      provide: Relogio,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvNotificador, true>): Relogio => {
        const agora = config.get('NOTIF_AGORA', { infer: true });
        if (!agora) return new RelogioDoSistema();
        new Logger('Notificador').warn({ msg: 'Relógio simulado', agora });
        return new RelogioSimulado(new Date(agora));
      },
    },
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
