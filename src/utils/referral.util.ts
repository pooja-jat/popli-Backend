import { PrismaService } from '../prisma/prisma.service';

async function getReferralRewards(prisma: any): Promise<{
  referrerReward: number;
  referredReward: number;
}> {
  const [referrerConfig, referredConfig] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: 'REFERRAL_CREATOR_REWARD' } }),
    prisma.systemConfig.findUnique({ where: { key: 'REFERRAL_STANDARD_REWARD' } }),
  ]);

  return {
    referrerReward:
      referrerConfig && typeof referrerConfig.valueJson === 'number'
        ? referrerConfig.valueJson
        : 100,
    referredReward:
      referredConfig && typeof referredConfig.valueJson === 'number'
        ? referredConfig.valueJson
        : 25,
  };
}

export async function checkAndProcessReferral(
  prisma: any,
  userId: string,
  notificationsService?: any,
) {
  const tracker = await prisma.referralTracker.findFirst({
    where: { referredId: userId, status: 'PENDING' },
  });
  if (!tracker) return false;

  const kyc = await prisma.kYCRecord.findFirst({
    where: { userId, status: 'APPROVED' },
  });
  if (!kyc) return false;

  const firstReel = await prisma.reel.findFirst({
    where: { creatorId: userId },
  });
  if (!firstReel) return false;

  const { referrerReward, referredReward } = await getReferralRewards(prisma);

  try {
    return await prisma
      .$transaction(async (tx: any) => {
        const updateResult = await tx.referralTracker.updateMany({
          where: { id: tracker.id, status: 'PENDING' },
          data: { status: 'COMPLETED', rewardInr: referrerReward },
        });

        if (updateResult.count === 0) return false;

        const referrerWallet = await tx.wallet.upsert({
          where: { userId: tracker.referrerId },
          create: { userId: tracker.referrerId },
          update: {},
        });
        await tx.wallet.update({
          where: { id: referrerWallet.id },
          data: {
            referralLockedBalance: { increment: referrerReward },
            totalEarnings: { increment: referrerReward },
          },
        });
        await tx.walletLedger.create({
          data: {
            userId: tracker.referrerId,
            walletId: referrerWallet.id,
            source: 'REFERRAL_BONUS',
            sourceId: tracker.id,
            credit: referrerReward,
            balanceAfter: referrerWallet.withdrawableBalance,
            description: `Referral bonus ₹${referrerReward} (locked until both parties complete reel + KYC)`,
          },
        });

        const referredWallet = await tx.wallet.upsert({
          where: { userId },
          create: { userId },
          update: {},
        });
        await tx.wallet.update({
          where: { id: referredWallet.id },
          data: {
            referralLockedBalance: { increment: referredReward },
            totalEarnings: { increment: referredReward },
          },
        });
        await tx.walletLedger.create({
          data: {
            userId,
            walletId: referredWallet.id,
            source: 'REFERRAL_BONUS',
            sourceId: tracker.id,
            credit: referredReward,
            balanceAfter: referredWallet.withdrawableBalance,
            description: `Signup bonus ₹${referredReward} (locked until both parties complete reel + KYC)`,
          },
        });

        await tx.notification.create({
          data: {
            userId: tracker.referrerId,
            type: 'SYSTEM',
            title: 'Referral Bonus!',
            body: `You earned ₹${referrerReward} because your referred friend completed KYC and posted their first reel!`,
          },
        });

        await tx.notification.create({
          data: {
            userId,
            type: 'SYSTEM',
            title: 'Welcome Bonus!',
            body: `You earned ₹${referredReward} for completing your KYC and posting your first reel!`,
          },
        });

        return true;
      })
      .then(async (result: boolean) => {
        if (result && notificationsService) {
          await notificationsService
            .sendPushNotification(
              tracker.referrerId,
              'Referral Bonus!',
              `You earned ₹${referrerReward} because your referred friend completed KYC and posted first reel!`,
            )
            .catch(() => {});
          await notificationsService
            .sendPushNotification(
              userId,
              'Welcome Bonus!',
              `You earned ₹${referredReward} for completing KYC and posting your first reel!`,
            )
            .catch(() => {});
        }
        return result;
      });
  } catch (err) {
    console.error('Failed to process referral rewards:', err);
    return false;
  }
}