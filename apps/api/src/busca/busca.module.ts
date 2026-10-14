import { Module } from '@nestjs/common';
import { BuscaController } from './busca.controller';
import { BuscaRepositorio } from './busca.repositorio';
import { BuscaService } from './busca.service';
import { PostgresBuscaRepositorio } from './postgres-busca.repositorio';

@Module({
  controllers: [BuscaController],
  providers: [
    BuscaService,
    { provide: BuscaRepositorio, useClass: PostgresBuscaRepositorio },
  ],
})
export class BuscaModule {}
