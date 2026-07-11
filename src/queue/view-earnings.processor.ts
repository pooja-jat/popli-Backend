import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VIEW_EARNINGS_QUEUE, ViewEarningsJobData } from './view-earnings.queue';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { calcSingleViewEarning } from '../utils/earningCalculator';
import { getViewRate } from '../utils/rateConfig';

@Processor(VIEW_EARNINGS_QUEUE, { concurrency: 5 })
@Injectable()
export class ViewEarningsProcessor extends WorkerHost {
  private readonly logger = new Logger(ViewEarningsProcessor.name);

constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

 async process(job: Job<ViewEarningsJobData>): Promise<void> {
    const { validViewId, reelId, creatorId } = job.data;

    // Idempotency guard: skip if this view was already credited (retry / race with cron)
    const existingValidView = await this.prisma.validView.findUnique({
      where: { id: validViewId },
      select: { isProcessed: true },
    });
    if (!existingValidView || existingValidView.isProcessed) {
      this.logger.warn(`Skipping already-processed or missing validView ${validViewId}`);
      return;
    }

    const reel = await this.prisma.reel.findUnique({
      where: { id: reelId },
      select: { id: true, isMonetized: true, mediaType: true, creatorId: true },
    });

    if (!reel || !reel.isMonetized || reel.mediaType !== 'VIDEO') {
      await this.prisma.validView.update({
        where: { id: validViewId },
        data: { isProcessed: true },
      });
      return;
    }

 const ratePer1000 = await getViewRate(this.prisma);
const grossEarning = calcSingleViewEarning(ratePer1000);

    const wasCredited = await this.prisma.$transaction(async (tx) => {
      // Atomically claim this view: only proceed if it's still unprocessed.
      // If 0 rows are updated, another worker/cron already claimed it — abort without crediting.
      const claim = await tx.validView.updateMany({
        where: { id: validViewId, isProcessed: false },
        data: { isProcessed: true },
      });
      if (claim.count === 0) {
        return false;
      }

      const wallet = await tx.wallet.upsert({
        where: { userId: creatorId },
        create: {
          userId: creatorId,
          withdrawableBalance: grossEarning,
          totalEarnings: grossEarning,
        },
        update: {
          withdrawableBalance: { increment: grossEarning },
          totalEarnings: { increment: grossEarning },
        },
      });

      await tx.walletLedger.create({
        data: {
          userId: creatorId,
          walletId: wallet.id,
          source: 'VIEW_EARNING',
          sourceId: validViewId ?? 'UNKNOWN',
          reelId: reelId,
          credit: grossEarning,
          debit: 0,
          balanceAfter: wallet.withdrawableBalance,
          description: `View earning: ₹${grossEarning.toFixed(4)} (TDS & platform fee deducted at withdrawal)`,
        },
      });

      return true;
    });

    if (!wasCredited) {
      this.logger.warn(`View ${validViewId} was already claimed by another process — skipped duplicate credit.`);
      return;
    }

  await this.prisma.notification.create({
      data: {
        userId: creatorId,
        type: 'SYSTEM',
        title: 'Earnings Updated!',
        body: `You earned ₹${grossEarning.toFixed(4)} from a new valid view!`,
      },
    }).catch(() => {});

    await this.notificationsService.sendPushNotification(
      creatorId,
      'Earnings Updated!',
      `You earned ₹${grossEarning.toFixed(4)} from a new valid view!`,
    ).catch(() => {});

    this.logger.log(`Processed view earning for creator ${creatorId}, reel ${reelId}`);
  }
}