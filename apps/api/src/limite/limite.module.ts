import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Env } from '../config/env';
import { ContadorEmMemoria, ContadorRequisicoes } from './contador';
import { LimiteGuard } from './limite.guard';
import { Limites } from './politicas';

const MINUTO = 60_000;

/** Importar depois do AuthModule: a guarda precisa do usuário já identificado. */
@Module({
  providers: [
    { provide: ContadorRequisicoes, useClass: ContadorEmMemoria },
    {
      provide: Limites,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new Limites({
          usuario: {
            max: config.get('LIMITE_POR_MINUTO', { infer: true }),
            janelaMs: MINUTO,
            por: 'usuario',
          },
          ip: {
            max: config.get('LIMITE_IP_POR_MINUTO', { infer: true }),
            janelaMs: MINUTO,
            por: 'ip',
          },
          contas: {
            max: config.get('LIMITE_CONTAS_POR_IP', { infer: true }),
            janelaMs: 10 * MINUTO,
            por: 'ip',
          },
          busca: {
            max: Math.max(
              1,
              Math.floor(config.get('LIMITE_POR_MINUTO', { infer: true }) / 4),
            ),
            janelaMs: MINUTO,
            por: 'usuario',
          },
        }),
    },
    { provide: APP_GUARD, useClass: LimiteGuard },
  ],
})
export class LimiteModule {}
