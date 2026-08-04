import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { VerifyPaymentDto } from './dto/wallet.dto';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RechargeDto, WithdrawDto } from './dto/wallet.dto';
import { Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformService } from '../platform/platform.service';
import { EarningsService } from '../earnings/earnings.service';


@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private platformService: PlatformService,
    private earningsService: EarningsService,
  ) {}
 async processViewEarnings() {
    this.logger.log('Starting Fallback View Earnings Processing...');

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const unprocessedViews = await this.prisma.validView.findMany({
      where: { isProcessed: false, createdAt: { lt: oneHourAgo } },
      include: { reel: { select: { creatorId: true, isMonetized: true, mediaType: true } } },
    });

    if (unprocessedViews.length === 0) {
      this.logger.log('No unprocessed views found.');
      return;
    }

    const batch = await this.prisma.earningBatch.create({
      data: { status: 'PROCESSING', totalViews: unprocessedViews.length, totalEarnings: 0 },
    });

   const { viewsPerReward, rewardAmountPaise } = await this.platformService.getEarningConfig();

    const reelViewsMap = new Map<string, { creatorId: string; viewIds: string[] }>();
    for (const view of unprocessedViews) {
      if (view.reel.isMonetized && view.reel.mediaType === 'VIDEO') {
        const existing = reelViewsMap.get(view.reelId);
        if (existing) {
          existing.viewIds.push(view.id);
        } else {
          reelViewsMap.set(view.reelId, { creatorId: view.reel.creatorId, viewIds: [view.id] });
        }
      }
    }

    const creatorTotals = new Map<string, { totalViews: number; totalNetPaise: number }>();
    for (const [, { creatorId, viewIds }] of reelViewsMap.entries()) {
      const existing = creatorTotals.get(creatorId);
      if (existing) {
        existing.totalViews += viewIds.length;
      } else {
        creatorTotals.set(creatorId, { totalViews: viewIds.length, totalNetPaise: 0 });
      }
    }

    let totalBatchEarningsPaise = 0;

    for (const [reelId, { creatorId, viewIds }] of reelViewsMap.entries()) {
      if (viewIds.length < 1) continue;

      try {
      const claim = await this.prisma.validView.updateMany({
          where: { id: { in: viewIds }, isProcessed: false },
          data: { isProcessed: true, batchId: batch.id },
        });

        if (claim.count === 0) continue;

        const viewCountRows = await this.prisma.$queryRaw<Array<{ totalViews: number; lastMilestone: number }>>`
          INSERT INTO "ReelViewCount" ("id", "reelId", "totalViews", "lastMilestone", "createdAt", "updatedAt")
          VALUES (gen_random_uuid(), ${reelId}, ${claim.count}, 0, NOW(), NOW())
          ON CONFLICT ("reelId") DO UPDATE
          SET "totalViews" = "ReelViewCount"."totalViews" + ${claim.count}, "updatedAt" = NOW()
          RETURNING "totalViews", "lastMilestone"
        `;

        const totalViews = Number(viewCountRows[0].totalViews);
        const lastMilestone = Number(viewCountRows[0].lastMilestone);
        const currentMilestone = Math.floor(totalViews / viewsPerReward);

        if (currentMilestone <= lastMilestone) continue;

        const milestonesEarned = currentMilestone - lastMilestone;
        const earnedPaise = milestonesEarned * rewardAmountPaise;

        totalBatchEarningsPaise += earnedPaise;

        const creatorTotal = creatorTotals.get(creatorId)!;
        creatorTotal.totalNetPaise += earnedPaise;

        await this.earningsService.creditViewMilestone({
          reelId,
          creatorId,
          totalViews,
          currentMilestone,
          lastMilestone,
          sourceId: batch.id,
        });
      } catch (error) {
        this.logger.error(`Failed to process earnings for reel ${reelId}:`, error);
      }
    }

    for (const [creatorId, { totalViews, totalNetPaise }] of creatorTotals.entries()) {
      if (totalNetPaise > 0) {
        await this.notificationsService.createAndPush(
          {
            userId: creatorId,
            type: 'SYSTEM',
            title: 'Earnings Updated!',
            body: `You earned ₹${totalNetPaise / 100} from ${totalViews} valid views!`,
          },
          'Earnings Updated!',
          `You earned ₹${totalNetPaise / 100} from ${totalViews} valid views!`,
        ).catch(() => {});
      }
    }

    await this.prisma.earningBatch.update({
      where: { id: batch.id },
      data: {
        status: 'COMPLETED',
        totalEarnings: totalBatchEarningsPaise,
        processedAt: new Date(),
      },
    });

    this.logger.log(
      `Fallback earnings done. Batch: ${batch.id}. Creators: ${creatorTotals.size}. Total: ₹${totalBatchEarningsPaise / 100}`,
    );
  }
