import { Module } from '@nestjs/common';
import { OutboxPollerService } from './outbox-poller.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  providers: [OutboxPollerService],
  exports: [OutboxPollerService],
})
export class QueueModule {}