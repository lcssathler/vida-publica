import { Module } from '@nestjs/common';
import { FeedModule } from '../feed/feed.module';
import { SeguirModule } from '../seguir/seguir.module';
import { PerfisController } from './perfis.controller';
import { PerfisRepositorio } from './perfis.repositorio';
import { PerfisService } from './perfis.service';
import { PostgresPerfisRepositorio } from './postgres-perfis.repositorio';

@Module({
  imports: [FeedModule, SeguirModule],
  controllers: [PerfisController],
  providers: [
    PerfisService,
    { provide: PerfisRepositorio, useClass: PostgresPerfisRepositorio },
  ],
})
export class PerfisModule {}