private async checkReferralUnlockEligibility(
    tx: Prisma.TransactionClient | PrismaService,
    userId: string,
  ): Promise<boolean> {
    const referralAsReferrer = await tx.referralTracker.findFirst({
      where: { referrerId: userId },
    });
    const referralAsReferred = await tx.referralTracker.findFirst({
      where: { referredId: userId },
    });

    if (!referralAsReferrer && !referralAsReferred) return false;

    const counterpartId = referralAsReferrer
      ? referralAsReferrer.referredId
      : referralAsReferred!.referrerId;

    const myReelCount = await tx.reel.count({ where: { creatorId: userId } });
    if (myReelCount < 1) return false;

    const counterpartReelCount = await tx.reel.count({
      where: { creatorId: counterpartId },
    });
    if (counterpartReelCount < 1) return false;

    const myKyc = await tx.kYCRecord.findFirst({
      where: { userId, status: 'APPROVED' },
    });
    if (!myKyc) return false;

    const counterpartKyc = await tx.kYCRecord.findFirst({
      where: { userId: counterpartId, status: 'APPROVED' },
    });
    if (!counterpartKyc) return false;

    return true;
  }

  async unlockReferralBalanceIfEligible(userId: string) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet || wallet.referralLockedBalance <= 0) return wallet;

      const eligible = await this.checkReferralUnlockEligibility(tx, userId);
      if (!eligible) return wallet;

      const amount = wallet.referralLockedBalance;
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          referralLockedBalance: { decrement: amount },
          withdrawableBalance: { increment: amount },
        },
      });

      await tx.walletLedger.create({
        data: {
          userId,
          walletId: wallet.id,
          source: 'ADJUSTMENT',
          sourceId: 'REFERRAL_UNLOCK',
          credit: amount,
          balanceAfter: updatedWallet.withdrawableBalance,
          description: `Unlocked ₹${amount.toFixed(2)} referral bonus (1 reel + KYC completed by both parties)`,
        },
      });

      return updatedWallet;
    });
  }

  async getBalance(userId: string) {
    // Auto-unlock referral balance if conditions are now met
    await this.unlockReferralBalanceIfEligible(userId).catch(() => {});

    // We return the wallet along with the immutable ledger history, not the old transactions
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: {
        ledgers: { orderBy: { createdAt: 'desc' }, take: 50 },
        withdrawalRequests: { orderBy: { createdAt: 'desc' }, take: 10 },
        transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });

    let targetWallet = wallet;

    if (!wallet) {
      targetWallet = await this.prisma.wallet.create({
        data: { userId },
        include: {
          ledgers: true,
          withdrawalRequests: true,
          transactions: true,
        },
      });
    }

    const ledgerAggregations = await this.prisma.walletLedger.groupBy({
      by: ['source'],
      where: { userId },
      _sum: { credit: true },
    });

    let viewEarnings = 0;
    let giftEarnings = 0;
    let referralEarnings = 0;
    let bonusEarnings = 0;

    for (const agg of ledgerAggregations) {
      if (agg.source === 'VIEW_EARNING') viewEarnings = agg._sum.credit || 0;
      if (agg.source === 'GIFT_RECEIVED') giftEarnings = agg._sum.credit || 0;
      if (agg.source === 'REFERRAL_BONUS')
        referralEarnings = agg._sum.credit || 0;
      if (agg.source === 'BONUS' || agg.source === 'CHALLENGE_REWARD')
        bonusEarnings += agg._sum.credit || 0;
    }

