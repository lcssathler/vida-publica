import { Module } from '@nestjs/common';
import { ErratasController } from './erratas.controller';
import { ErratasRepositorio } from './erratas.repositorio';
import { PostgresErratasRepositorio } from './postgres-erratas.repositorio';

@Module({
  controllers: [ErratasController],
  providers: [
    { provide: ErratasRepositorio, useClass: PostgresErratasRepositorio },
  ],
})
export class ErratasModule {}
