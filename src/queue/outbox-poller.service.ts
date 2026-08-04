import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';

@Injectable()
export class OutboxPollerService {
  private readonly logger = new Logger(OutboxPollerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  @Cron('*/5 * * * * *')
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

    this.logger.log(`Outbox poller: ${events.length} pending events`);

    for (const event of events) {
      try {
        if (event.type === 'VIEW_EARNING') {
          await this.kafkaProducer.publish('reel-view-events', [
            {
              key: (event.payload as any).reelId,
              value: JSON.stringify(event.payload),
            },
          ]);

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