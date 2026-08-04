import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PlatformService } from '../platform/platform.service';
import { EarningsService } from '../earnings/earnings.service';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private consumer!: Consumer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly platformService: PlatformService,
    private readonly earningsService: EarningsService,
  ) {}

  onModuleInit() {
    const caPath = path.resolve(process.cwd(), process.env.KAFKA_CA_PATH || './ca.pem');
    const ssl = fs.existsSync(caPath)
      ? { ca: [fs.readFileSync(caPath, 'utf-8')] }
      : true;

    const kafka = new Kafka({
      clientId: 'popli-consumer',
      brokers: [process.env.KAFKA_BROKER!],
      ssl,
      sasl: {
        mechanism: 'plain',
        username: process.env.KAFKA_USERNAME!,
        password: process.env.KAFKA_PASSWORD!,
      },
    });

    this.consumer = kafka.consumer({ groupId: 'popli-view-earnings' });

    this.consumer.connect()
      .then(() => this.consumer.subscribe({ topic: 'reel-view-events', fromBeginning: false }))
      .then(() => this.consumer.subscribe({ topic: 'platform-settings-updated', fromBeginning: false }))
      .then(() => this.consumer.run({ eachMessage: (payload) => this.handleMessage(payload) }))
      .then(() => this.logger.log('Kafka consumer running'))
      .catch((err) => this.logger.error('Kafka consumer failed to start', err));
  }

  async onModuleDestroy() {
    await this.consumer?.disconnect();
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, message } = payload;
    const raw = message.value?.toString();
    if (!raw) return;

    try {
      if (topic === 'reel-view-events') {
        await this.processViewEvent(JSON.parse(raw));
      } else if (topic === 'platform-settings-updated') {
        await this.platformService.loadAndCacheEarningConfig();
        this.logger.log('Earning config refreshed from Kafka event');
      }
    } catch (err: any) {
      this.logger.error(`Consumer error on topic ${topic}: ${err.message}`);
    }
  }

  private async processViewEvent(payload: {
    validViewId: string;
    reelId: string;
    creatorId: string;
    watchDuration: number;
  }): Promise<void> {
    const { validViewId, reelId, creatorId } = payload;

    const reel = await this.prisma.reel.findUnique({
      where: { id: reelId },
      select: { isMonetized: true, mediaType: true },
    });
    if (!reel || !reel.isMonetized || reel.mediaType !== 'VIDEO') return;

    const creator = await this.prisma.user.findUnique({
      where: { id: creatorId },
      select: { earningsFrozen: true, isMonetized: true },
    });
    if (!creator || creator.earningsFrozen || !creator.isMonetized) return;

    const config = await this.platformService.getEarningConfig();
    if (!config.earningsEnabled) return;

    await this.redis.incr(`reel:view-count:${reelId}`);

    const [viewCountRecord] = await this.prisma.$queryRaw<Array<{ totalViews: number; lastMilestone: number }>>`
      INSERT INTO "ReelViewCount" ("id", "reelId", "totalViews", "lastMilestone", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${reelId}, 1, 0, NOW(), NOW())
      ON CONFLICT ("reelId") DO UPDATE
      SET "totalViews" = "ReelViewCount"."totalViews" + 1, "updatedAt" = NOW()
      RETURNING "totalViews", "lastMilestone"
    `;

    const totalViews = Number(viewCountRecord.totalViews);
    const lastMilestone = Number(viewCountRecord.lastMilestone);
    const currentMilestone = Math.floor(totalViews / config.viewsPerReward);

    if (currentMilestone <= lastMilestone) return;

    await this.earningsService.creditViewMilestone({
      reelId,
      creatorId,
      totalViews,
      currentMilestone,
      lastMilestone,
      sourceId: validViewId,
    });
  }
}