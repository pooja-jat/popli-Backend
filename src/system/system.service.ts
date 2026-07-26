import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SystemService {
  constructor(private prisma: PrismaService) {}

  async getConfigsByKeys(keys: string[]): Promise<Record<string, any>> {
    const configs = await this.prisma.systemConfig.findMany({
      where: { key: { in: keys } },
    });

    const missing = keys.filter((k) => !configs.find((c) => c.key === k));
    if (missing.length > 0) {
      throw new NotFoundException(
        `The following configuration keys are not set in the database: ${missing.join(', ')}. ` +
          `Please set them via the Admin Panel before they can be used.`,
      );
    }

    const result: Record<string, any> = {};
    for (const c of configs) {
      result[c.key] = c.valueJson;
    }
    return result;
  }

  async getPublicConfigs() {
    const PUBLIC_KEYS = [
      'VIEW_RATE_PER_1000',
      'MIN_WITHDRAWAL_INR',
      'GIFT_CREATOR_SHARE_PERCENT',
      'GIFT_COIN_TO_INR_RATE',
      'VIEWER_COIN_REWARD_PER_VIEW',
      'VIEWER_COIN_MAX_DAILY',
      'LIKER_COIN_REWARD_PER_2_LIKES',
      'LIKER_COIN_MAX_DAILY',
      'COIN_PURCHASE_PRICE_PER_COIN',
      'COIN_WITHDRAWAL_REDEEM_RATE',
      'TDS_PERCENTAGE',
      'PLATFORM_FEE_PERCENTAGE',
      'REFERRAL_CREATOR_REWARD',
      'REFERRAL_STANDARD_REWARD',
      'REFERRAL_SUPER_REWARD',
    ];

    const [configs, coinPackages, gifts] = await Promise.all([
      this.prisma.systemConfig.findMany({
        where: { key: { in: PUBLIC_KEYS } },
      }),
      this.prisma.coinPackage.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          title: true,
          coins: true,
          bonusCoins: true,
          priceInr: true,
          badge: true,
          badgeColor: true,
          description: true,
          isPopular: true,
          isRecommended: true,
          sortOrder: true,
        },
      }),
      this.prisma.gift.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    const missing = PUBLIC_KEYS.filter((k) => !configs.find((c) => c.key === k));
    if (missing.length > 0) {
      throw new NotFoundException(
        `Missing required platform configurations: ${missing.join(', ')}. ` +
          `Run the database seed or set these values via the Admin Panel.`,
      );
    }

    const configMap: Record<string, any> = {};
    for (const c of configs) {
      configMap[c.key] = c.valueJson;
    }

    return {
      viewRatePer1000: configMap['VIEW_RATE_PER_1000'],
      minWithdrawalInr: configMap['MIN_WITHDRAWAL_INR'],
      giftCreatorSharePercent: configMap['GIFT_CREATOR_SHARE_PERCENT'],
      giftCoinToInrRate: configMap['GIFT_COIN_TO_INR_RATE'],
      viewerCoinRewardPerView: configMap['VIEWER_COIN_REWARD_PER_VIEW'],
      viewerCoinMaxDaily: configMap['VIEWER_COIN_MAX_DAILY'],
      likerCoinRewardPer2Likes: configMap['LIKER_COIN_REWARD_PER_2_LIKES'],
      likerCoinMaxDaily: configMap['LIKER_COIN_MAX_DAILY'],
      coinPurchasePricePerCoin: configMap['COIN_PURCHASE_PRICE_PER_COIN'],
      coinWithdrawalRedeemRate: configMap['COIN_WITHDRAWAL_REDEEM_RATE'],
      tdsPercentage: configMap['TDS_PERCENTAGE'],
      platformFeePercentage: configMap['PLATFORM_FEE_PERCENTAGE'],
      referralCreatorReward: configMap['REFERRAL_CREATOR_REWARD'],
      referralStandardReward: configMap['REFERRAL_STANDARD_REWARD'],
      referralSuperReward: configMap['REFERRAL_SUPER_REWARD'],
      coinPackages,
      gifts,
    };
  }
}