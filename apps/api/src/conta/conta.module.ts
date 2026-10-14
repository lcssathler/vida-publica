import { Module } from '@nestjs/common';
import { ContaController } from './conta.controller';
import { ContaRepositorio } from './conta.repositorio';
import { ContaService } from './conta.service';
import { PostgresContaRepositorio } from './postgres-conta.repositorio';

@Module({
  controllers: [ContaController],
  providers: [
    ContaService,
    { provide: ContaRepositorio, useClass: PostgresContaRepositorio },
  ],
})
export class ContaModule {}
