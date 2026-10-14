import { Module } from '@nestjs/common';
import { FeedModule } from '../feed/feed.module';
import { SeguirModule } from '../seguir/seguir.module';
import { PostgresPropostasRepositorio } from './postgres-propostas.repositorio';
import { PropostasController } from './propostas.controller';
import { PropostasRepositorio } from './propostas.repositorio';
import { PropostasService } from './propostas.service';

@Module({
  imports: [FeedModule, SeguirModule],
  controllers: [PropostasController],
  providers: [
    PropostasService,
    { provide: PropostasRepositorio, useClass: PostgresPropostasRepositorio },
  ],
})
export class PropostasModule {}
