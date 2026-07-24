import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { VIEW_EARNINGS_QUEUE, ViewEarningsJobData } from './view-earnings.queue';

@Injectable()
export class OutboxPollerService {
  private readonly logger = new Logger(OutboxPollerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(VIEW_EARNINGS_QUEUE) private viewEarningsQueue: Queue<ViewEarningsJobData>,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async pollOutbox() {
    const events = await this.prisma.outboxEvent.findMany({
      where: {
        status: 'PENDING',
        attempts: { lt: 5 },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    if (events.length === 0) return;

    this.logger.log(`Outbox poller found ${events.length} pending events`);

    for (const event of events) {
      try {
        if (event.type === 'VIEW_EARNING') {
         const payload = event.payload as unknown as ViewEarningsJobData;

          const existingValidView = await this.prisma.validView.findUnique({
            where: { id: payload.validViewId },
            select: { isProcessed: true },
          });

          if (existingValidView?.isProcessed) {
            await this.prisma.outboxEvent.update({
              where: { id: event.id },
              data: { status: 'PROCESSED', processedAt: new Date() },
            });
            continue;
          }

          await this.viewEarningsQueue.add(
            'process-view',
            payload,
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
              removeOnComplete: 100,
              removeOnFail: 50,
            },
          );

          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'PROCESSED',
              processedAt: new Date(),
              attempts: { increment: 1 },
            },
          });
        }
      } catch (err: any) {
        this.logger.error(`Outbox event ${event.id} failed: ${err.message}`);
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            attempts: { increment: 1 },
            lastError: err.message,
            ...(event.attempts + 1 >= 5 && { status: 'DEAD' }),
          },
        });
      }
    }
  }
}