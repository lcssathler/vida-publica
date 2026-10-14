import { Module } from '@nestjs/common';
import { FeedController } from './feed.controller';
import { FeedRepositorio } from './feed.repositorio';
import { FeedService } from './feed.service';
import { PostgresFeedRepositorio } from './postgres-feed.repositorio';

@Module({
  controllers: [FeedController],
  providers: [
    FeedService,
    { provide: FeedRepositorio, useClass: PostgresFeedRepositorio },
  ],
  exports: [FeedService],
})
export class FeedModule {}
