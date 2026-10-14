import { Module } from '@nestjs/common';
import { PostgresSeguindoRepositorio } from './postgres-seguindo.repositorio';
import { SeguindoRepositorio } from './seguindo.repositorio';
import { SeguirController } from './seguir.controller';
import { SeguirService } from './seguir.service';

@Module({
  controllers: [SeguirController],
  providers: [
    SeguirService,
    { provide: SeguindoRepositorio, useClass: PostgresSeguindoRepositorio },
  ],
  exports: [SeguirService],
})
export class SeguirModule {}
