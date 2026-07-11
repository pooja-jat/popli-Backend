import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { VIEW_EARNINGS_QUEUE } from './view-earnings.queue';
import { ViewEarningsProcessor } from './view-earnings.processor';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: VIEW_EARNINGS_QUEUE,
    }),
    PrismaModule,
    NotificationsModule,
  ],
  providers: [ViewEarningsProcessor],
  exports: [BullModule],
})
export class QueueModule {}