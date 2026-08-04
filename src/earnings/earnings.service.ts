import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformService } from '../platform/platform.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class EarningsService {
  private readonly logger = new Logger(EarningsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly platformService: PlatformService,
  ) {}

  /**
   * Single source of truth for milestone credit.
   * Called by both KafkaConsumerService and WalletService cron.
   * Idempotent — safe to call multiple times for same reelId/milestone.
   */
  async creditViewMilestone(params: {
    reelId: string;
    creatorId: string;
    totalViews: number;
    currentMilestone: number;
    lastMilestone: number;
    sourceId: string; // validViewId or batchId
  }): Promise<void> {
    const { reelId, creatorId, totalViews, currentMilestone, lastMilestone, sourceId } = params;

    if (currentMilestone <= lastMilestone) return;

 const config = await this.platformService.getEarningConfig();
    const milestonesEarned = currentMilestone - lastMilestone;
    const rewardInr = Number((Math.round(milestonesEarned * config.rewardAmountPaise) / 100).toFixed(2));

    try {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const updated = await tx.$executeRaw`
          UPDATE "ReelViewCount"
          SET "lastMilestone" = ${currentMilestone}, "updatedAt" = NOW()
          WHERE "reelId" = ${reelId}
          AND "lastMilestone" < ${currentMilestone}
        `;

        if (updated === 0) return; // already credited — idempotency guard

const [updatedWallet] = await tx.$queryRaw<Array<{ id: string; withdrawableBalance: number }>>`
          INSERT INTO "Wallet" ("id", "userId", "withdrawableBalance", "totalEarnings", "createdAt", "updatedAt")
          VALUES (gen_random_uuid(), ${creatorId}, ${rewardInr}, ${rewardInr}, NOW(), NOW())
          ON CONFLICT ("userId") DO UPDATE
        SET
            "withdrawableBalance" = ROUND(("Wallet"."withdrawableBalance" + ${rewardInr})::numeric, 2),
            "totalEarnings" = ROUND(("Wallet"."totalEarnings" + ${rewardInr})::numeric, 2),
            "updatedAt" = NOW()
          RETURNING "id", "withdrawableBalance"
        `;

        await tx.walletLedger.create({
          data: {
            userId: creatorId,
            walletId: updatedWallet.id,
            source: 'VIEW_EARNING',
            sourceId,
            reelId,
            credit: rewardInr,
            debit: 0,
            balanceAfter: Number(updatedWallet.withdrawableBalance),
            description: `Reel reached ${totalViews} views (milestone ${currentMilestone}). Earned ₹${rewardInr}`,
          },
        });
      });

      this.logger.log(
        `Creator ${creatorId} earned ₹${rewardInr} for reel ${reelId} at ${totalViews} views (milestone ${currentMilestone})`,
      );

      await this.notificationsService.createAndPush(
        {
          userId: creatorId,
          type: 'SYSTEM',
          title: 'Milestone Reached!',
          body: `Your reel crossed ${totalViews} views! ₹${rewardInr} has been added to your wallet.`,
        },
        'Milestone Reached!',
        `Your reel crossed ${totalViews} views! ₹${rewardInr} has been added to your wallet.`,
      ).catch(() => {});
    } catch (err: any) {
      this.logger.error(`Failed to credit milestone for reel ${reelId}: ${err.message}`);
    }
  }
}