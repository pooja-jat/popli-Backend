import { Module } from '@nestjs/common';
import { OutboxPollerService } from './outbox-poller.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [OutboxPollerService],
  exports: [OutboxPollerService],
})
export class QueueModule {}