return {
      ...targetWallet,
      viewEarnings,
      giftEarnings,
      referralEarnings,
      bonusEarnings,
    };
  }

  async withdraw(userId: string, dto: WithdrawDto) {
   // Pre-fetch everything that doesn't need atomic protection — outside the tx
    const preWallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!preWallet) throw new BadRequestException('Wallet not found');

    const kyc = await this.prisma.kYCRecord.findFirst({
      where: { userId, status: 'APPROVED' },
    });
    if (!kyc)
      throw new BadRequestException(
        'KYC must be completed and approved before withdrawal',
      );

    const eligible = await this.checkReferralUnlockEligibility(this.prisma, userId);

const { minWithdrawalInr: minWithdrawal, tdsPercentage: tdsPercent, platformFeePercentage: feePercent } =
      await this.platformService.getWithdrawalConfig();

    if (dto.amount < minWithdrawal) {
      throw new BadRequestException(`Minimum withdrawal amount is ₹${minWithdrawal}`);
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Re-fetch wallet inside tx to get the latest balance atomically
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new BadRequestException('Wallet not found');

      if (eligible && wallet.referralLockedBalance > 0) {
        const lockedAmount = wallet.referralLockedBalance;
        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            referralLockedBalance: { decrement: lockedAmount },
            withdrawableBalance: { increment: lockedAmount },
          },
        });
        await tx.walletLedger.create({
          data: {
            userId,
            walletId: wallet.id,
            source: 'ADJUSTMENT',
            sourceId: 'REFERRAL_UNLOCK',
            credit: lockedAmount,
            balanceAfter: wallet.withdrawableBalance + lockedAmount,
            description: `Unlocked ₹${lockedAmount.toFixed(2)} referral bonus (1 reel + KYC completed by both parties)`,
          },
        });
        wallet.withdrawableBalance += lockedAmount;
      }

      const pendingRequest = await tx.withdrawalRequest.findFirst({
        where: { walletId: wallet.id, status: 'PENDING' },
      });
      if (pendingRequest) {
        throw new BadRequestException('You already have a pending withdrawal request.');
      }

      if (wallet.withdrawableBalance < dto.amount) {
        throw new BadRequestException('Insufficient withdrawable balance');
      }

      const tdsDeducted = (dto.amount * tdsPercent) / 100;
      const platformFeeDeducted = (dto.amount * feePercent) / 100;
      const netPayable = dto.amount - tdsDeducted - platformFeeDeducted;

      // 1. Create Withdrawal Request
      const withdrawal = await tx.withdrawalRequest.create({
        data: {
          walletId: wallet.id,
          amount: dto.amount,
          netPayable: netPayable,
          status: 'PENDING',
          transactionId: dto.upiId, // Reusing field for UPI
        },
      });

      // 2. Lock the funds safely preventing race conditions
      let updatedWallet;
      try {
        updatedWallet = await tx.wallet.update({
          where: { id: wallet.id, withdrawableBalance: { gte: dto.amount } },
          data: { withdrawableBalance: { decrement: dto.amount } },
        });
      } catch (e) {
        throw new BadRequestException(
          'Insufficient balance or concurrent transaction detected.',
        );
      }

      // 3. Create Ledger Entry
      await tx.walletLedger.create({
        data: {
          userId: userId,
          walletId: wallet.id,
          source: 'WITHDRAWAL',
          sourceId: withdrawal.id,
          debit: dto.amount,
          balanceAfter: updatedWallet.withdrawableBalance,
          description: `Withdrawal Request to UPI: ${dto.upiId}`,
        },
      });

      // 4. Audit Log
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'WITHDRAWAL_REQUESTED',
          entityType: 'WithdrawalRequest',
          entityId: withdrawal.id,
          newValue: { amount: dto.amount, upi: dto.upiId },
        },
      });

      return withdrawal;
    });
  }

