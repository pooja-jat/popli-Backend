import { PrismaService } from '../prisma/prisma.service';

export interface ViewerRewardConfig {
  coinRewardPerView: number;
  maxDailyCoins: number;
}

export interface LikerRewardConfig {
  coinRewardPer2Likes: number;
  maxDailyCoins: number;
}

export async function getViewerRewardConfig(
  prisma: PrismaService,
): Promise<ViewerRewardConfig> {
  const [rewardConfig, maxConfig] = await Promise.all([
    prisma.systemConfig.findUnique({
      where: { key: 'VIEWER_COIN_REWARD_PER_VIEW' },
    }),
    prisma.systemConfig.findUnique({
      where: { key: 'VIEWER_COIN_MAX_DAILY' },
    }),
  ]);

  return {
    coinRewardPerView:
      rewardConfig && typeof rewardConfig.valueJson === 'number'
        ? rewardConfig.valueJson
        : 10,
    maxDailyCoins:
      maxConfig && typeof maxConfig.valueJson === 'number'
        ? maxConfig.valueJson
        : 200,
  };
}

export async function getLikerRewardConfig(
  prisma: PrismaService,
): Promise<LikerRewardConfig> {
  const [rewardConfig, maxConfig] = await Promise.all([
    prisma.systemConfig.findUnique({
      where: { key: 'LIKER_COIN_REWARD_PER_2_LIKES' },
    }),
    prisma.systemConfig.findUnique({
      where: { key: 'LIKER_COIN_MAX_DAILY' },
    }),
  ]);

  return {
    coinRewardPer2Likes:
      rewardConfig && typeof rewardConfig.valueJson === 'number'
        ? rewardConfig.valueJson
        : 1,
    maxDailyCoins:
      maxConfig && typeof maxConfig.valueJson === 'number'
        ? maxConfig.valueJson
        : 50,
  };
}