import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SystemService {
  constructor(private prisma: PrismaService) {}

  async getPublicConfigs() {
    const [configs, coinPackages, gifts] = await Promise.all([
      this.prisma.systemConfig.findMany({
        where: {
          key: {
            in: [
              'VIEW_RATE_PER_1000',
              'MIN_WITHDRAWAL_INR',
              'GIFT_CREATOR_SHARE_PERCENT',
              'VIEWER_COIN_REWARD_PER_VIEW',
              'VIEWER_COIN_MAX_DAILY',
              'LIKER_COIN_REWARD_PER_2_LIKES',
              'LIKER_COIN_MAX_DAILY',
              'COIN_PURCHASE_PRICE_PER_COIN',
              'COIN_WITHDRAWAL_REDEEM_RATE',
            ],
          },
        },
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

    const configMap: Record<string, any> = {};
    for (const c of configs) {
      configMap[c.key] = c.valueJson;
    }

    return {
      viewRatePer1000: configMap['VIEW_RATE_PER_1000'] ?? 5,
      minWithdrawalInr: configMap['MIN_WITHDRAWAL_INR'] ?? 500,
      giftCreatorSharePercent: configMap['GIFT_CREATOR_SHARE_PERCENT'] ?? 60,
      viewerCoinRewardPerView: configMap['VIEWER_COIN_REWARD_PER_VIEW'] ?? 10,
      viewerCoinMaxDaily: configMap['VIEWER_COIN_MAX_DAILY'] ?? 200,
      likerCoinRewardPer2Likes: configMap['LIKER_COIN_REWARD_PER_2_LIKES'] ?? 1,
      likerCoinMaxDaily: configMap['LIKER_COIN_MAX_DAILY'] ?? 50,
      coinPurchasePricePerCoin: configMap['COIN_PURCHASE_PRICE_PER_COIN'] ?? 1.25,
      coinWithdrawalRedeemRate: configMap['COIN_WITHDRAWAL_REDEEM_RATE'] ?? 0.85,
      coinPackages,
      gifts,
    };
  }
}