async createRazorpayOrder(userId: string, packageId: string) {
    const pkg = await this.prisma.coinPackage.findUnique({ where: { id: packageId } });
    if (!pkg || !pkg.isActive) throw new BadRequestException('Invalid or unavailable coin package');

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });

    const amountInPaise = pkg.priceInr * 100;
    const receiptId = `rcpt_${userId.slice(0, 8)}_${Date.now()}`;

    let order: any;
    try {
      order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: receiptId,
        notes: { userId, packageId },
      });
    } catch (e: any) {
      this.logger.error('Razorpay order creation failed', e?.message);
      throw new BadRequestException('Payment gateway error. Please try again.');
    }

    const coinsToCredit = pkg.coins + pkg.bonusCoins;

    await this.prisma.paymentRecord.create({
      data: {
        userId,
        packageId,
        razorpayOrderId: order.id,
        amount: pkg.priceInr,
        coinsToCredit,
        status: 'PENDING',
      },
    });

    this.logger.log(`Order created: ${order.id} | user: ${userId} | package: ${packageId}`);

    return {
      orderId: order.id,
      amount: amountInPaise,
      currency: 'INR',
      keyId: process.env.RAZORPAY_KEY_ID,
      packageTitle: pkg.title,
      coins: coinsToCredit,
    };
  }

  async verifyAndCreditCoins(userId: string, dto: VerifyPaymentDto) {
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(`${dto.razorpayOrderId}|${dto.razorpayPaymentId}`)
      .digest('hex');

    if (expectedSignature !== dto.razorpaySignature) {
      this.logger.warn(`Invalid signature | order: ${dto.razorpayOrderId} | user: ${userId}`);
      throw new BadRequestException('Payment verification failed. Invalid signature.');
    }

    const paymentRecord = await this.prisma.paymentRecord.findUnique({
      where: { razorpayOrderId: dto.razorpayOrderId },
    });

    if (!paymentRecord) throw new BadRequestException('Payment record not found.');
    if (paymentRecord.userId !== userId) throw new BadRequestException('Unauthorized payment.');

    if (paymentRecord.status === 'SUCCESS') {
      this.logger.warn(`Duplicate verify attempt | order: ${dto.razorpayOrderId} | user: ${userId}`);
      const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
      return { success: true, coinBalance: wallet?.coinBalance ?? 0, coinsAdded: 0, duplicate: true };
    }

    if (paymentRecord.status === 'FAILED' || paymentRecord.status === 'CANCELLED') {
      throw new BadRequestException('This payment was already marked as failed or cancelled.');
    }

    const pkg = await this.prisma.coinPackage.findUnique({ where: { id: paymentRecord.packageId } });
    if (!pkg || !pkg.isActive) throw new BadRequestException('Coin package no longer available.');

    const expectedCoins = pkg.coins + pkg.bonusCoins;
    if (paymentRecord.coinsToCredit !== expectedCoins || paymentRecord.amount !== pkg.priceInr) {
      this.logger.error(`Mismatch | order: ${dto.razorpayOrderId} | stored: ${paymentRecord.amount}/${paymentRecord.coinsToCredit} | pkg: ${pkg.priceInr}/${expectedCoins}`);
      throw new BadRequestException('Payment amount mismatch. Contact support.');
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });

    let gatewayPayment: any;
    try {
      gatewayPayment = await razorpay.payments.fetch(dto.razorpayPaymentId);
    } catch (e: any) {
      this.logger.error(`Gateway fetch failed | payment: ${dto.razorpayPaymentId}`, e?.message);
      throw new BadRequestException('Could not verify payment with gateway.');
    }

    if (gatewayPayment.status !== 'captured' && gatewayPayment.status !== 'authorized') {
      await this.prisma.paymentRecord.update({
        where: { razorpayOrderId: dto.razorpayOrderId },
        data: { status: 'FAILED', razorpayPaymentId: dto.razorpayPaymentId },
      });
      throw new BadRequestException('Payment was not successful.');
    }

    if (gatewayPayment.amount !== paymentRecord.amount * 100) {
      this.logger.error(`Amount mismatch | expected: ${paymentRecord.amount * 100} | got: ${gatewayPayment.amount}`);
      throw new BadRequestException('Payment amount mismatch with gateway.');
    }

    const updatedWallet = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const fresh = await tx.paymentRecord.findUnique({
        where: { razorpayOrderId: dto.razorpayOrderId },
        select: { status: true },
      });
      if (fresh?.status === 'SUCCESS') {
        return tx.wallet.findUnique({ where: { userId } });
      }

      await tx.paymentRecord.update({
        where: { razorpayOrderId: dto.razorpayOrderId },
        data: {
          status: 'SUCCESS',
          razorpayPaymentId: dto.razorpayPaymentId,
          paymentMethod: gatewayPayment.method ?? null,
          verifiedAt: new Date(),
        },
      });

      const wallet = await tx.wallet.upsert({
        where: { userId },
        create: { userId, coinBalance: paymentRecord.coinsToCredit },
        update: { coinBalance: { increment: paymentRecord.coinsToCredit } },
      });

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: 'COIN_RECHARGE',
          amount: paymentRecord.amount,
          coinsCredited: paymentRecord.coinsToCredit,
          currency: 'INR',
          status: 'SUCCESS',
          referenceId: dto.razorpayPaymentId,
          description: `Coin Recharge • ${paymentRecord.coinsToCredit} coins via Razorpay`,
        },
      });

      const openingCoins = wallet.coinBalance - paymentRecord.coinsToCredit;
      await tx.walletLedger.create({
        data: {
          userId,
          walletId: wallet.id,
          source: 'COIN_PURCHASE',
          sourceId: dto.razorpayPaymentId,
          credit: paymentRecord.amount,
          balanceAfter: wallet.withdrawableBalance,
          description: `${paymentRecord.coinsToCredit} coins credited. Opening: ${openingCoins}, Closing: ${wallet.coinBalance}. Ref: ${dto.razorpayPaymentId}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'COIN_RECHARGE_SUCCESS',
          entityType: 'PaymentRecord',
          entityId: dto.razorpayOrderId,
          newValue: {
            paymentId: dto.razorpayPaymentId,
            amount: paymentRecord.amount,
            coinsCredit: paymentRecord.coinsToCredit,
            packageId: paymentRecord.packageId,
          },
        },
      });

      return wallet;
    });

    this.logger.log(`Coins credited | ${paymentRecord.coinsToCredit} coins | user: ${userId} | payment: ${dto.razorpayPaymentId}`);

    this.notificationsService.createAndPush(
      {
        userId,
        type: 'SYSTEM',
        title: 'Coins Recharged!',
        body: `${paymentRecord.coinsToCredit} Pop Coins added to your wallet.`,
      },
      'Coins Recharged!',
      `${paymentRecord.coinsToCredit} Pop Coins added to your wallet.`,
    ).catch(() => {});

    return {
      success: true,
      coinBalance: updatedWallet?.coinBalance ?? 0,
      coinsAdded: paymentRecord.coinsToCredit,
      duplicate: false,
    };
  }

  async handleRazorpayWebhook(rawBody: Buffer, signature: string) {
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(rawBody)
      .digest('hex');

    if (expectedSignature !== signature) {
      this.logger.warn('Invalid webhook signature');
      throw new BadRequestException('Invalid webhook signature');
    }

    let event: any;
    try {
      event = JSON.parse(rawBody.toString());
    } catch {
      throw new BadRequestException('Invalid webhook payload');
    }

    this.logger.log(`Webhook received: ${event.event}`);

    if (event.event === 'payment.captured') {
      const payment = event.payload?.payment?.entity;
      if (!payment?.order_id) return { received: true };

      const record = await this.prisma.paymentRecord.findUnique({
        where: { razorpayOrderId: payment.order_id },
      });

      if (!record || record.status === 'SUCCESS') return { received: true };

      const signature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
        .update(`${payment.order_id}|${payment.id}`)
        .digest('hex');

      await this.verifyAndCreditCoins(record.userId, {
        razorpayOrderId: payment.order_id,
        razorpayPaymentId: payment.id,
        razorpaySignature: signature,
      }).catch((e: any) => {
        this.logger.error(`Webhook coin credit failed | order: ${payment.order_id} | ${e?.message}`);
      });
    }

    if (event.event === 'payment.failed') {
      const payment = event.payload?.payment?.entity;
      if (!payment?.order_id) return { received: true };

      await this.prisma.paymentRecord.updateMany({
        where: { razorpayOrderId: payment.order_id, status: 'PENDING' },
        data: { status: 'FAILED', razorpayPaymentId: payment.id },
      });

      this.logger.log(`Webhook payment.failed | order: ${payment.order_id}`);
    }

    if (event.event === 'refund.processed') {
      const refund = event.payload?.refund?.entity;
      if (!refund?.payment_id) return { received: true };

      await this.prisma.paymentRecord.updateMany({
        where: { razorpayPaymentId: refund.payment_id },
        data: { status: 'REFUNDED' },
      });

      this.logger.log(`Webhook refund.processed | payment: ${refund.payment_id}`);
    }

    return { received: true };
  }

  async getPaymentHistory(userId: string) {
    return this.prisma.paymentRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }

  async rechargeCoins(userId: string, dto: RechargeDto) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new BadRequestException('Wallet not found');

      let coinsToCredit = dto.coins;
      let amountPaid = dto.amount;

      if (dto.packageId) {
        const pkg = await tx.coinPackage.findUnique({ where: { id: dto.packageId } });
        if (!pkg || !pkg.isActive) throw new BadRequestException('Invalid or unavailable coin package');
        coinsToCredit = pkg.coins + pkg.bonusCoins;
        amountPaid = pkg.priceInr;
      }

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: 'COIN_RECHARGE',
          amount: amountPaid,
          coinsCredited: coinsToCredit,
          currency: 'INR',
          status: 'SUCCESS',
          referenceId: dto.paymentReference,
        },
      });

      return tx.wallet.update({
        where: { id: wallet.id },
        data: { coinBalance: { increment: coinsToCredit } },
      });
    });
  }
  async promotePendingToWithdrawable() {
    this.logger.log(
      'Starting promotion of pending balances to withdrawable...',
    );

    const wallets = await this.prisma.wallet.findMany({
      where: { pendingBalance: { gt: 0 } },
    });

    let promotedCount = 0;
    let totalPromoted = 0;

    for (const wallet of wallets) {
      const amount = wallet.pendingBalance;
      const updatedWallet = await this.prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          pendingBalance: 0,
          withdrawableBalance: { increment: amount },
        },
      });
      promotedCount++;
      totalPromoted += amount;

      await this.prisma.walletLedger.create({
        data: {
          userId: wallet.userId,
          walletId: wallet.id,
          source: 'ADJUSTMENT', // Fixed: Use ADJUSTMENT instead of REFERRAL_BONUS
          sourceId: 'PROMOTION_JOB',
          credit: amount,
          balanceAfter: updatedWallet.withdrawableBalance,
          description: `Promoted ₹${amount.toFixed(2)} from pending to withdrawable balance.`,
        },
      });
    }

    this.logger.log(
      `Promotion complete. ${promotedCount} wallets updated. Total ₹${totalPromoted} promoted.`,
    );
    return { success: true, promotedCount, totalPromoted };
  }
}
