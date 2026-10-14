import { Module } from '@nestjs/common';
import { DispositivosController } from './dispositivos.controller';
import { DispositivosRepositorio } from './dispositivos.repositorio';
import { PostgresDispositivosRepositorio } from './postgres-dispositivos.repositorio';

/**
 * Lado da API das notificações: o registro do aparelho. A fila e o envio
 * rodam no notificador (notificador.module.ts), outro processo.
 */
@Module({
  controllers: [DispositivosController],
  providers: [
    {
      provide: DispositivosRepositorio,
      useClass: PostgresDispositivosRepositorio,
    },
  ],
})
export class NotificacoesModule {}
